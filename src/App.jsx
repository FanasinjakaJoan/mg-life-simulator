import { Suspense, useCallback, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Scene } from './game/Scene.jsx'
import { Hud } from './ui/Hud.jsx'
import { StartOverlay } from './ui/StartOverlay.jsx'
import { ErrorBoundary, ErrorOverlay } from './ui/ErrorOverlay.jsx'
import { CAMERA, PLAYER } from './config/gameConfig.js'
import { attachInput } from './state/input.js'
import { useGameStore } from './state/useGameStore.js'

/**
 * Application shell: the WebGL canvas, the DOM overlays and the global
 * keyboard/pointer plumbing.
 */
export default function App() {
  const canvasWrapper = useRef(null)
  const physicsDebug = useGameStore((state) => state.physicsDebug)
  const hasStarted = useGameStore((state) => state.hasStarted)

  // Raw keyboard/mouse listeners live outside React (no re-renders per frame).
  useEffect(() => attachInput(), [])

  // UI-level shortcuts that never touch the simulation: H and F3.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'KeyH') {
        useGameStore.getState().toggleHelp()
      } else if (event.code === 'F3') {
        event.preventDefault()
        useGameStore.getState().togglePhysicsDebug()
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

  // Grabbing the pointer as soon as the player hits Play feels natural.
  useEffect(() => {
    if (hasStarted) requestPointerLock()
  }, [hasStarted, requestPointerLock])

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-slate-950">
      <div ref={canvasWrapper} className="absolute inset-0" onPointerDown={requestPointerLock}>
        <ErrorBoundary>
          <Canvas
            shadows
            dpr={[1, 1.75]}
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
              toneMapping: THREE.ACESFilmicToneMapping,
            }}
          >
            <Suspense fallback={null}>
              <Scene physicsDebug={physicsDebug} />
            </Suspense>
          </Canvas>
        </ErrorBoundary>
      </div>

      <Hud />
      <StartOverlay />
      <ErrorOverlay />
    </div>
  )
}
