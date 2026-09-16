import { useEffect, useMemo } from 'react'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { buildTerrain } from './terrain.js'

/**
 * The island mesh + its trimesh collider.
 *
 * `buildTerrain()` produces both from the same height function, so the visible
 * surface and the physics surface are guaranteed to match (no invisible walls,
 * no sinking through hills). One draw call, one collider, 620 x 620 m.
 */
export function Terrain() {
  const terrain = useMemo(() => buildTerrain(), [])

  useEffect(() => {
    const { geometry } = terrain
    return () => geometry.dispose()
  }, [terrain])

  return (
    <RigidBody type="fixed" colliders={false} friction={0.95} restitution={0} name="terrain">
      <TrimeshCollider args={[terrain.vertices, terrain.indices]} friction={0.95} restitution={0} />
      <mesh geometry={terrain.geometry} receiveShadow castShadow={false} name="terrain-mesh">
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0.02} dithering />
      </mesh>
    </RigidBody>
  )
}
