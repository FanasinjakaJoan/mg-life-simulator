import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { buildBiomeGeometries, buildBiomeLayout } from './biomeGeometry.js'
import { PROP_MATERIAL_ROUGH } from './geometryUtils.js'
import { terrainHeight } from './terrain.js'
import { getPlayerPosition } from '../state/playerRegistry.js'
import { biomeAt, getBiome } from './biomes.js'
import { useGameStore } from '../state/useGameStore.js'
import { createRng } from './noise.js'

export function BiomeScenery() {
  const geometries = useMemo(buildBiomeGeometries, [])
  const layout = useMemo(buildBiomeLayout, [])
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries])
  return (
    <group name="seven-biome-scenery">
      {Object.entries(layout).map(([kind, items]) => (
        <Instances
          key={kind}
          geometry={geometries[kind]}
          material={PROP_MATERIAL_ROUGH}
          limit={Math.max(items.length, 1)}
          castShadow={kind !== 'grass'}
          receiveShadow
        >
          {items.map((p, i) => (
            <Instance
              key={i}
              position={[p.x, p.y - 0.1, p.z]}
              rotation={[0, p.yaw, 0]}
              scale={p.scale}
            />
          ))}
        </Instances>
      ))}
      <RigidBody type="fixed" colliders={false} name="biome-trunks">
        {Object.entries(layout)
          .filter(([kind]) => kind !== 'grass' && kind !== 'spiny')
          .flatMap(([kind, items]) =>
            items.map((p, i) => (
              <CylinderCollider
                key={`${kind}-${i}`}
                args={[
                  kind === 'baobab' ? 6 : 2,
                  (kind === 'baobab'
                    ? 1.8
                    : kind === 'tsingy'
                      ? 2.2
                      : kind === 'basalt'
                        ? 2.8
                        : 0.4) * p.scale,
                ]}
                position={[p.x, p.y + (kind === 'baobab' ? 6 : 2), p.z]}
              />
            )),
          )}
      </RigidBody>
      <RiceTerraces />
      <RegionalWater />
    </group>
  )
}

function RiceTerraces() {
  const pads = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const x = -32 + (i % 2) * 12,
          z = 9 + Math.floor(i / 2) * 10
        return { x, z, y: terrainHeight(x, z) + 0.8 }
      }),
    [],
  )
  return (
    <group name="highland-rice-terraces">
      {pads.map((p, i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={[p.x, p.y, p.z]}>
          <CuboidCollider args={[5, 1.6, 4]} position={[0, -1.6, 0]} />
          <mesh position={[0, -1.6, 0]} receiveShadow>
            <boxGeometry args={[10, 3.2, 8]} />
            <meshStandardMaterial color="#975d39" roughness={0.98} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
            <planeGeometry args={[9.3, 7.3]} />
            <meshStandardMaterial color="#789c72" roughness={0.17} metalness={0.32} />
          </mesh>
          {Array.from({ length: 7 }, (_, row) => (
            <mesh key={row} position={[0, 0.15, row - 3]} receiveShadow>
              <boxGeometry args={[8.5, 0.24, 0.16]} />
              <meshStandardMaterial color={row % 2 ? '#789d37' : '#97b54d'} roughness={0.85} />
            </mesh>
          ))}
        </RigidBody>
      ))}
    </group>
  )
}

function RegionalWater() {
  const geometry = useMemo(() => {
    const points = [],
      indices = []
    for (let i = 0; i <= 60; i++) {
      const z = 28 + i * 1.8,
        x = 182 + Math.sin(z * 0.03) * 8
      points.push(x - 3, 6.2, z, x + 3, 6.2, z)
      if (i < 60) {
        const a = i * 2
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <group name="freshwater-and-lagoon">
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#95845b"
          roughness={0.22}
          metalness={0.28}
          transparent
          opacity={0.88}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-276, 0.08, -105]}>
        <circleGeometry args={[31, 48]} />
        <meshStandardMaterial
          color="#00bdb1"
          roughness={0.2}
          metalness={0.25}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// Lightweight weather, tied to the player's actual position rather than the
// atlas selection. It blends across boundaries. No volumetric-rendering claim.
export function BiomeWeather() {
  const points = useRef(null)
  const rainGeo = useMemo(() => {
    const rng = createRng(726),
      positions = new Float32Array(600 * 3)
    for (let i = 0; i < 600; i++) {
      positions[i * 3] = (rng() - 0.5) * 65
      positions[i * 3 + 1] = rng() * 35
      positions[i * 3 + 2] = (rng() - 0.5) * 65
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [])
  useEffect(() => () => rainGeo.dispose(), [rainGeo])
  const weatherColor = useMemo(() => new THREE.Color(), [])
  useFrame((state, dt) => {
    const player = getPlayerPosition()
    if (!player || !points.current) return
    const biome = getBiome(biomeAt(player.x, player.z))
    if (useGameStore.getState().currentBiome !== biome.id)
      useGameStore.setState({ currentBiome: biome.id })
    const raining = (state.clock.elapsedTime % 100) / 100 < biome.rain && biome.rain > 0.5
    const wet = raining ? 1 : 0
    const fog = state.scene.fog
    if (fog) {
      fog.near = THREE.MathUtils.damp(fog.near, wet ? 20 : 90, 1, dt)
      fog.far = THREE.MathUtils.damp(fog.far, wet ? 160 : 430, 1, dt)
      weatherColor.set(wet ? '#a4b6ab' : '#c9dcc7')
      fog.color.lerp(weatherColor, Math.min(dt, 1))
    }
    points.current.visible = raining
    points.current.position.set(player.x, player.y, player.z)
    if (!raining) return
    const a = rainGeo.attributes.position
    for (let i = 0; i < a.count; i++) {
      a.array[i * 3 + 1] -= Math.min(dt, 0.1) * 20
      if (a.array[i * 3 + 1] < -3) a.array[i * 3 + 1] += 38
    }
    a.needsUpdate = true
  })
  return (
    <points ref={points} geometry={rainGeo} frustumCulled={false}>
      <pointsMaterial color="#d9e6e0" size={0.09} transparent opacity={0.5} depthWrite={false} />
    </points>
  )
}
