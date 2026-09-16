import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { PALETTE, PLAYER } from '../config/gameConfig.js'

/**
 * Low-poly mannequin used as the player avatar.
 *
 * Swapping in a real character later is a one-file change: keep the same root
 * transform (feet at y = 0, facing -Z) and replace the meshes below. Animation
 * is driven by `motionRef`, a plain mutable object the controller writes to
 * every physics step, so the model never triggers a React re-render.
 *
 * motionRef shape: { speed, maxSpeed, grounded, riding }
 */
export function PlayerModel({ motionRef }) {
  const rootRef = useRef(null)
  const hipsRef = useRef(null)
  const armLeftRef = useRef(null)
  const armRightRef = useRef(null)
  const legLeftRef = useRef(null)
  const legRightRef = useRef(null)
  const phaseRef = useRef(0)

  const materials = useMemo(
    () => ({
      shirt: new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: 0.85 }),
      shorts: new THREE.MeshStandardMaterial({ color: '#3e4a5a', roughness: 0.85 }),
      skin: new THREE.MeshStandardMaterial({ color: '#8a5a38', roughness: 0.75 }),
      wrap: new THREE.MeshStandardMaterial({ color: PALETTE.taxiBeBlue, roughness: 0.8 }),
      hair: new THREE.MeshStandardMaterial({ color: '#241a14', roughness: 0.9 }),
    }),
    [],
  )

  const feetY = -PLAYER.halfHeight - PLAYER.radius
  const hipsY = feetY + 0.78

  useFrame((state, delta) => {
    const motion = motionRef.current
    if (!motion) return

    const step = Math.min(delta, 0.05)
    const speed = Math.abs(motion.speed ?? 0)
    const stride = Math.min(speed / (motion.maxSpeed || PLAYER.sprintSpeed), 1.4)

    phaseRef.current += step * (2.0 + stride * 7.4)
    const swing = Math.sin(phaseRef.current) * (0.1 + stride * 0.78)
    const bob = Math.abs(Math.sin(phaseRef.current)) * (0.015 + stride * 0.05)

    if (hipsRef.current) {
      hipsRef.current.position.y = hipsY + bob
      hipsRef.current.rotation.x = stride * 0.12
      if (stride < 0.05 && !motion.riding) {
        hipsRef.current.position.y = hipsY + Math.sin(state.clock.elapsedTime * 1.6) * 0.012
      }
    }

    const riding = Boolean(motion.riding)
    if (legLeftRef.current) legLeftRef.current.rotation.x = riding ? -1.15 : swing
    if (legRightRef.current) legRightRef.current.rotation.x = riding ? -1.15 : -swing
    if (armLeftRef.current) {
      armLeftRef.current.rotation.x = riding ? -0.85 : -swing * 0.85
      armLeftRef.current.rotation.z = riding ? 0.3 : 0.06
    }
    if (armRightRef.current) {
      armRightRef.current.rotation.x = riding ? -0.85 : swing * 0.85
      armRightRef.current.rotation.z = riding ? -0.3 : -0.06
    }
  })

  return (
    <group ref={rootRef} name="player-model">
      <group ref={hipsRef} name="hips" position={[0, hipsY, 0]}>
        <mesh castShadow name="torso" position={[0, 0.28, 0]} material={materials.shirt}>
          <capsuleGeometry args={[0.19, 0.34, 4, 10]} />
        </mesh>
        <mesh castShadow name="shirtHem" position={[0, 0.02, 0]} material={materials.shorts}>
          <boxGeometry args={[0.35, 0.24, 0.24]} />
        </mesh>

        <group position={[0, 0.62, 0]} name="head">
          <mesh castShadow material={materials.skin}>
            <sphereGeometry args={[0.13, 14, 12]} />
          </mesh>
          <mesh position={[0, 0.06, 0]} material={materials.hair}>
            <sphereGeometry args={[0.136, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          {/* Malagasy lamba-style head wrap */}
          <mesh position={[0, 0.03, 0]} material={materials.wrap}>
            <cylinderGeometry args={[0.139, 0.139, 0.06, 14]} />
          </mesh>
          <mesh position={[0, -0.015, -0.13]} material={materials.hair}>
            <boxGeometry args={[0.05, 0.02, 0.01]} />
          </mesh>
        </group>

        <group ref={armLeftRef} name="armLeft" position={[-0.245, 0.42, 0]}>
          <mesh castShadow position={[0, -0.18, 0]} material={materials.skin}>
            <capsuleGeometry args={[0.055, 0.3, 3, 8]} />
          </mesh>
        </group>
        <group ref={armRightRef} name="armRight" position={[0.245, 0.42, 0]}>
          <mesh castShadow position={[0, -0.18, 0]} material={materials.skin}>
            <capsuleGeometry args={[0.055, 0.3, 3, 8]} />
          </mesh>
        </group>

        <group ref={legLeftRef} name="legLeft" position={[-0.1, -0.02, 0]}>
          <mesh castShadow position={[0, -0.22, 0]} material={materials.shorts}>
            <capsuleGeometry args={[0.075, 0.4, 3, 8]} />
          </mesh>
        </group>
        <group ref={legRightRef} name="legRight" position={[0.1, -0.02, 0]}>
          <mesh castShadow position={[0, -0.22, 0]} material={materials.shorts}>
            <capsuleGeometry args={[0.075, 0.4, 3, 8]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
