import * as THREE from 'three'
import { biomeAt, getBiome } from './biomes.js'
import { PALETTE, WORLD } from '../config/gameConfig.js'
import { clamp, fbm, hash2, smoothstep } from './noise.js'
import { baseHeight, baseNormal } from './terrainMath.js'
import { VILLAGE_PADS, roadInfluence } from './roadNetwork.js'

/**
 * Final terrain definition.
 *
 * `terrainHeight` = procedural island shape + the flattened road corridors
 * + the village pads. Because it is a pure function of (x, z) the very same
 * function feeds the render mesh, the Rapier trimesh collider and every prop
 * placement, so nothing ever floats or sinks.
 */

/** Cache the last sample: prop placement queries the same spots repeatedly. */
let cachedX = Number.NaN
let cachedZ = Number.NaN
let cachedH = 0

export function terrainHeight(x, z) {
  if (x === cachedX && z === cachedZ) return cachedH

  let height = baseHeight(x, z)

  // 1. Village basin: soft, broad flattening of the settlement footprint.
  // 2. Plaza: hard flat pad (applied after the basin so it wins locally).
  for (let i = 0; i < VILLAGE_PADS.length; i += 1) {
    const pad = VILLAGE_PADS[i]
    const distance = Math.hypot(x - pad.x, z - pad.z)
    const outer = pad.radius + pad.feather
    if (distance >= outer) continue
    const weight = (1 - smoothstep(pad.radius, outer, distance)) * pad.strength
    height += (pad.height - height) * weight
  }

  // 3. Road corridors last so the tarmac stays perfectly drivable.
  const road = roadInfluence(x, z)
  if (road && road.weight > 0) {
    height += (road.height - height) * road.weight * 0.96
  }

  cachedX = x
  cachedZ = z
  cachedH = height
  return height
}

/** No-cache height lookup (used while building the grid). */
export function terrainHeightRaw(x, z) {
  let height = baseHeight(x, z)
  for (let i = 0; i < VILLAGE_PADS.length; i += 1) {
    const pad = VILLAGE_PADS[i]
    const distance = Math.hypot(x - pad.x, z - pad.z)
    const outer = pad.radius + pad.feather
    if (distance >= outer) continue
    const weight = (1 - smoothstep(pad.radius, outer, distance)) * pad.strength
    height += (pad.height - height) * weight
  }
  const road = roadInfluence(x, z)
  if (road && road.weight > 0) {
    height += (road.height - height) * road.weight * 0.96
  }
  return height
}

/** Approximate ground normal of the flattened terrain. */
export function terrainNormal(x, z, epsilon = 1.2, target = new THREE.Vector3()) {
  const hL = terrainHeight(x - epsilon, z)
  const hR = terrainHeight(x + epsilon, z)
  const hD = terrainHeight(x, z - epsilon)
  const hU = terrainHeight(x, z + epsilon)
  target.set(hL - hR, 2 * epsilon, hD - hU).normalize()
  return target
}

/** Slope of the flattened terrain in radians (0 = flat). */
export function terrainSlope(x, z, epsilon = 2.5) {
  const normal = terrainNormal(x, z, epsilon, SCRATCH_NORMAL)
  return Math.acos(clamp(normal.y, -1, 1))
}

const SCRATCH_NORMAL = new THREE.Vector3()

/* ------------------------------------------------------------------ */
/* Vertex colours                                                      */
/* ------------------------------------------------------------------ */

const COLOR = new THREE.Color()

/**
 * Pick a ground colour: red laterite soil over most of the island, dry golden
 * grass on the rolling hills, green where the highlands are wet, sand at the
 * waterline and dark mud under the sea.
 */
