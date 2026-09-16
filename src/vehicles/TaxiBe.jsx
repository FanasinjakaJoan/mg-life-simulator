import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CoefficientCombineRule,
  RigidBody,
  RoundCuboidCollider,
  useBeforePhysicsStep,
} from '@react-three/rapier'
import { KEY, isDown, wasPressed } from '../state/input.js'
import { useGameStore } from '../state/useGameStore.js'
import { registerVehicle } from '../state/vehicleRegistry.js'
import { VEHICLE } from '../config/gameConfig.js'
import { terrainHeight } from '../world/terrain.js'
import { TaxiBeModel } from './TaxiBeModel.jsx'
import { WHEEL_POSITIONS } from './vehicleGeometry.js'
import { createVehicleState, stepVehicle, updateVehicleVisuals } from './vehicleController.js'

const PHYSICS_DT = 1 / 60

/**
 * Taxi-brousse with arcade driving physics.
 *
 * The body stays a *dynamic* rigid body (so it collides with buildings, keeps
 * gravity and can be pushed) but its rotations are locked and set by the
 * controller every step from four terrain samples. That gives a minibus which
 * always sits on the road, never tips over, and turns exactly as much as we ask.
 * Engine force, braking, lateral grip and downforce are applied as impulses so
 * Rapier still resolves every contact.
 */
export function TaxiBe({ spawn }) {
  const bodyRef = useRef(null)
  const wheelRef = useRef([])
  const stateRef = useRef(createVehicleState(spawn))
  const id = spawn.id

  const setSpeedKmh = useGameStore((state) => state.setSpeedKmh)
  const setToast = useGameStore((state) => state.setToast)

  /** Sit correctly on the terrain from the very first frame. */
  const initial = useMemo(() => {
    const [x, , z] = spawn.position
    const ground = terrainHeight(x, z)
    return [x, ground + VEHICLE.chassis.halfHeight + 0.15, z]
  }, [spawn.position])

  /* ---------------- shared control surface ---------------- */

  const api = useMemo(() => {
    const scratch = { x: 0, y: 0, z: 0 }
    const exitScratch = { x: 0, y: 0, z: 0 }
    return {
      id,
      name: spawn.name,
      get body() {
        return bodyRef.current
      },
      wake: () => {
        const body = bodyRef.current
        if (!body) return
        if (body.isSleeping()) body.wakeUp()
      },
      getWorldPosition: (target = scratch) => {
        const body = bodyRef.current
        if (!body) return target
        const translation = body.translation()
        target.x = translation.x
        target.y = translation.y
        target.z = translation.z
        return target
      },
      getSpeedKmh: () => {
        const body = bodyRef.current
        if (!body) return 0
        const velocity = body.linvel()
        return Math.hypot(velocity.x, velocity.y, velocity.z) * 3.6
      },
      getHeading: () => stateRef.current.yaw,
      /**
       * Where the driver steps out: beside the vehicle, clear of the ocean and
       * as level as possible with the vehicle's own ground.
       */
      getExitPoint: (target = exitScratch) => {
        const body = bodyRef.current
        if (!body) return target
        const translation = body.translation()
        const heading = stateRef.current.yaw
        const vehicleGround = terrainHeight(translation.x, translation.z)
        const offset = VEHICLE.chassis.halfWidth + 1.6

        let best = null
        for (const side of [1, -1]) {
          const x = translation.x + Math.cos(heading) * offset * side
          const z = translation.z - Math.sin(heading) * offset * side
          const ground = terrainHeight(x, z)
          if (ground < 0.5) continue
          const step = Math.abs(ground - vehicleGround)
          const score = step + (side === -1 ? 0.35 : 0) // prefer the driver's side
          if (!best || score < best.score) best = { x, y: ground, z, score }
        }

        if (!best) {
          target.x = translation.x
          target.y = vehicleGround
          target.z = translation.z + 3
          return target
        }
        target.x = best.x
        target.y = best.y
        target.z = best.z
        return target
      },
    }
  }, [id, spawn.name])

  useEffect(() => registerVehicle(id, api), [id, api])

  /* ---------------- driving ---------------- */

  useBeforePhysicsStep(() => {
    const body = bodyRef.current
    if (!body) return

    const store = useGameStore.getState()
    if (store.mode !== 'driving' || store.activeVehicleId !== id) return
    if (body.isSleeping()) body.wakeUp()

    const dt = PHYSICS_DT
    const state = stateRef.current

    const result = stepVehicle({
      body,
      dt,
      state,
      input: {
        forward: isDown(KEY.forward),
        back: isDown(KEY.back),
        left: isDown(KEY.left),
        right: isDown(KEY.right),
        handbrake: isDown(KEY.handbrake),
        reset: wasPressed(KEY.reset),
      },
    })

    if (result.reset) {
      setToast('Vehicle reset on the road')
      return
    }

    setSpeedKmh(result.speedKmh)
  })

  /* ---------------- visuals ---------------- */

  useFrame((_, delta) => {
    const body = bodyRef.current
    if (!body) return
    const step = Math.min(delta, 0.05)
    const store = useGameStore.getState()
    const driving = store.mode === 'driving' && store.activeVehicleId === id

    const vehicle = stateRef.current
    const velocity = body.linvel()
    const forwardSpeed = velocity.x * -Math.sin(vehicle.yaw) + velocity.z * -Math.cos(vehicle.yaw)
    const steerInput = driving ? (isDown(KEY.left) ? 1 : 0) - (isDown(KEY.right) ? 1 : 0) : 0

    updateVehicleVisuals(vehicle, step, forwardSpeed, steerInput)

    wheelRef.current.forEach((wheel, index) => {
      if (!wheel) return
      const isFront = WHEEL_POSITIONS[index]?.front
      wheel.rotation.set(vehicle.wheelSpin, isFront ? vehicle.steer : 0, 0, 'YXZ')
    })
  })

  return (
    <RigidBody
      ref={bodyRef}
      name={id}
      type="dynamic"
      colliders={false}
      position={initial}
      rotation={[0, spawn.rotation, 0]}
      lockRotations
      canSleep
      ccd
      linearDamping={0.04}
      friction={0.9}
      restitution={0.05}
    >
      {/* Chassis (carries the mass) + cabin shell (keeps the roof solid).

          Two deliberate choices here, both essential for the driving feel:
          - ROUNDED boxes: a sharp-cornered box sliding on a triangle mesh
            catches on the shared triangle edges, which randomly stops the bus
            dead. Rounding the corners (Rapier's recommended fix) removes it.
          - near-zero ground friction with the MIN combine rule, so the engine
            never fights the terrain and the bus cannot snag on walls - lateral
            grip is modelled by the controller instead. */}
      <RoundCuboidCollider
        args={[VEHICLE.chassis.halfWidth, VEHICLE.chassis.halfHeight, VEHICLE.chassis.halfLength, 0.12]}
        mass={VEHICLE.mass}
        friction={VEHICLE.chassisFriction}
        frictionCombineRule={CoefficientCombineRule.Min}
        restitution={0.05}
      />
      <RoundCuboidCollider
        args={[VEHICLE.chassis.halfWidth, 0.5, VEHICLE.chassis.halfLength - 0.1, 0.1]}
        position={[0, 1.05, 0]}
        density={8}
        friction={0.3}
      />
      <TaxiBeModel bodyColor={spawn.color} accentColor={spawn.accent} wheelRef={wheelRef} />
    </RigidBody>
  )
}
