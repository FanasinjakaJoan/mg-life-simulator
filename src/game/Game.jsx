import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { Scene } from '../game/Scene.jsx'
import { Hud } from '../ui/Hud.jsx'

import { ErrorBoundary, ErrorOverlay } from '../ui/ErrorOverlay.jsx'
import { CAMERA, PLAYER, QUALITY } from '../config/gameConfig.js'
import { cameraState } from '../state/cameraState.js'
import { attachInput } from '../state/input.js'
import { useGameStore } from '../state/useGameStore.js'

/**
 * Application shell: the WebGL canvas, the DOM overlays and the global
 * keyboard/pointer plumbing.
 */
export default function Game() {
  const canvasWrapper = useRef(null)
  const physicsDebug = useGameStore((state) => state.physicsDebug)
  const isReady = useGameStore((state) => state.isReady)
  const quality = useGameStore((state) => state.quality)
  const preset = QUALITY[quality]

  // Effective internal resolution. Starts at the preset ceiling and the
  // PerformanceMonitor nudges it up/down inside [dprMin, dprMax] at runtime,
  // so the frame rate holds even when the island gets busy.
  const [dpr, setDpr] = useState(() => QUALITY[useGameStore.getState().quality].dprMax)
  useEffect(() => {
    setDpr(QUALITY[quality].dprMax)
  }, [quality])

  const nudgeDpr = useCallback(
    (steps) => {
      setDpr((current) => {
        const next = Math.round((current + steps * 0.25) * 100) / 100
        return THREE.MathUtils.clamp(next, preset.dprMin, preset.dprMax)
      })
    },
    [preset],
  )

  // Reset orbit between expeditions; pointer lock only follows a canvas click.
  useEffect(() => {
    const openingYaw = { coast: Math.PI / 2, volcanic: -.65, rivers: -1.4, baobabs: .6 }
    cameraState.yaw = openingYaw[useGameStore.getState().selectedBiome] ?? 0
    cameraState.pitch = 0.4
    cameraState.distance = 9
    return attachInput()
  }, [])

  // UI-level shortcuts that never touch the simulation: H, F3 and P (quality;
  // Q is a movement key on AZERTY so it is off-limits).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'KeyH') {
        useGameStore.getState().toggleHelp()
      } else if (event.code === 'F3') {
        event.preventDefault()
        useGameStore.getState().togglePhysicsDebug()
      } else if (event.code === 'KeyP') {
        useGameStore.getState().cycleQuality()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Pointer lock is optional: the camera also works with plain mouse movement.
  useEffect(() => {
    const supported = typeof document.body.requestPointerLock === 'function'
    useGameStore.getState().setPointerLockSupported(supported)
    if (!supported) return undefined

    const onPointerLockChange = () => {
      useGameStore.getState().setPointerLocked(document.pointerLockElement != null)
    }
    const onPointerLockError = () => {
      useGameStore.getState().setPointerLockSupported(false)
      useGameStore.getState().setPointerLocked(false)
    }
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('pointerlockerror', onPointerLockError)
    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('pointerlockerror', onPointerLockError)
    }
  }, [])

  const requestPointerLock = useCallback(() => {
    const { hasStarted: started, pointerLockSupported, isPointerLocked } = useGameStore.getState()
    if (!started || !pointerLockSupported || isPointerLocked) return
    const element = canvasWrapper.current?.querySelector('canvas')
    const result = element?.requestPointerLock?.()
    if (result && typeof result.catch === 'function') result.catch(() => {})
  }, [])

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-slate-950">
      <div ref={canvasWrapper} className="absolute inset-0" onPointerDown={requestPointerLock}>
        <ErrorBoundary>
          <Canvas
            shadows
            dpr={dpr}
            camera={{
              fov: CAMERA.fov,
              near: CAMERA.near,
              far: CAMERA.far,
              // Roughly behind the player: the camera rig snaps into place on
              // the first frame, this only avoids an empty first paint.
              position: [PLAYER.spawn[0] + 6, PLAYER.spawn[1] + 9, PLAYER.spawn[2] + 11],
            }}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              // Used whenever the post pipeline is off (low preset); the
              // EffectComposer takes over tone mapping otherwise.
              toneMapping: THREE.ACESFilmicToneMapping,
            }}
          >
            <Suspense fallback={null}>
              <Scene physicsDebug={physicsDebug} />
              <DprGovernor onNudge={nudgeDpr} />
            </Suspense>
          </Canvas>
        </ErrorBoundary>
      </div>

      <Hud />
      {!isReady && <div className="game-loading">Génération du monde…</div>}

      <ErrorOverlay />
    </div>
  )
}

/**
 * Adaptive resolution governor.
 *
 * drei's PerformanceMonitor watches the frame time with hysteresis and
 * reports declines/inclines; each one rescales the pixel ratio by a quarter
 * stop inside the quality preset's band. It also publishes the live ratio to
 * the store (throttled) for the HUD readout.
 */
function DprGovernor({ onNudge }) {
  const gl = useThree((state) => state.gl)
  const published = useRef(0)

  useFrame(() => {
    const ratio = gl.getPixelRatio()
    if (Math.abs(ratio - published.current) >= 0.05) {
      published.current = ratio
      useGameStore.getState().setEffectiveDpr(ratio)
    }
  })

  // `flipflops` left at its default (Infinity): we want the monitor to keep
  // re-evaluating forever, not to give up after a few oscillations.
  return (
    <PerformanceMonitor
      onIncline={() => onNudge(1)}
      onDecline={() => onNudge(-1)}
    />
  )
}
