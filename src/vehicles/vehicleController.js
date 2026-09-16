import * as THREE from 'three'
import { VEHICLE, WORLD } from '../config/gameConfig.js'
import { terrainHeight } from '../world/terrain.js'
import { clamp, damp } from '../world/noise.js'

/**
 * Arcade vehicle maths - pure and testable.
 *
 * The body stays fully dynamic (gravity, collisions, being pushed) but its
 * rotations are locked and rewritten from four terrain samples every step,
 * which is what makes the minibus feel planted instead of tippy. All forces go
 * in as impulses so Rapier still resolves contacts.
 */

/**
 * @param {{position:number[], rotation:number}} spawn the vehicle's spawn entry.
 *   Its parking spot doubles as the "home" the rescue teleports back to.
 */
export function createVehicleState(spawn) {
  const [homeX, , homeZ] = spawn.position
  return {
    yaw: spawn.rotation,
    pitch: 0,
    roll: 0,
    wheelSpin: 0,
    steer: 0,
    unstickCooldown: 0,
    /** Seconds spent underwater (drives the "get it out of the sea" rescue). */
    submergedFor: 0,
    /** Where the rescue hatch puts the vehicle back. */
    home: { x: homeX, y: spawn.position[1] ?? 0, z: homeZ, yaw: spawn.rotation },
  }
}

/** Beyond this the terrain mesh has ended and nothing can support a vehicle. */
const GRID_LIMIT = WORLD.size / 2 - 6

const scratchEuler = new THREE.Euler()
const scratchQuaternion = new THREE.Quaternion()

/**
 * @param {object} params
 * @param {import('@dimforge/rapier3d-compat').RigidBody} params.body
 * @param {number} params.dt
 * @param {object} params.state   from createVehicleState()
 * @param {object} params.input   { forward, back, left, right, handbrake }
 * @returns {{forwardSpeed:number, speedKmh:number, reset:boolean}}
 */
