import { useEffect, useMemo } from 'react'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { buildTerrain } from './terrain.js'
import { getGrainTexture } from './proceduralTextures.js'

/**
 * The island mesh + its trimesh collider.
 *
 * `buildTerrain()` produces both from the same height function, so the visible
 * surface and the physics surface are guaranteed to match (no invisible walls,
 * no sinking through hills). One draw call, one collider, 620 x 620 m.
 *
 * The PBR finish is vertex colours (laterite / grass / jungle) plus a tileable
 * procedural grain used as bump + roughness detail, so the red earth reads as
 * soil under the sun instead of flat paint.
 */
export function Terrain() {
  const terrain = useMemo(() => buildTerrain(), [])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.98,
        metalness: 0.02,
        dithering: true,
        bumpMap: getGrainTexture(256, 96, 0.7, 1, 7),
        bumpScale: 0.22,
        roughnessMap: getGrainTexture(256, 96, 0.7, 1, 7),
        envMapIntensity: 0.35,
      }),
    [],
  )

  useEffect(() => {
    const { geometry } = terrain
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [terrain, material])

  return (
    <RigidBody type="fixed" colliders={false} friction={0.95} restitution={0} name="terrain">
      <TrimeshCollider args={[terrain.vertices, terrain.indices]} friction={0.95} restitution={0} />
      <mesh geometry={terrain.geometry} material={material} receiveShadow castShadow={false} name="terrain-mesh" />
    </RigidBody>
  )
}
