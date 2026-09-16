import { PLAYER, WORLD } from '../config/gameConfig.js'
import { cameraBasis } from '../state/cameraState.js'
import { damp } from '../world/noise.js'
import { terrainHeight } from '../world/terrain.js'

/**
 * Character controller maths - pure, engine-agnostic and testable.
 *
 * The caller owns the rigid body and the ray cast; this module only turns a
 * movement request into velocities. Kept free of React so
 * `scripts/physics-sim.mjs` can exercise it against a real Rapier world.
 */

export const MAX_FALL_SPEED = 42

/** Beyond this the terrain mesh has ended: nothing left to stand on. */
const GRID_LIMIT = WORLD.size / 2 - 4
const FALL_THROUGH_DEPTH = 12

/**
 * Safety net for walking off the edge of the world (or through a hole in the
 * terrain mesh). Returns where to put the player back, or null if all is well.
 */
export function worldRescuePoint(position, groundY) {
  const outside = Math.abs(position.x) > GRID_LIMIT || Math.abs(position.z) > GRID_LIMIT
  const fellThrough = position.y < groundY - FALL_THROUGH_DEPTH
  if (!outside && !fellThrough) return null
  const [x, , z] = PLAYER.spawn
  return { x, y: terrainHeight(x, z) + PLAYER.halfHeight + PLAYER.radius + 0.4, z }
}

export function createPlayerState() {
  return {
    coyote: 0,
    jumpBuffer: 0,
    facing: 0,
    /** Planar speed we asked for (the ramped scalar, in m/s). */
    planarSpeed: 0,
    speed: 0,
    grounded: true,
  }
}

/**
 * @param {object} params
 * @param {object} params.velocity      current linear velocity {x,y,z}
 * @param {number} params.dt            fixed physics step
 * @param {{x:number,z:number}} params.axis    raw move axis (-1..1)
 * @param {number} params.cameraYaw     camera yaw used to make movement relative
 * @param {boolean} params.sprint
 * @param {boolean} params.jumpPressed  edge-triggered jump flag
 * @param {boolean} params.grounded
 * @param {object} params.state         mutable state from createPlayerState()
 * @returns {{x:number,y:number,z:number,gravityScale:number}}
 */
export function computePlayerVelocity({
  velocity,
  dt,
  axis,
  cameraYaw,
  sprint,
  jumpPressed,
  grounded,
  state,
}) {
  const basis = cameraBasis(cameraYaw)
  let wishX = basis.forwardX * axis.z + basis.rightX * axis.x
  let wishZ = basis.forwardZ * axis.z + basis.rightZ * axis.x
  const magnitude = Math.hypot(wishX, wishZ)
  const moving = magnitude > 1e-4
  if (moving) {
    wishX /= magnitude
    wishZ /= magnitude
  }

  const maxSpeed = sprint && axis.z > 0 ? PLAYER.sprintSpeed : PLAYER.walkSpeed
  const rate = moving
    ? grounded
      ? PLAYER.accelRate
      : PLAYER.airAccelRate
    : grounded
      ? PLAYER.brakeRate
      : PLAYER.airAccelRate * 0.5
  const blend = damp(rate, dt)

  // The planar speed is ramped as its own scalar (exact, and never nibbled away
  // by the contact solver) while the *direction* is blended from the previous
  // velocity, which is what keeps turns smooth instead of instant.
  // In the air the speed is preserved - no air braking - and only the direction
  // follows the stick, which is what air control should feel like.
  const targetSpeed = grounded ? (moving ? maxSpeed : 0) : state.planarSpeed
  state.planarSpeed += (targetSpeed - state.planarSpeed) * (grounded ? blend : damp(PLAYER.airAccelRate, dt))

  let x = velocity.x + (wishX * maxSpeed - velocity.x) * blend
  let z = velocity.z + (wishZ * maxSpeed - velocity.z) * blend
  const planar = Math.hypot(x, z)
  if (planar > 1e-4) {
    const scale = state.planarSpeed / planar
    x *= scale
    z *= scale
  } else if (state.planarSpeed > 0 && moving) {
    x = wishX * state.planarSpeed
    z = wishZ * state.planarSpeed
  } else {
    x = 0
    z = 0
  }
  let y = velocity.y

  // Coyote time + jump buffering.
  state.coyote = grounded ? PLAYER.coyoteTime : Math.max(0, state.coyote - dt)
  state.jumpBuffer = jumpPressed ? PLAYER.jumpBuffer : Math.max(0, state.jumpBuffer - dt)

  let jumped = false
  if (state.jumpBuffer > 0 && state.coyote > 0) {
    y = PLAYER.jumpSpeed
    state.coyote = 0
    state.jumpBuffer = 0
    jumped = true
  }
  if (y < -MAX_FALL_SPEED) y = -MAX_FALL_SPEED

  state.speed = state.planarSpeed
  state.grounded = grounded && !jumped
  if (moving) state.facing = Math.atan2(-wishX, -wishZ)

  return {
    x,
    y,
    z,
    // Snappier fall arc without making the jump feel heavy.
    gravityScale: y < -0.5 ? 1 + PLAYER.fallGravityBoost / 9.81 : 1,
  }
}

/**
 * Ground probe from the capsule centre. Returns the surface normal's Y and
 * whether the capsule counts as standing on it.
 */
export function evaluateGroundProbe(probe, feetOffset) {
  if (!probe) return { grounded: false, normalY: 1 }
  const normalY = probe.normal?.y ?? 1
  const grounded = probe.timeOfImpact <= feetOffset + 0.25 && normalY > 0.45
  return { grounded, normalY }
}