export function stepVehicle({ body, dt, state, input }) {
  const translation = body.translation()
  const velocity = body.linvel()
  const mass = body.mass() || VEHICLE.mass

  let yaw = state.yaw
  const forwardX = -Math.sin(yaw)
  const forwardZ = -Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)

  const forwardSpeed = velocity.x * forwardX + velocity.z * forwardZ
  const lateralSpeed = velocity.x * rightX + velocity.z * rightZ

  const speedRatio = clamp(Math.abs(forwardSpeed) / VEHICLE.maxSpeed, 0, 1)

  /* ----- pedals ----- */
  const throttle = Boolean(input.forward)
  const reverse = Boolean(input.back)
  // Torque falls off with speed: punchy off the line, lazy at the top end.
  const torque = 1 - VEHICLE.torqueFalloff * speedRatio * speedRatio

  let accel = 0
  if (throttle) {
    accel = forwardSpeed < -0.6 ? VEHICLE.brakeDecel : VEHICLE.engineAccel * torque
  } else if (reverse) {
    accel = forwardSpeed > 0.6 ? -VEHICLE.brakeDecel : -VEHICLE.reverseAccel * torque
  }
  if (input.handbrake) accel *= 0.12

  // Rolling resistance only ever opposes motion, and only while coasting.
  let coast = 0
  if (!throttle && !reverse && forwardSpeed !== 0) {
    const resistance = VEHICLE.rollResist + Math.abs(forwardSpeed) * VEHICLE.coastDrag
    coast = -Math.sign(forwardSpeed) * resistance
  }

  /* ----- steering ----- */
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0)
  const steerRate =
    VEHICLE.steerRateLow + (VEHICLE.steerRateHigh - VEHICLE.steerRateLow) * speedRatio
  // Zero authority below the deadzone (a bus cannot pirouette on the spot) and
  // full authority above steerMinSpeed; reverse steers the other way.
  const authority = clamp(
    (Math.abs(forwardSpeed) - VEHICLE.steerDeadzone) /
      Math.max(VEHICLE.steerMinSpeed - VEHICLE.steerDeadzone, 1e-3),
    0,
    1,
  )
  const direction = forwardSpeed < -0.2 ? -1 : 1
  yaw += steerInput * steerRate * authority * direction * (input.handbrake ? 1.45 : 1) * dt

  /* ----- forces ----- */
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z)
  // Parking brake / static friction: with no pedal pressed the bus is pinned,
  // so it can neither creep nor roll away down a hill.
  const parked = !throttle && !reverse && horizontalSpeed < VEHICLE.parkSpeed

  let forwardImpulse
  let lateralImpulse
  if (parked) {
    forwardImpulse = -forwardSpeed * mass
    lateralImpulse = -lateralSpeed * mass
  } else {
    // Speed governor: never overshoot the configured top / reverse speed.
    let drive = accel + coast
    const projected = forwardSpeed + drive * dt
    if (projected > VEHICLE.maxSpeed) drive = (VEHICLE.maxSpeed - forwardSpeed) / dt
    else if (projected < -VEHICLE.maxReverseSpeed) {
      drive = (-VEHICLE.maxReverseSpeed - forwardSpeed) / dt
    }
    forwardImpulse = drive * mass * dt

    const gripRate = input.handbrake ? VEHICLE.lateralGrip * 0.2 : VEHICLE.lateralGrip
    lateralImpulse = -lateralSpeed * clamp(gripRate * dt, 0, 1) * mass
  }

  body.applyImpulse(
    {
      x: forwardX * forwardImpulse + rightX * lateralImpulse,
      y: -VEHICLE.downforce * Math.abs(forwardSpeed) * mass * dt,
      z: forwardZ * forwardImpulse + rightZ * lateralImpulse,
    },
    true,
  )

  /* ----- orientation follows the ground ----- */
  const halfTrack = VEHICLE.chassis.halfWidth
  const halfWheelbase = VEHICLE.chassis.halfLength
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)

  const sample = (localX, localZ) => {
    const x = translation.x + localX * cos + localZ * sin
    const z = translation.z - localX * sin + localZ * cos
    return Math.max(terrainHeight(x, z), -2)
  }

  const frontZ = -halfWheelbase * 0.82
  const rearZ = halfWheelbase * 0.82
  const leftOffset = -halfTrack * 0.9
  const rightOffset = halfTrack * 0.9

  const frontGround = (sample(leftOffset, frontZ) + sample(rightOffset, frontZ)) * 0.5
  const rearGround = (sample(leftOffset, rearZ) + sample(rightOffset, rearZ)) * 0.5
  const leftGround = (sample(leftOffset, frontZ) + sample(leftOffset, rearZ)) * 0.5
  const rightGround = (sample(rightOffset, frontZ) + sample(rightOffset, rearZ)) * 0.5

  const smoothing = damp(7, dt)
  state.pitch += (Math.atan2(frontGround - rearGround, halfWheelbase * 1.64) - state.pitch) * smoothing
  state.roll += (Math.atan2(rightGround - leftGround, halfTrack * 1.8) - state.roll) * smoothing
  state.yaw = yaw

  scratchEuler.set(state.pitch, yaw, state.roll, 'YXZ')
  scratchQuaternion.setFromEuler(scratchEuler)
  body.setRotation(scratchQuaternion, true)

  /* ----- escape hatches ----- */
  const restingY = terrainHeight(translation.x, translation.z) + VEHICLE.chassis.halfHeight
  const stuck = translation.y < restingY - 0.4 && Math.abs(forwardSpeed) < 4

  let reset = false
  if (input.reset) {
    state.pitch = 0
    state.roll = 0
    state.unstickCooldown = 0
    body.setTranslation(
      {
        x: translation.x,
        y: terrainHeight(translation.x, translation.z) + VEHICLE.chassis.halfHeight + 0.5,
        z: translation.z,
      },
      true,
    )
    scratchEuler.set(0, yaw, 0, 'YXZ')
    scratchQuaternion.setFromEuler(scratchEuler)
    body.setRotation(scratchQuaternion, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    reset = true
  } else if (stuck) {
    // Wedged in a ditch or against the terrain: nudge it up at most once a second.
    state.unstickCooldown -= dt
    if (state.unstickCooldown <= 0) {
      state.unstickCooldown = 1
      body.applyImpulse({ x: 0, y: mass * 2.4, z: 0 }, true)
    }
  } else {
    state.unstickCooldown = 0
  }

  /* ----- water and the edge of the world ----- */
  // The sea is not drivable: once the bus is properly under, it is fished back
  // out and returned to where it was parked.
  state.submergedFor = translation.y < WORLD.seaLevel - 0.6 ? state.submergedFor + dt : 0
  const drowned = state.submergedFor > 1.6

  // Past the edge of the terrain mesh (or through a hole in it) nothing can
  // support the bus, so it is returned to its parking spot.
  const outsideGrid =
    Math.abs(translation.x) > GRID_LIMIT || Math.abs(translation.z) > GRID_LIMIT
  const fellThrough = translation.y < terrainHeight(translation.x, translation.z) - 12

  if (!reset && (drowned || outsideGrid || fellThrough)) {
    rescueToHome(body, state)
    state.submergedFor = 0
    return {
      forwardSpeed: 0,
      speedKmh: 0,
      reset: true,
      reason: drowned ? 'water' : 'world',
    }
  }

  return {
    forwardSpeed,
    speedKmh: Math.abs(forwardSpeed) * 3.6,
    reset,
    reason: reset ? 'driver' : null,
  }
}

/** Teleport a body back to its parking spot, upright and at rest. */
function rescueToHome(body, state) {
  const { x, y, z, yaw } = state.home
  const ground = y || terrainHeight(x, z)
  body.setTranslation(
    { x, y: Math.max(ground, terrainHeight(x, z)) + VEHICLE.chassis.halfHeight + 0.4, z },
    true,
  )
  scratchEuler.set(0, yaw, 0, 'YXZ')
  scratchQuaternion.setFromEuler(scratchEuler)
  body.setRotation(scratchQuaternion, true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  state.yaw = yaw
  state.pitch = 0
  state.roll = 0
}

/** Wheel spin + visual steering angle, advanced from the live speed. */
export function updateVehicleVisuals(state, dt, forwardSpeed, steerInput) {
  state.wheelSpin += (forwardSpeed / 0.42) * dt
  state.steer += (steerInput * 0.42 - state.steer) * damp(10, dt)
  return state
}
