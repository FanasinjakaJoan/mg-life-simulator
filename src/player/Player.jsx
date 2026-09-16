import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { KEY, isDown, readMoveAxis, wasPressed } from '../state/input.js'
import { cameraState } from '../state/cameraState.js'
import { useGameStore } from '../state/useGameStore.js'
import { placePlayer, playerRegistry, setPlayerBody } from '../state/playerRegistry.js'
import { PLAYER } from '../config/gameConfig.js'
import { terrainHeight } from '../world/terrain.js'
import { damp } from '../world/noise.js'
import { PlayerModel } from './PlayerModel.jsx'
import {
  computePlayerVelocity,
  createPlayerState,
  evaluateGroundProbe,
  worldRescuePoint,
} from './playerController.js'

const PHYSICS_DT = 1 / 60

/**
 * Third-person character.
 *
 * Owns the Rapier capsule and the ground probe; all the movement maths lives in
 * `playerController.js` so it can be verified headlessly.
 */
export function Player() {
  const bodyRef = useRef(null)
  const modelRef = useRef(null)
  const motionRef = useRef({ speed: 0, maxSpeed: PLAYER.walkSpeed, grounded: true, riding: false })
  const stateRef = useRef(createPlayerState())
  const rayRef = useRef(null)

  const { world, rapier } = useRapier()

  /** Feet on the terrain surface: the capsule centre sits one offset higher. */
  const spawn = useMemo(() => {
    const [x, configuredY, z] = PLAYER.spawn
    const groundY = terrainHeight(x, z)
    const y = configuredY === 0 ? groundY + PLAYER.halfHeight + PLAYER.radius + 0.2 : configuredY
    return [x, y, z]
  }, [])

  const mode = useGameStore((state) => state.mode)

  // Publish the body so the interaction system and the camera can reach it.
  useEffect(() => {
    setPlayerBody(bodyRef.current)
    return () => setPlayerBody(null)
  }, [])

  // Entering / leaving a vehicle.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const riding = mode === 'driving'
    motionRef.current.riding = riding
    playerRegistry.hidden = riding
    body.setEnabled(!riding)

    if (!riding) {
      // Safety net: never wake up below the terrain after a ride.
      const translation = body.translation()
      const ground = terrainHeight(translation.x, translation.z)
      const minimumY = ground + PLAYER.halfHeight + PLAYER.radius + 0.05
      if (translation.y < minimumY) placePlayer(translation.x, minimumY, translation.z)
      else body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }
  }, [mode])

  useBeforePhysicsStep(() => {
    const body = bodyRef.current
    if (!body || !body.isEnabled()) return

    const dt = PHYSICS_DT
    const translation = body.translation()

    /* ----- ground probe (downward ray from the capsule centre) ----- */
    if (!rayRef.current) {
      rayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    }
    const ray = rayRef.current
    ray.origin.x = translation.x
    ray.origin.y = translation.y
    ray.origin.z = translation.z
    ray.dir.x = 0
    ray.dir.y = -1
    ray.dir.z = 0

    const feetOffset = PLAYER.halfHeight + PLAYER.radius
    const probe = world.castRayAndGetNormal(
      ray,
      feetOffset + 0.4,
      true,
      undefined,
      undefined,
      undefined,
      body,
    )
    const { grounded } = evaluateGroundProbe(probe, feetOffset)

    /* ----- movement ----- */
    const axis = readMoveAxis()
    const velocity = body.linvel()
    const next = computePlayerVelocity({
      velocity,
      dt,
      axis,
      cameraYaw: cameraState.yaw,
      sprint: isDown(KEY.sprint),
      jumpPressed: wasPressed(KEY.jump),
      grounded,
      state: stateRef.current,
    })

    body.setLinvel({ x: next.x, y: next.y, z: next.z }, true)
    body.setGravityScale(next.gravityScale, true)

    // Walking off the edge of the world drops the player back on the plaza.
    const ground = terrainHeight(translation.x, translation.z)
    const rescue = worldRescuePoint(translation, ground)
    if (rescue) {
      placePlayer(rescue.x, rescue.y, rescue.z)
      stateRef.current.coyote = 0
      stateRef.current.jumpBuffer = 0
      return
    }

    motionRef.current.speed = stateRef.current.speed
    motionRef.current.maxSpeed = isDown(KEY.sprint) ? PLAYER.sprintSpeed : PLAYER.walkSpeed
    motionRef.current.grounded = stateRef.current.grounded
  })

  // Visual-only yaw smoothing: the capsule collider is symmetric, so turning
  // the model never fights the physics solver.
  useFrame((_, delta) => {
    const model = modelRef.current
    const body = bodyRef.current
    if (!model) return

    // The avatar is hidden while the player is at the wheel.
    model.visible = Boolean(body?.isEnabled()) && !playerRegistry.hidden
    if (!body?.isEnabled()) return

    let difference = stateRef.current.facing - model.rotation.y
    while (difference > Math.PI) difference -= Math.PI * 2
    while (difference < -Math.PI) difference += Math.PI * 2
    model.rotation.y += difference * damp(14, Math.min(delta, 0.05))
  })

  return (
    <RigidBody
      ref={bodyRef}
      name="player"
      type="dynamic"
      colliders={false}
      position={spawn}
      lockRotations
      canSleep={false}
      ccd
      linearDamping={0}
      angularDamping={0.9}
      friction={0.1}
      restitution={0}
    >
      <CapsuleCollider
        args={[PLAYER.halfHeight, PLAYER.radius]}
        friction={0.02}
        restitution={0}
        density={0.9}
      />
      <group ref={modelRef}>
        <PlayerModel motionRef={motionRef} />
      </group>
    </RigidBody>
  )
}
