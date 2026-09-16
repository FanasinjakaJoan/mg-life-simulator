import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAfterPhysicsStep, useBeforePhysicsStep } from '@react-three/rapier'
import { KEY, endFrame, wasPressed } from '../state/input.js'
import { cameraState } from '../state/cameraState.js'
import { useGameStore } from '../state/useGameStore.js'
import { findNearestVehicle, getVehicle } from '../state/vehicleRegistry.js'
import { getPlayerPosition, placePlayer } from '../state/playerRegistry.js'
import { PLAYER, VEHICLE } from '../config/gameConfig.js'

/**
 * Ties the player and the vehicles together.
 *
 *  - tracks the closest vehicle so the HUD can prompt "press F"
 *  - handles getting in (F) and stepping out (F) along with the exit placement
 *  - owns the per-frame input edge bookkeeping
 *
 * Ordering matters: edge-triggered keys (`wasPressed`) are only true for one
 * physics step, and they are cleared in the *after*-step hook. Everything that
 * consumes an edge therefore has to run in a before-step hook - a plain
 * `useFrame` runs after the edges have already been cleared.
 */
export function InteractionSystem() {
  const playerPosition = useRef({ x: 0, y: 0, z: 0 })
  const lastNearbyId = useRef(null)
  const lastNearbyBucket = useRef(-1)

  // Edge-triggered input is consumed once the physics step has run.
  useAfterPhysicsStep(() => {
    endFrame()
  })

  /* ---------------- F: enter / exit ---------------- */
  useBeforePhysicsStep(() => {
    const store = useGameStore.getState()
    const driving = store.mode === 'driving'
    if (!wasPressed(KEY.interact)) return

    if (!driving) {
      if (!store.nearbyVehicleId) return
      const vehicle = getVehicle(store.nearbyVehicleId)
      if (!vehicle) return
      vehicle.wake?.()
      store.enterVehicle(vehicle.id)
      store.setToast(`Au volant — ${vehicle.name}`)
      return
    }

    // Step out of the vehicle.
    const vehicle = getVehicle(store.activeVehicleId)
    if (!vehicle) {
      store.exitVehicle()
      return
    }

    const exitPoint = vehicle.getExitPoint({ x: 0, y: 0, z: 0 })
    placePlayer(
      exitPoint.x,
      exitPoint.y + PLAYER.halfHeight + PLAYER.radius + 0.25,
      exitPoint.z,
    )

    // Park it: drop most of the momentum so it does not roll away.
    const body = vehicle.body
    if (body) {
      const velocity = body.linvel()
      body.setLinvel({ x: velocity.x * 0.25, y: 0, z: velocity.z * 0.25 }, true)
    }

    // Face the camera along the vehicle's heading so the player can walk off.
    cameraState.yaw = vehicle.getHeading?.() ?? cameraState.yaw
    store.exitVehicle()
    store.setToast('À pied')
  })

  /* ---------------- interaction prompt ---------------- */
  // Purely cosmetic, so it can live in the render loop.
  useFrame(() => {
    const store = useGameStore.getState()
    if (store.mode === 'driving') {
      if (store.nearbyVehicleId) store.setNearbyVehicle(null, '', Infinity)
      return
    }

    const position = getPlayerPosition(playerPosition.current)
    const nearest = position ? findNearestVehicle(position, VEHICLE.interactionRadius) : null
    const id = nearest?.vehicle.id ?? null
    const bucket = nearest ? Math.floor(nearest.distance) : -1
    if (id !== lastNearbyId.current || bucket !== lastNearbyBucket.current) {
      lastNearbyId.current = id
      lastNearbyBucket.current = bucket
      store.setNearbyVehicle(id, nearest?.vehicle.name ?? '', nearest?.distance ?? Infinity)
    }
  })

  return null
}