export function surfaceColor(x, z, height, slope, out = COLOR) {
  const wetness = fbm(x * 0.008, z * 0.008, { octaves: 3, seed: WORLD.seed + 411 })
  const patch = fbm(x * 0.09, z * 0.09, { octaves: 2, seed: WORLD.seed + 517 })

  if (height < 0.35) {
    // Sea floor: shaded by depth so the shallows read as turquoise sand.
    const depth = clamp((0.35 - height) / 14, 0, 1)
    out.set(PALETTE.sand).lerp(new THREE.Color(PALETTE.waterDeep), depth * 0.85)
    return out
  }

  if (height < 1.6) {
    out.set(PALETTE.sand).lerp(new THREE.Color(PALETTE.dryGrass), smoothstep(0.9, 1.6, height))
    return out
  }

  // Seven longitudinal/climatic regions, rather than generic tropical grass.
  const biome = biomeAt(x, z)
  const ground = getBiome(biome)
  const accent = {
    rainforest: '#345535', highlands: '#b36b42', baobabs: '#bda765',
    spiny: '#cb9460', volcanic: '#4f6650', coast: '#c8bf9b', rivers: '#668354',
  }
  const blend = clamp(.26 + wetness * .3 + patch * .23, .05, .65)
  out.set(ground.soil).lerp(new THREE.Color(accent[biome]), blend)

  // Steep faces expose rock and raw laterite.
  if (slope > 0.42) {
    out.lerp(new THREE.Color(PALETTE.lateriteDark), smoothstep(0.42, 0.9, slope) * 0.6)
  }
  if (slope > 0.85) {
    out.lerp(new THREE.Color(PALETTE.rock), smoothstep(0.85, 1.2, slope) * 0.5)
  }

  // Fine mottling so large flats do not look like flat paint.
  const mottle = 0.92 + hash2(Math.round(x * 0.7), Math.round(z * 0.7), 77) * 0.16
  out.multiplyScalar(mottle)
  return out
}

/* ------------------------------------------------------------------ */
/* Mesh + collider data                                                */
/* ------------------------------------------------------------------ */

/**
 * Build the island: a single indexed grid mesh with baked vertex colours plus
 * the raw arrays Rapier needs for the trimesh collider.
 */
export function buildTerrain({ size = WORLD.size, segments = WORLD.segments } = {}) {
  const vertexCount = (segments + 1) * (segments + 1)
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const indices = new Uint32Array(segments * segments * 6)

  const step = size / segments
  const half = size / 2

  // Pass 1: heights.
  for (let iz = 0; iz <= segments; iz += 1) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const x = ix * step - half
      const z = iz * step - half
      const index = (iz * (segments + 1) + ix) * 3
      const height = terrainHeightRaw(x, z)
      positions[index] = x
      positions[index + 1] = height
      positions[index + 2] = z
      cachedX = Number.NaN // cache is invalid for grid building
    }
  }

  // Pass 2: colours (slope comes straight from the sampled grid for speed).
  const heightAtGrid = (ix, iz) => {
    const cx = clamp(ix, 0, segments)
    const cz = clamp(iz, 0, segments)
    return positions[(cz * (segments + 1) + cx) * 3 + 1]
  }

  for (let iz = 0; iz <= segments; iz += 1) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const index = (iz * (segments + 1) + ix) * 3
      const x = positions[index]
      const z = positions[index + 2]
      const height = positions[index + 1]
      const dhd = (heightAtGrid(ix + 1, iz) - heightAtGrid(ix - 1, iz)) / (2 * step)
      const dhz = (heightAtGrid(ix, iz + 1) - heightAtGrid(ix, iz - 1)) / (2 * step)
      const slope = Math.atan(Math.hypot(dhd, dhz))
      const color = surfaceColor(x, z, height, slope)
      colors[index] = color.r
      colors[index + 1] = color.g
      colors[index + 2] = color.b
    }
  }

  // Indices (counter-clockwise when viewed from above -> outward normals).
  let cursor = 0
  for (let iz = 0; iz < segments; iz += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const a = iz * (segments + 1) + ix
      const b = a + 1
      const c = a + segments + 1
      const d = c + 1
      indices[cursor] = a
      indices[cursor + 1] = c
      indices[cursor + 2] = b
      indices[cursor + 3] = b
      indices[cursor + 4] = c
      indices[cursor + 5] = d
      cursor += 6
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return { geometry, vertices: positions, indices, size, segments, step }
}

/** Height sampler used by the road ribbons and prop placement. */
export const sampler = {
  heightAt: (x, z) => terrainHeight(x, z),
}

/** Convenience: does this world position sit under the sea? */
export function isUnderwater(x, z) {
  return terrainHeight(x, z) < WORLD.seaLevel
}

/** Distance from a point to the island coastline (negative = at sea). */
export function inlandDepth(x, z) {
  return baseHeight(x, z)
}

export { baseNormal }
