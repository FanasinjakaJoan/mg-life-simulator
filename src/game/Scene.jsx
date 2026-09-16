import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { SKY_HORIZON, Clouds, SkyDome } from '../world/Sky.jsx'
import { Ocean } from '../world/Ocean.jsx'
import { BiomeScenery, BiomeWeather } from '../world/BiomeScenery.jsx'
import { Terrain } from '../world/Terrain.jsx'
import { Roads } from '../world/Roads.jsx'
import { Props } from '../world/Props.jsx'
import { PhysicsWorld } from '../components/PhysicsWorld.jsx'
import { Player } from '../player/Player.jsx'
import { TaxiBe } from '../vehicles/TaxiBe.jsx'
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.jsx'
import { InteractionSystem } from './InteractionSystem.jsx'
import { SUN, VEHICLE_SPAWNS, WORLD } from '../config/gameConfig.js'
import { getPlayerPosition } from '../state/playerRegistry.js'
import { getVehicle } from '../state/vehicleRegistry.js'
import { useGameStore } from '../state/useGameStore.js'

/**
 * The playable scene: atmosphere, island, props, player, vehicles and every
 * system that needs to run inside the render/physics loop.
 */
export function Scene({ physicsDebug = false }) {
  return (
    <>
      <color attach="background" args={[SKY_HORIZON]} />
      <fog attach="fog" args={[SKY_HORIZON, WORLD.fogNear, WORLD.fogFar]} />

      <SkyDome />
      <Clouds />
      <BiomeWeather />
      <SunLight />
      <hemisphereLight
        color={SUN.ambient.skyColor}
        groundColor={SUN.ambient.groundColor}
        intensity={SUN.ambient.intensity}
      />

      <PhysicsWorld debug={physicsDebug}>
        <Terrain />
        <Props />
        <BiomeScenery />
        <Player />
        {VEHICLE_SPAWNS.map((spawn) => (
          <TaxiBe key={spawn.id} spawn={spawn} />
        ))}
        <InteractionSystem />
        {/* Inside the physics world on purpose: the rig ray-casts against it to
            keep buildings from blocking the view, and `useRapier()` throws
            outside <Physics>. */}
        <ThirdPersonCamera />
      </PhysicsWorld>

      {/* Visual-only layers - no physics, no rapier context needed. */}
      <Roads />
      <Ocean sunDirection={SUN.direction} />

      <ReadySignal />
    </>
  )
}

/**
 * Directional sun whose shadow frustum follows the player, so a 60 m shadow box
 * stays crisp across the whole 620 m island.
 */
function SunLight() {
  const lightRef = useRef(null)
  const targetRef = useRef(null)
  const scratch = useRef({ x: 0, y: 0, z: 0 })

  const [dx, dy, dz] = SUN.direction
  const length = Math.hypot(dx, dy, dz) || 1
  const dir = { x: dx / length, y: dy / length, z: dz / length }

  // A directional light shines from `light.target`, which defaults to the world
  // origin: without this the 60m shadow box would always be aimed at the middle
  // of the island instead of tracking the player.
  useEffect(() => {
    const light = lightRef.current
    const target = targetRef.current
    if (light && target) light.target = target
  }, [])

  useFrame(() => {
    const light = lightRef.current
    const target = targetRef.current
    if (!light || !target) return

    // Follow whoever the camera is on: the player on foot, the car when driving.
    const store = useGameStore.getState()
    const vehicle =
      store.mode === 'driving' ? getVehicle(store.activeVehicleId) : null
    const position = vehicle
      ? vehicle.getWorldPosition(scratch.current)
      : getPlayerPosition(scratch.current)
    const x = position?.x ?? WORLD.size * 0.25
    const y = position?.y ?? 6
    const z = position?.z ?? WORLD.size * 0.25

    light.position.set(x + dir.x * 110, y + dir.y * 110, z + dir.z * 110)
    target.position.set(x, y, z)
    target.updateMatrixWorld()
  })

  return (
    <>
      <directionalLight
        ref={lightRef}
        color={SUN.color}
        intensity={SUN.intensity}
        castShadow
        shadow-mapSize-width={SUN.shadow.mapSize}
        shadow-mapSize-height={SUN.shadow.mapSize}
        shadow-camera-left={-SUN.shadow.size}
        shadow-camera-right={SUN.shadow.size}
        shadow-camera-top={SUN.shadow.size}
        shadow-camera-bottom={-SUN.shadow.size}
        shadow-camera-near={1}
        shadow-camera-far={320}
        shadow-bias={SUN.shadow.bias}
        shadow-normalBias={SUN.shadow.normalBias}
      />
      <object3D ref={targetRef} />
    </>
  )
}

/**
 * The world is generated synchronously on mount; this flips the "ready" flag
 * after the first rendered frame so the title screen can enable Play.
 */
function ReadySignal() {
  const setReady = useGameStore((state) => state.setReady)
  const reported = useRef(false)

  useFrame(() => {
    if (reported.current) return
    reported.current = true
    setReady(true)
  })

  return null
}
