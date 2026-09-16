import { useEffect, useMemo } from 'react'
import {
  RESOLVED_ROADS,
  buildCenterLineGeometry,
  buildRoadGeometry,
} from './roadNetwork.js'
import { sampler } from './terrain.js'

/**
 * Road ribbons.
 *
 * The tarmac/dirt strips are draped over the already-flattened corridor, so
 * they always sit a few centimetres above the terrain and never z-fight.
 * Roads are visual only - the trimesh terrain underneath already provides the
 * collision surface, which keeps the physics world light.
 */

const SURFACES = {
  asphalt: {
    color: '#4a4642',
    roughness: 0.9,
    metalness: 0.0,
    lift: 0.09,
    lineColor: '#e8dfc8',
  },
  dirt: {
    color: '#8a5a3c',
    roughness: 0.98,
    metalness: 0.0,
    lift: 0.07,
    lineColor: null,
  },
}

export function Roads() {
  const built = useMemo(
    () =>
      RESOLVED_ROADS.map((road) => {
        const surface = SURFACES[road.surface] ?? SURFACES.dirt
        const geometry = buildRoadGeometry(road, sampler, { lift: surface.lift })
        const centerLine =
          road.centerLine && surface.lineColor
            ? buildCenterLineGeometry(road, sampler, { lift: surface.lift + 0.06 })
            : null
        return { road, surface, geometry, centerLine }
      }),
    [],
  )

  useEffect(
    () => () => {
      built.forEach(({ geometry, centerLine }) => {
        geometry.dispose()
        centerLine?.dispose()
      })
    },
    [built],
  )

  return (
    <group name="roads">
      {built.map(({ road, surface, geometry, centerLine }) => (
        <group key={road.id}>
          <mesh geometry={geometry} receiveShadow name={`road-${road.id}`}>
            <meshStandardMaterial
              color={surface.color}
              roughness={surface.roughness}
              metalness={surface.metalness}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
          {centerLine ? (
            <mesh geometry={centerLine} name={`road-${road.id}-centerline`}>
              <meshBasicMaterial color={surface.lineColor} toneMapped={false} opacity={0.75} transparent />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  )
}
