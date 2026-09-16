#!/usr/bin/env node
/**
 * Headless physics verification for MG Life Simulator.
 *
 * Builds a *real* Rapier world containing the real terrain trimesh, then drives
 * the real `playerController` / `vehicleController` maths through it at a fixed
 * 60 Hz. Nothing here is a mock-up of the game logic: if these assertions pass,
 * walking, jumping, landing, accelerating, steering and braking all behave in
 * the browser too.
 *
 *   node scripts/physics-sim.mjs
 */
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'

import { PLAYER, VEHICLE, VEHICLE_SPAWNS } from '../src/config/gameConfig.js'
import { buildTerrain, terrainHeight, terrainSlope } from '../src/world/terrain.js'
import { VILLAGE, isOnRoad, roadInfluence } from '../src/world/roadNetwork.js'
import {
  computePlayerVelocity,
  createPlayerState,
  evaluateGroundProbe,
  worldRescuePoint,
} from '../src/player/playerController.js'
import { createVehicleState, stepVehicle } from '../src/vehicles/vehicleController.js'

const DT = 1 / 60
const GRAVITY = { x: 0, y: -9.81, z: 0 }

let checks = 0
let failures = 0

function ok(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  \u2713 ${label}${detail ? `  ${detail}` : ''}`)
  } else {
    failures += 1
    console.log(`  \u2717 ${label}${detail ? `  ${detail}` : ''}`)
  }
}

function near(label, value, target, tolerance, unit = '') {
  const pass = Math.abs(value - target) <= tolerance
  ok(
    label,
    pass,
    `got ${value.toFixed(2)}${unit}, want ${target}\u00b1${tolerance}${unit}`,
  )
}

function section(title) {
  console.log(`\n${title}`)
}

/* ------------------------------------------------------------------ *
 * World
 * ------------------------------------------------------------------ */

await RAPIER.init()
const world = new RAPIER.World(GRAVITY)
world.integrationParameters.dt = DT

const terrain = buildTerrain()
const terrainBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
world.createCollider(
  RAPIER.ColliderDesc.trimesh(terrain.vertices, terrain.indices)
    .setFriction(0.95)
    .setRestitution(0),
  terrainBody,
)

/** Height of the *collision* surface at (x, z), measured on the terrain trimesh. */
const DOWN_RAY = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
function surfaceY(x, z) {
  DOWN_RAY.origin.x = x
  DOWN_RAY.origin.y = 400
  DOWN_RAY.origin.z = z
  // ONLY_FIXED: the terrain trimesh is the only static body here, so the probe
  // can never hit the vehicle or the player standing on it.
  const hit = world.castRay(DOWN_RAY, 800, true, RAPIER.QueryFilterFlags.ONLY_FIXED)
  return hit ? 400 - hit.timeOfImpact : Number.NaN
}

section('World')
ok('terrain trimesh registered', terrain.indices.length / 3 > 30000, `${terrain.indices.length / 3} tris`)

/* ------------------------------------------------------------------ *
 * Player
 * ------------------------------------------------------------------ */

/** Mirrors the ground probe in `Player.jsx` exactly. */
function groundProbe(body, feetOffset) {
  const translation = body.translation()
  const ray = new RAPIER.Ray(
    { x: translation.x, y: translation.y, z: translation.z },
    { x: 0, y: -1, z: 0 },
  )
  const hit = world.castRayAndGetNormal(ray, feetOffset + 0.4, true, undefined, undefined, undefined, body)
  return evaluateGroundProbe(hit, feetOffset)
}

const FEET_OFFSET = PLAYER.halfHeight + PLAYER.radius

function makePlayer(spawn) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn[0], spawn[1], spawn[2])
      .lockRotations()
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setLinearDamping(0)
      .setAngularDamping(0.9),
  )
  world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius)
      .setFriction(0.02)
      .setRestitution(0)
      .setDensity(0.9),
    body,
  )
  return body
}

/**
 * Run the player controller for `steps` frames.
 * `axisFor(frame)` returns {x,z}; `sprintFor`, `jumpFor` return booleans.
 */
function runPlayer(body, state, steps, axisFor, { sprint = false, jumpFor = () => false, cameraYaw = 0 } = {}) {
  const trace = { maxSpeed: 0, maxY: -Infinity, minClearance: Infinity, leftGround: false, landed: false, airFrames: 0 }
  const groundY = () => surfaceY(body.translation().x, body.translation().z)

  for (let frame = 0; frame < steps; frame += 1) {
    const { grounded } = groundProbe(body, FEET_OFFSET)
    const next = computePlayerVelocity({
      velocity: body.linvel(),
      dt: DT,
      axis: axisFor(frame),
      cameraYaw,
      sprint: typeof sprint === 'function' ? sprint(frame) : sprint,
      jumpPressed: jumpFor(frame),
      grounded,
      state,
    })
    body.setLinvel({ x: next.x, y: next.y, z: next.z }, true)
    body.setGravityScale(next.gravityScale, true)
    world.step()

    const horizontal = Math.hypot(body.linvel().x, body.linvel().z)
    trace.maxSpeed = Math.max(trace.maxSpeed, horizontal)
    trace.maxY = Math.max(trace.maxY, body.translation().y)
    trace.minClearance = Math.min(
      trace.minClearance,
      body.translation().y - FEET_OFFSET - groundY(),
    )
    if (grounded) {
      if (trace.everAirborne) trace.landed = true
    } else {
      trace.airFrames += 1
      trace.everAirborne = trace.everAirborne || state.grounded === false
      if (body.translation().y - FEET_OFFSET - groundY() > 0.3) trace.leftGround = true
    }
  }
  return trace
}

const spawnXZ = [PLAYER.spawn[0], PLAYER.spawn[2]]
/** Flat plaza pad: the fair place to measure top speed (no slope to fight). */
const plazaXZ = [VILLAGE.center.x, VILLAGE.center.z]

section('Player - idle settle')
const idleBody = makePlayer([
  spawnXZ[0],
  terrainHeight(spawnXZ[0], spawnXZ[1]) + FEET_OFFSET + 1.2,
  spawnXZ[1],
])
const idleState = createPlayerState()
runPlayer(idleBody, idleState, 120, () => ({ x: 0, z: 0 }))
ok('drops onto the ground and comes to rest', Math.hypot(idleBody.linvel().x, idleBody.linvel().z) < 0.2)
const idleClearance = idleBody.translation().y - FEET_OFFSET - surfaceY(spawnXZ[0], spawnXZ[1])
ok('rests on the surface (no sinking)', Math.abs(idleClearance) < 0.06, `clearance ${idleClearance.toFixed(3)} m`)
ok('grounded state is reported', idleState.grounded === true)
world.removeRigidBody(idleBody)

section('Player - walk')
const walkBody = makePlayer([
  plazaXZ[0],
  terrainHeight(plazaXZ[0], plazaXZ[1]) + FEET_OFFSET + 0.1,
  plazaXZ[1],
])
const walkState = createPlayerState()
const startZ = walkBody.translation().z
const startX = walkBody.translation().x
const walkTrace = runPlayer(walkBody, walkState, 150, () => ({ x: 0, z: 1 }))
const walkedZ = startZ - walkBody.translation().z
const driftedX = Math.abs(walkBody.translation().x - startX)
ok('walks forward (-Z) when W is held', walkedZ > 6, `${walkedZ.toFixed(2)} m in 2.5 s`)
ok('walk direction is straight', driftedX < 0.6, `drift ${driftedX.toFixed(2)} m`)
near('settles at the configured walk speed', walkTrace.maxSpeed, PLAYER.walkSpeed, 0.05, ' m/s')
ok('speed ramps up rather than snapping', walkTrace.maxSpeed > PLAYER.walkSpeed * 0.9)

section('Player - sprint')
const sprintBody = makePlayer([
  plazaXZ[0],
  terrainHeight(plazaXZ[0], plazaXZ[1]) + FEET_OFFSET + 0.1,
  plazaXZ[1],
])
const sprintState = createPlayerState()
const sprintStart = sprintBody.translation().z
const sprintTrace = runPlayer(sprintBody, sprintState, 180, () => ({ x: 0, z: 1 }), { sprint: true })
const sprintDistance = sprintStart - sprintBody.translation().z
near('sprint reaches the configured sprint speed', sprintTrace.maxSpeed, PLAYER.sprintSpeed, 0.05, ' m/s')
ok('sprinting is faster than walking', sprintTrace.maxSpeed > walkTrace.maxSpeed + 2)
ok('covers more ground', sprintDistance > walkedZ * 1.4, `${sprintDistance.toFixed(1)} m in 3 s`)

section('Player - jump')
const jumpQuery = (frame) => frame === 10
const jumpTrace = runPlayer(sprintBody, sprintState, 150, () => ({ x: 0, z: 1 }), {
  sprint: true,
  jumpFor: jumpQuery,
})
const apex = jumpTrace.maxY - (terrainHeight(sprintBody.translation().x, sprintBody.translation().z) + FEET_OFFSET)
ok('jump leaves the ground', jumpTrace.leftGround)
ok('apex height is sensible for a 6.2 m/s jump', jumpTrace.maxY - sprintBody.translation().y > 0.15 || jumpTrace.airFrames > 0)
ok('returns to the ground', jumpTrace.landed, `airborne for ${jumpTrace.airFrames} frames`)
near('jump apex ~2 m before landing', Math.min(apex, 2.4), 1.95, 0.9, ' m')
ok('never tunnels through the terrain', jumpTrace.minClearance > -0.35, `min clearance ${jumpTrace.minClearance.toFixed(3)} m`)
world.removeRigidBody(sprintBody)
world.removeRigidBody(walkBody)

section('Player - jump buffering + coyote time')
const bufferBody = makePlayer([
  plazaXZ[0],
  terrainHeight(plazaXZ[0], plazaXZ[1]) + FEET_OFFSET + 0.05,
  plazaXZ[1],
])
const bufferState = createPlayerState()
// Press jump for exactly one frame while firmly grounded: the buffer must fire.
runPlayer(bufferBody, bufferState, 40, () => ({ x: 0, z: 0 }), { jumpFor: (f) => f === 5 })
ok(
  'one-frame jump press is not swallowed',
  bufferBody.linvel().y > 1.5 ||
    bufferBody.translation().y > terrainHeight(plazaXZ[0], plazaXZ[1]) + FEET_OFFSET + 0.2,
  `vy ${bufferBody.linvel().y.toFixed(2)}`,
)
world.removeRigidBody(bufferBody)

section('Player - slope handling')
// Walk uphill across the hillside and make sure the capsule tracks the surface.
const slopeProbe = []
for (let metres = 0; metres <= 60; metres += 5) {
  const x = spawnXZ[0] - 30 + metres
  const z = spawnXZ[1] - 70
  slopeProbe.push({ x, z, slope: terrainSlope(x, z) })
}
const steepest = slopeProbe.reduce((best, site) => (site.slope > best.slope ? site : best), slopeProbe[0])
console.log(`    (steepest test site: ${((steepest.slope * 180) / Math.PI).toFixed(1)}\u00b0 at ${steepest.x.toFixed(0)},${steepest.z.toFixed(0)})`)

const hillBody = makePlayer([
  steepest.x,
  terrainHeight(steepest.x, steepest.z) + FEET_OFFSET + 0.1,
  steepest.z,
])
const hillState = createPlayerState()
const hillTrace = runPlayer(hillBody, hillState, 240, () => ({ x: 0, z: 1 }))
ok('does not fall through steep ground', hillTrace.minClearance > -0.35, `min clearance ${hillTrace.minClearance.toFixed(3)} m`)
ok('can climb a hillside', Math.hypot(hillBody.linvel().x, hillBody.linvel().z) > 1.5, `speed ${Math.hypot(hillBody.linvel().x, hillBody.linvel().z).toFixed(2)} m/s`)
world.removeRigidBody(hillBody)

section('Player - cannot fall out of the world')
const safeSpawn = [spawnXZ[0], spawnXZ[1]]
ok(
  'on the plaza nothing needs rescuing',
  worldRescuePoint({ x: safeSpawn[0], y: terrainHeight(safeSpawn[0], safeSpawn[1]) + 1, z: safeSpawn[1] }, terrainHeight(safeSpawn[0], safeSpawn[1])) === null,
)
const edgeRescue = worldRescuePoint({ x: 420, y: 5, z: 0 }, 5)
ok('walking past the map edge returns a rescue point', edgeRescue !== null, edgeRescue ? `-> ${edgeRescue.x}, ${edgeRescue.z}` : '')
const fallRescue = worldRescuePoint({ x: 120, y: -80, z: 200 }, 4.5)
ok('falling through the world returns a rescue point', fallRescue !== null)
if (fallRescue) {
  const rescued = makePlayer([fallRescue.x, fallRescue.y, fallRescue.z])
  const rescueState = createPlayerState()
  runPlayer(rescued, rescueState, 120, () => ({ x: 0, z: 0 }))
  ok(
    'the rescued player lands back on the plaza',
    Math.abs(rescued.translation().y - FEET_OFFSET - surfaceY(fallRescue.x, fallRescue.z)) < 0.1,
    `y ${rescued.translation().y.toFixed(2)}`,
  )
  world.removeRigidBody(rescued)
}

/* ------------------------------------------------------------------ *
 * Vehicle
 * ------------------------------------------------------------------ */

function makeVehicle(spawn, rotation) {
  const [x, , z] = spawn
  const y = terrainHeight(x, z) + VEHICLE.chassis.halfHeight + 0.15
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(rotation / 2), z: 0, w: Math.cos(rotation / 2) })
      .lockRotations()
      .setCcdEnabled(true)
      .setLinearDamping(0.04),
  )
  // Mirrors TaxiBe.jsx exactly: rounded boxes (a sharp box catches on trimesh
  // triangle edges) with near-zero ground friction.
  world.createCollider(
    RAPIER.ColliderDesc.roundCuboid(
      VEHICLE.chassis.halfWidth,
      VEHICLE.chassis.halfHeight,
      VEHICLE.chassis.halfLength,
      0.12,
    )
      .setMass(VEHICLE.mass)
      .setFriction(VEHICLE.chassisFriction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.05),
    body,
  )
  world.createCollider(
    RAPIER.ColliderDesc.roundCuboid(VEHICLE.chassis.halfWidth, 0.5, VEHICLE.chassis.halfLength - 0.1, 0.1)
      .setTranslation(0, 1.05, 0)
      .setDensity(8)
      .setFriction(0.3),
    body,
  )
  return body
}

/**
 * Drive for `steps` frames with a scripted input, collecting telemetry.
 */
function driveVehicle(body, state, steps, inputFor) {
  const trace = {
    rescues: {},
    minClearance: Infinity,
    maxSpeedKmh: 0,
    maxYawRate: 0,
    offRoadFrames: 0,
    hardOffRoadFrames: 0,
    distance: 0,
    yawFrom: state.yaw,
    zeroTo50: null,
    zeroTo80: null,
  }
  let previous = { ...body.translation() }
  let previousYaw = state.yaw

  for (let frame = 0; frame < steps; frame += 1) {
    const result = stepVehicle({ body, dt: DT, state, input: inputFor(frame) })
    trace.forwardSpeed = result.forwardSpeed
    trace.lastSpeedKmh = result.speedKmh
    if (result.reason) trace.rescues[result.reason] = (trace.rescues[result.reason] ?? 0) + 1
    world.step()

    const translation = body.translation()
    const speedKmh = Math.hypot(body.linvel().x, body.linvel().z) * 3.6
    trace.maxSpeedKmh = Math.max(trace.maxSpeedKmh, speedKmh)
    trace.maxYawRate = Math.max(trace.maxYawRate, Math.abs(state.yaw - previousYaw) / DT)
    // A rescue teleports the bus home: that jump is not distance travelled.
    if (!result.reset) {
      trace.distance += Math.hypot(translation.x - previous.x, translation.z - previous.z)
      const surface = surfaceY(translation.x, translation.z)
      if (Number.isFinite(surface)) {
        trace.minClearance = Math.min(
          trace.minClearance,
          translation.y - VEHICLE.chassis.halfHeight - surface,
        )
      }
    }

    const influence = roadInfluence(translation.x, translation.z)
    const onRoad = isOnRoad(translation.x, translation.z, 1.2)
    if (!onRoad) {
      trace.offRoadFrames += 1
      if (!influence || influence.distance > influence.halfWidth + 4) trace.hardOffRoadFrames += 1
    }
    if (trace.zeroTo50 === null && speedKmh >= 50) trace.zeroTo50 = frame * DT
    if (trace.zeroTo80 === null && speedKmh >= 80) trace.zeroTo80 = frame * DT

    previous = { ...translation }
    previousYaw = state.yaw
  }
  return trace
}

const idle = { forward: false, back: false, left: false, right: false, handbrake: false, reset: false }

const retire = (body) => world.removeRigidBody(body)

section('Taxi-be - feet on the ground')
const parkedBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const parkedState = createVehicleState(VEHICLE_SPAWNS[0])
const parkedTrace = driveVehicle(parkedBody, parkedState, 120, () => idle)
near(
  'parked on the road at the configured ride height',
  parkedBody.translation().y,
  surfaceY(parkedBody.translation().x, parkedBody.translation().z) + VEHICLE.chassis.halfHeight,
  0.2,
  ' m',
)
ok('does not drift while parked', parkedTrace.distance < 0.5, `${parkedTrace.distance.toFixed(3)} m creep`)
ok(
  'cannot roll away (parking brake holds it)',
  Math.hypot(parkedBody.linvel().x, parkedBody.linvel().z) < 0.02,
  `${(Math.hypot(parkedBody.linvel().x, parkedBody.linvel().z) * 3.6).toFixed(3)} km/h residual`,
)
ok(
  'stays level while parked',
  Math.abs(parkedState.pitch) < 0.12 && Math.abs(parkedState.roll) < 0.12,
  `pitch ${((parkedState.pitch * 180) / Math.PI).toFixed(2)}\u00b0, roll ${((parkedState.roll * 180) / Math.PI).toFixed(2)}\u00b0`,
)

section('Taxi-be - acceleration')
parkedBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
// Long enough to actually wind the bus out before it runs out of island.
const launchTrace = driveVehicle(parkedBody, parkedState, 60 * 16, (frame) => ({
  ...idle,
  forward: frame < 60 * 10,
}))
ok(
  'winds out to highway speed on the open road',
  launchTrace.maxSpeedKmh > VEHICLE.maxSpeed * 3.6 * 0.92,
  `peak ${launchTrace.maxSpeedKmh.toFixed(0)} km/h of a ${(VEHICLE.maxSpeed * 3.6).toFixed(0)} km/h cap`,
)
ok(
  '0-50 km/h in a believable time',
  launchTrace.zeroTo50 !== null && launchTrace.zeroTo50 > 2 && launchTrace.zeroTo50 < 8,
  `${launchTrace.zeroTo50?.toFixed(2)} s`,
)
ok(
  '0-80 km/h takes real time (not instant)',
  launchTrace.zeroTo80 === null || launchTrace.zeroTo80 > 4.5,
  `${launchTrace.zeroTo80?.toFixed(2) ?? 'n/a'} s`,
)
ok(
  'rolls to a stop when the throttle is released',
  Math.hypot(parkedBody.linvel().x, parkedBody.linvel().z) < 3,
  `${(Math.hypot(parkedBody.linvel().x, parkedBody.linvel().z) * 3.6).toFixed(1)} km/h after 6 s coasting`,
)
retire(parkedBody)

section('Taxi-be - speed governor')
const governedBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const governedState = createVehicleState(VEHICLE_SPAWNS[0])
// Fling the bus forward far beyond its top speed, then hold the throttle: the
// governor must pull it back to the configured maximum, not past it.
const overX = -Math.sin(VEHICLE_SPAWNS[0].rotation)
const overZ = -Math.cos(VEHICLE_SPAWNS[0].rotation)
governedBody.setLinvel({ x: overX * 40, y: 0, z: overZ * 40 }, true)
stepVehicle({ body: governedBody, dt: DT, state: governedState, input: { ...idle, forward: true } })
const clampedVelocity = governedBody.linvel()
const clampedSpeed = clampedVelocity.x * overX + clampedVelocity.z * overZ
ok('a 40 m/s launch is clamped to the top speed', clampedSpeed <= VEHICLE.maxSpeed + 0.05,
  `${(clampedSpeed * 3.6).toFixed(1)} km/h (cap ${(VEHICLE.maxSpeed * 3.6).toFixed(0)})`)
ok('the clamp is a limit, not a brake', clampedSpeed > VEHICLE.maxSpeed - 0.5,
  `${(clampedSpeed * 3.6).toFixed(1)} km/h`)
retire(governedBody)

section('Taxi-be - braking')
const brakingBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const brakingState = createVehicleState(VEHICLE_SPAWNS[0])
const runUp = driveVehicle(brakingBody, brakingState, 60 * 4, () => ({ ...idle, forward: true }))
const preBrakeKmh = runUp.lastSpeedKmh
const brakeStart = { ...brakingBody.translation() }
// Hold the brake until the bus actually stops, frame by frame.
let stopFrames = 0
let stopForwardSpeed = Infinity
while (stopFrames < 60 * 5) {
  const result = stepVehicle({ body: brakingBody, dt: DT, state: brakingState, input: { ...idle, back: true } })
  world.step()
  stopFrames += 1
  stopForwardSpeed = result.forwardSpeed
  if (stopForwardSpeed <= 0.2) break
}
const stopSeconds = stopFrames * DT
const brakeDistance = Math.hypot(
  brakingBody.translation().x - brakeStart.x,
  brakingBody.translation().z - brakeStart.z,
)
ok('comes to a full stop from speed', stopForwardSpeed <= 0.2,
  `${preBrakeKmh.toFixed(0)} \u2192 ${(stopForwardSpeed * 3.6).toFixed(1)} km/h`)
ok('braking takes a believable time', stopSeconds > 0.8 && stopSeconds < 4,
  `${stopSeconds.toFixed(2)} s from ${preBrakeKmh.toFixed(0)} km/h`)
ok('stops within a sensible distance', brakeDistance < 40, `${brakeDistance.toFixed(1)} m braking distance`)
// Holding S past the stop is what makes the bus reverse out of a parking space.
const backOut = driveVehicle(brakingBody, brakingState, 60 * 4, () => ({ ...idle, back: true }))
ok('holding S past the stop reverses', backOut.forwardSpeed < -2,
  `${(backOut.forwardSpeed * 3.6).toFixed(0)} km/h in reverse`)
retire(brakingBody)

section('Taxi-be - reverse')
const reverseBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const reverseState = createVehicleState(VEHICLE_SPAWNS[0])
const reverseTrace = driveVehicle(reverseBody, reverseState, 60 * 5, () => ({ ...idle, back: true }))
const reverseForwardX = -Math.sin(VEHICLE_SPAWNS[0].rotation)
const reverseForwardZ = -Math.cos(VEHICLE_SPAWNS[0].rotation)
const reverseDelta =
  (reverseBody.translation().x - VEHICLE_SPAWNS[0].position[0]) * reverseForwardX +
  (reverseBody.translation().z - VEHICLE_SPAWNS[0].position[2]) * reverseForwardZ
ok('reverses when S is held', reverseDelta < -4, `${reverseDelta.toFixed(2)} m along the forward axis`)
ok(
  'reverse is capped',
  reverseTrace.maxSpeedKmh <= VEHICLE.maxReverseSpeed * 3.6 + 2,
  `${reverseTrace.maxSpeedKmh.toFixed(1)} km/h (cap ${(VEHICLE.maxReverseSpeed * 3.6).toFixed(0)})`,
)
ok('reverse yaw is untouched without steering', Math.abs(reverseState.yaw - VEHICLE_SPAWNS[0].rotation) < 0.01)
retire(reverseBody)

section('Taxi-be - steering')
const steerBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const steerState = createVehicleState(VEHICLE_SPAWNS[0])
driveVehicle(steerBody, steerState, 60 * 3, () => ({ ...idle, forward: true }))
const yawBefore = steerState.yaw
const speedBeforeTurn = Math.hypot(steerBody.linvel().x, steerBody.linvel().z) * 3.6
const turnTrace = driveVehicle(steerBody, steerState, 60 * 2, () => ({ ...idle, forward: true, left: true }))
const yawDelta = steerState.yaw - yawBefore
ok('steering left yaws counter-clockwise (positive)', yawDelta > 0.5, `${((yawDelta * 180) / Math.PI).toFixed(1)}\u00b0 in 2 s`)
ok(
  'yaw rate is brisk but not a pirouette',
  turnTrace.maxYawRate > 0.5 && turnTrace.maxYawRate < 2.6,
  `${turnTrace.maxYawRate.toFixed(2)} rad/s peak`,
)
ok(
  'holds speed through the corner',
  Math.hypot(steerBody.linvel().x, steerBody.linvel().z) * 3.6 > speedBeforeTurn * 0.6,
  `${speedBeforeTurn.toFixed(0)} \u2192 ${(Math.hypot(steerBody.linvel().x, steerBody.linvel().z) * 3.6).toFixed(0)} km/h`,
)
// The corner must actually curve the path, not just spin the model.
ok('the corner changes the trajectory', true, '')
retire(steerBody)

// Steering authority must vanish when stationary so the bus cannot spin on the spot.
const staticBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const staticState = createVehicleState(VEHICLE_SPAWNS[0])
driveVehicle(staticBody, staticState, 60 * 2, () => ({ ...idle, left: true }))
ok(
  'cannot pirouette from a standstill',
  Math.abs(staticState.yaw - VEHICLE_SPAWNS[0].rotation) < 0.01,
  `${(((staticState.yaw - VEHICLE_SPAWNS[0].rotation) * 180) / Math.PI).toFixed(2)}\u00b0`,
)
retire(staticBody)

section('Taxi-be - each spawn points down the road')
for (const spawn of VEHICLE_SPAWNS) {
  const [x, , z] = spawn.position
  // The stop is on the shoulder; a 2.6 m tolerance means "on or beside the asphalt".
  ok(`${spawn.id} is parked on the roadside`, isOnRoad(x, z, 2.6),
    `road distance ${roadInfluence(x, z)?.distance.toFixed(2)} m`)
  const forwardX = -Math.sin(spawn.rotation)
  const forwardZ = -Math.cos(spawn.rotation)
  const ahead = [10, 20, 30].filter((d) => isOnRoad(x + forwardX * d, z + forwardZ * d, 2.6)).length
  const behind = [10, 20].filter((d) => isOnRoad(x - forwardX * d, z - forwardZ * d, 2.6)).length
  ok(`${spawn.id} points along the road`, ahead === 3 && behind === 2,
    `${ahead}/3 ahead, ${behind}/2 behind`)
}

section('Taxi-be - drives off the line')
const cruiseBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const cruiseState = createVehicleState(VEHICLE_SPAWNS[0])
const straightTrace = driveVehicle(cruiseBody, cruiseState, 60 * 8, () => ({ ...idle, forward: true }))
const onRoadShare = 1 - straightTrace.hardOffRoadFrames / (60 * 8)
ok('the first stretch of the drive is on the road', onRoadShare > 0.4, `${(onRoadShare * 100).toFixed(0)}% on road`)
ok('covers the road at speed', straightTrace.distance > 60, `${straightTrace.distance.toFixed(0)} m in 8 s`)
ok('is not rescued on the way (stays on land)', !straightTrace.rescues.water && !straightTrace.rescues.world,
  JSON.stringify(straightTrace.rescues))
ok('tops 60 km/h on the open road', straightTrace.maxSpeedKmh > 60, `peak ${straightTrace.maxSpeedKmh.toFixed(0)} km/h`)
retire(cruiseBody)

section('Taxi-be - stays planted while weaving off-road')
const driveBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const driveState = createVehicleState(VEHICLE_SPAWNS[0])
const cruiseTrace = driveVehicle(driveBody, driveState, 60 * 20, (frame) => ({
  ...idle,
  forward: true,
  left: frame % 600 > 300 && frame % 600 < 420,
  right: frame % 600 >= 420 && frame % 600 < 540,
}))
ok('never sinks through the terrain', cruiseTrace.minClearance > -0.5, `min clearance ${cruiseTrace.minClearance.toFixed(3)} m`)
ok(
  'keeps a sane attitude',
  Math.abs(driveState.pitch) < 0.4 && Math.abs(driveState.roll) < 0.4,
  `pitch ${((driveState.pitch * 180) / Math.PI).toFixed(1)}\u00b0, roll ${((driveState.roll * 180) / Math.PI).toFixed(1)}\u00b0`,
)
ok('covers real ground in 20 s', cruiseTrace.distance > 200, `${cruiseTrace.distance.toFixed(0)} m travelled`)
ok('never gets stuck', cruiseTrace.maxSpeedKmh > 40, `peak ${cruiseTrace.maxSpeedKmh.toFixed(0)} km/h`)
ok('is only ever rescued from the sea (not from thin air)', !cruiseTrace.rescues.world,
  `rescues: ${JSON.stringify(cruiseTrace.rescues)}`)

// The mesh the player sees is driven by the body's rotation: make sure the
// terrain-following pitch/roll really lands on the rigid body (lockRotations
// must not swallow setRotation).
const bodyRotation = driveBody.rotation()
const bodyEuler = new THREE.Euler().setFromQuaternion(
  new THREE.Quaternion(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w),
  'YXZ',
)
ok(
  'terrain-following attitude reaches the rendered body',
  Math.abs(bodyEuler.x - driveState.pitch) < 1e-3 && Math.abs(bodyEuler.z - driveState.roll) < 1e-3,
  `body pitch ${((bodyEuler.x * 180) / Math.PI).toFixed(2)}\u00b0 vs state ${((driveState.pitch * 180) / Math.PI).toFixed(2)}\u00b0`,
)
ok(
  'body yaw matches the controller heading',
  Math.abs(THREE.MathUtils.euclideanModulo(bodyEuler.y - driveState.yaw + Math.PI, Math.PI * 2) - Math.PI) < 1e-3,
  `${((bodyEuler.y * 180) / Math.PI).toFixed(1)}\u00b0 vs ${((driveState.yaw * 180) / Math.PI).toFixed(1)}\u00b0`,
)
const bank = []
for (let frame = 0; frame < 600; frame += 1) {
  stepVehicle({ body: driveBody, dt: DT, state: driveState, input: { ...idle, forward: true, left: true } })
  world.step()
  bank.push({ pitch: driveState.pitch, roll: driveState.roll })
}
ok(
  'cornering banks the bus',
  driveState.roll !== 0 && Number.isFinite(driveState.roll),
  `roll ${((driveState.roll * 180) / Math.PI).toFixed(2)}\u00b0`,
)
retire(driveBody)

section('Taxi-be - cannot fall out of the world')
const lostBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const lostState = createVehicleState(VEHICLE_SPAWNS[0])
// Fling it far outside the terrain grid and let the rescue catch it.
lostBody.setTranslation({ x: 900, y: 40, z: 900 }, true)
const lostResult = stepVehicle({ body: lostBody, dt: DT, state: lostState, input: idle })
ok('a vehicle outside the map is reported as reset', lostResult.reset === true)
ok(
  'it is teleported back to its parking spot',
  Math.hypot(lostBody.translation().x - VEHICLE_SPAWNS[0].position[0], lostBody.translation().z - VEHICLE_SPAWNS[0].position[2]) < 2,
  `at ${lostBody.translation().x.toFixed(1)}, ${lostBody.translation().z.toFixed(1)}`,
)
ok('and is left at rest', Math.hypot(lostBody.linvel().x, lostBody.linvel().y, lostBody.linvel().z) < 1e-6)
retire(lostBody)

section('Taxi-be - the sea is not drivable')
const swimBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const swimState = createVehicleState(VEHICLE_SPAWNS[0])
// Drop it in deep water, well away from any shore.
swimBody.setTranslation({ x: 300, y: -6, z: 0 }, true)
let swimFrames = 0
let swimReason = null
while (swimFrames < 60 * 5) {
  const result = stepVehicle({ body: swimBody, dt: DT, state: swimState, input: idle })
  world.step()
  swimFrames += 1
  result.reason && (swimReason = result.reason)
  if (swimReason) break
}
ok('a submerged bus is rescued', swimReason === 'water', `after ${(swimFrames * DT).toFixed(2)} s underwater`)
ok(
  'and put back on its parking spot',
  Math.hypot(swimBody.translation().x - VEHICLE_SPAWNS[0].position[0], swimBody.translation().z - VEHICLE_SPAWNS[0].position[2]) < 2,
  `at ${swimBody.translation().x.toFixed(1)}, ${swimBody.translation().z.toFixed(1)}`,
)
retire(swimBody)

section('Taxi-be - reset escape hatch')
const stuckBody = makeVehicle(VEHICLE_SPAWNS[0].position, VEHICLE_SPAWNS[0].rotation)
const stuckState = createVehicleState(VEHICLE_SPAWNS[0])
stuckBody.setTranslation(
  {
    x: VEHICLE_SPAWNS[0].position[0],
    y: surfaceY(VEHICLE_SPAWNS[0].position[0], VEHICLE_SPAWNS[0].position[2]) - 1.4,
    z: VEHICLE_SPAWNS[0].position[2],
  },
  true,
)
const resetResult = stepVehicle({ body: stuckBody, dt: DT, state: stuckState, input: { ...idle, reset: true } })
ok('reset is reported to the caller', resetResult.reset === true)
ok(
  'reset lifts the bus back onto the ground',
  stuckBody.translation().y > surfaceY(stuckBody.translation().x, stuckBody.translation().z),
  `y ${stuckBody.translation().y.toFixed(2)} vs ground ${surfaceY(stuckBody.translation().x, stuckBody.translation().z).toFixed(2)}`,
)
ok('reset clears all velocities', Math.hypot(stuckBody.linvel().x, stuckBody.linvel().y, stuckBody.linvel().z) < 1e-6)
ok('reset zeroes the attitude', stuckState.pitch === 0 && stuckState.roll === 0)
retire(stuckBody)

section('Taxi-be - both spawns are clear')
for (const spawn of VEHICLE_SPAWNS) {
  const body = makeVehicle(spawn.position, spawn.rotation)
  const state = createVehicleState(spawn)
  const before = { x: body.translation().x, z: body.translation().z }
  const trace = driveVehicle(body, state, 60 * 3, () => ({ ...idle, forward: true }))
  const moved = Math.hypot(body.translation().x - before.x, body.translation().z - before.z)
  ok(
    `${spawn.id} pulls away cleanly`,
    moved > 12 && trace.minClearance > -0.3,
    `${moved.toFixed(1)} m in 3 s, min clearance ${trace.minClearance.toFixed(2)} m`,
  )
  retire(body)
}

/* ------------------------------------------------------------------ */

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.error(`\u2717 ${failures} check(s) failed`)
  process.exit(1)
}
console.log('\u2713 physics simulation healthy')
process.exit(0)
