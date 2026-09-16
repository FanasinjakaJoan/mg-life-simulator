import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { CAMERA, PLAYER } from '../config/gameConfig.js'
import { cameraState } from '../state/cameraState.js'
import { mouse } from '../state/input.js'
import { getPlayerPosition, playerRegistry } from '../state/playerRegistry.js'
import { getVehicle } from '../state/vehicleRegistry.js'
import { useGameStore } from '../state/useGameStore.js'
import { terrainHeight } from '../world/terrain.js'
import { clamp, damp } from '../world/noise.js'

/**
 * Smooth third-person orbit camera.
 *
 * Mouse movement always drives the orbit (pointer lock is optional), the wheel
 * zooms, and while driving the camera eases back behind the vehicle after a
 * moment without input. A ray cast keeps buildings between the camera and the
 * player from blocking the view, and the rig never dips below the terrain.
 */
export function ThirdPersonCamera() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()

  const pivot = useRef(new THREE.Vector3())
  const desiredPivot = useRef(new THREE.Vector3())
  const lookTarget = useRef(new THREE.Vector3())
  const offset = useRef(new THREE.Vector3())
  const cameraPosition = useRef(new THREE.Vector3())
  const lastMouseAt = useRef(-10)
  const easeUntil = useRef(0)
  const lastMode = useRef('onFoot')
  const rayRef = useRef(null)
  const initialised = useRef(false)

  const mode = useGameStore((state) => state.mode)
  const activeVehicleId = useGameStore((state) => state.activeVehicleId)

  const playerPosition = useMemo(() => ({ x: 0, y: 0, z: 0 }), [])
  const vehiclePosition = useMemo(() => ({ x: 0, y: 0, z: 0 }), [])

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.05)
    const now = state.clock.elapsedTime
    const driving = mode === 'driving'
    const vehicle = driving ? getVehicle(activeVehicleId) : null

    if (lastMode.current !== mode) {
      lastMode.current = mode
      // After getting in/out, glide to the new default distance.
      easeUntil.current = now + 1.6
    }

    /* ---------------- orbit input ---------------- */
    const dx = mouse.dx
    const dy = mouse.dy
    const wheel = mouse.wheel
    mouse.dx = 0
    mouse.dy = 0
    mouse.wheel = 0

    if (dx || dy) {
      cameraState.yaw -= dx * CAMERA.sensitivity
      cameraState.pitch = clamp(
        cameraState.pitch + dy * CAMERA.sensitivity,
        CAMERA.minPitch,
        CAMERA.maxPitch,
      )
      lastMouseAt.current = now
    }

    const targetDistance = driving ? CAMERA.distanceDriving : CAMERA.distanceOnFoot
    const minDistance = driving ? CAMERA.minDistance + 1.5 : CAMERA.minDistance
    if (wheel) {
      cameraState.distance = clamp(
        cameraState.distance + Math.sign(wheel) * CAMERA.zoomStep,
        minDistance,
        CAMERA.maxDistance,
      )
      easeUntil.current = 0
    } else if (now < easeUntil.current) {
      cameraState.distance += (targetDistance - cameraState.distance) * damp(3.2, step)
    }

    // Keep yaw in [-PI, PI] so the driving recenter never spins the long way.
    if (cameraState.yaw > Math.PI) cameraState.yaw -= Math.PI * 2
    if (cameraState.yaw < -Math.PI) cameraState.yaw += Math.PI * 2

    /* ---------------- where is the action? ---------------- */
    let pivotHeight = 0.35
    let lookHeight = 0.7

    if (driving && vehicle) {
      vehicle.getWorldPosition(vehiclePosition)
      desiredPivot.current.set(vehiclePosition.x, vehiclePosition.y, vehiclePosition.z)
      pivotHeight = 1.05
      lookHeight = 1.3

      const idle = now - lastMouseAt.current
      if (idle > CAMERA.drivingRecenterDelay) {
        const heading = vehicle.getHeading?.() ?? cameraState.yaw
        let difference = heading - cameraState.yaw
        while (difference > Math.PI) difference -= Math.PI * 2
        while (difference < -Math.PI) difference += Math.PI * 2
        cameraState.yaw += difference * damp(CAMERA.drivingRecenterRate, step)
      }
    } else {
      const position = getPlayerPosition(playerPosition)
      if (position) {
        desiredPivot.current.set(position.x, position.y, position.z)
      } else {
        desiredPivot.current.set(PLAYER.spawn[0], PLAYER.spawn[1] + 1, PLAYER.spawn[2])
      }
    }

    desiredPivot.current.y += pivotHeight

    if (!initialised.current) {
      pivot.current.copy(desiredPivot.current)
    } else {
      pivot.current.lerp(desiredPivot.current, damp(CAMERA.followRate, step))
    }

    /* ---------------- orbit -> world position ---------------- */
    const cosPitch = Math.cos(cameraState.pitch)
    const sinPitch = Math.sin(cameraState.pitch)
    offset.current.set(
      Math.sin(cameraState.yaw) * cosPitch,
      sinPitch,
      Math.cos(cameraState.yaw) * cosPitch,
    )

    // Obstruction probe: shorten the boom if a wall is in the way.
    if (!rayRef.current) {
      rayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
    }
    const ray = rayRef.current
    ray.origin.x = pivot.current.x
    ray.origin.y = pivot.current.y
    ray.origin.z = pivot.current.z
    ray.dir.x = offset.current.x
    ray.dir.y = offset.current.y
    ray.dir.z = offset.current.z

    let allowedDistance = cameraState.distance
    const excludeBody = driving ? vehicle?.body : playerRegistry.body
    const hit = world.castRay(
      ray,
      allowedDistance,
      true,
      undefined,
      undefined,
      undefined,
      excludeBody ?? undefined,
    )
    if (hit && hit.timeOfImpact < allowedDistance) {
      allowedDistance = Math.max(1.0, hit.timeOfImpact - 0.35)
    }

    cameraPosition.current.copy(offset.current).multiplyScalar(allowedDistance).add(pivot.current)

    // Never let the camera sink into the ground or the sea.
    const ground = Math.max(terrainHeight(cameraPosition.current.x, cameraPosition.current.z), 0.4)
    const minimumY = ground + CAMERA.groundClearance
    if (cameraPosition.current.y < minimumY) cameraPosition.current.y = minimumY

    if (!initialised.current) {
      camera.position.copy(cameraPosition.current)
      initialised.current = true
    } else {
      camera.position.lerp(cameraPosition.current, damp(CAMERA.lookAtRate, step))
    }

    /* ---------------- look at ---------------- */
    lookTarget.current.set(
      pivot.current.x,
      pivot.current.y - pivotHeight + lookHeight,
      pivot.current.z,
    )
    if (driving && vehicle) {
      // Lead the camera slightly ahead of the vehicle at speed.
      const lead = clamp(vehicle.getSpeedKmh() / 90, 0, 1) * 3.2
      lookTarget.current.x += -Math.sin(cameraState.yaw) * lead
      lookTarget.current.z += -Math.cos(cameraState.yaw) * lead
    }
    camera.lookAt(lookTarget.current)
    camera.updateMatrixWorld()

    // Mutated in place: this runs every frame, so it must not allocate.
    cameraState.target.x = pivot.current.x
    cameraState.target.y = pivot.current.y
    cameraState.target.z = pivot.current.z
    cameraState.mode = driving ? 'driving' : 'onFoot'
  })

  return null
}
