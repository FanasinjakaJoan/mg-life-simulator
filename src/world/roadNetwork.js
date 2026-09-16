import * as THREE from 'three'
import { WORLD } from '../config/gameConfig.js'
import { baseHeight } from './terrainMath.js'
import { clamp, smoothstep } from './noise.js'

/**
 * Hand-authored road network.
 *
 * Roads do three jobs in the MVP:
 *  1. flatten the terrain along a corridor so driving feels smooth,
 *  2. structure the village (the RN7 crosses a market street on the plaza),
 *  3. connect the coastal village to the highlands and the beach.
 *
 * Coordinates are `[x, z]` in world space. `surface` selects the material used
 * by the road renderer, `width` is the full drivable width in metres.
 *
 * Endpoints are automatically pulled inland until they sit above
 * `LAND_DATUM`, so the network stays valid even if the world seed changes.
 */
export const ROADS = [
  {
    id: 'rn7',
    name: 'Route Nationale 7',
    width: 9,
    surface: 'asphalt',
    shoulder: 9,
    centerLine: true,
    points: [
      [140, 246],
      [128, 224],
      [120, 200], // village plaza
      [100, 168],
      [74, 140],
      [50, 112],
      [30, 80],
      [14, 40],
      [0, 0],
      [-16, -44],
      [-30, -84],
      [-46, -124],
      [-60, -162],
      [-74, -200],
      [-86, -238],
      [-96, -262],
    ],
  },
  {
    id: 'marche',
    name: 'Rue du Marché',
    width: 7,
    surface: 'dirt',
    shoulder: 6,
    points: [
      [76, 217],
      [98, 206],
      [120, 196],
      [144, 184],
      [168, 172],
    ],
  },
  {
    id: 'gargotes',
    name: 'Allée des Gargotes',
    width: 6.5,
    surface: 'dirt',
    shoulder: 6,
    points: [
      [134, 236],
      [158, 224],
      [150, 196],
      [128, 168],
      [112, 158],
    ],
  },
  {
    id: 'plage',
    name: 'Piste de la Plage',
    width: 5.5,
    surface: 'dirt',
    shoulder: 5,
    points: [
      [140, 210],
      [168, 206],
      [190, 202],
      [206, 196],
    ],
  },
]

/** Any road point below this elevation is pulled back toward dry land. */
const LAND_DATUM = 2.4

/** Village plaza - a deliberately flat pad for buildings and the player spawn. */
export const VILLAGE = {
  center: { x: 120, z: 200 },
  plazaRadius: 26,
  plazaFeather: 18,
  /** Extra flattening applied to the whole settlement footprint. */
  basinRadius: 112,
  basinFeather: 44,
  basinStrength: 0.55,
}

/* ------------------------------------------------------------------ */
/* Height profile                                                      */
/* ------------------------------------------------------------------ */

const MAX_GRADE = 0.12 // ~6.8°: keeps every road comfortable in a taxi-bé

/**
 * The village sits on a levelled datum instead of the raw terrain: roads
 * approaching it are eased into that level so the plaza (and everything built
 * on it) is genuinely flat, with no embankment at the settlement edge.
 */
const VILLAGE_DATUM = baseHeight(VILLAGE.center.x, VILLAGE.center.z) + 0.35
const LEVEL_RADIUS = 46
const LEVEL_FEATHER = 210
const LEVEL_STRENGTH = 1

/** Push road profile heights toward the village datum as they approach it. */
function levelAtVillage(points, heights, strength = LEVEL_STRENGTH) {
  const levelled = heights.slice()
  for (let i = 0; i < levelled.length; i += 1) {
    const distance = Math.hypot(points[i][0] - VILLAGE.center.x, points[i][1] - VILLAGE.center.z)
    if (distance >= LEVEL_RADIUS + LEVEL_FEATHER) continue
    const weight = (1 - smoothstep(LEVEL_RADIUS, LEVEL_RADIUS + LEVEL_FEATHER, distance)) * strength
    levelled[i] += (VILLAGE_DATUM - levelled[i]) * weight
  }
  return levelled
}

/**
 * Walk an endpoint toward its neighbour until the ground is above the datum,
 * so a road never ends in the sea.
 */
function trimToLand(points, datum = LAND_DATUM) {
  const out = points.map(([x, z]) => [x, z])
  for (const end of [0, out.length - 1]) {
    const dir = end === 0 ? 1 : -1
    for (let guard = 0; guard < 60; guard += 1) {
      const [x, z] = out[end]
      if (baseHeight(x, z) >= datum) break
      const neighbour = out[end + dir]
      if (!neighbour) break
      const step = 0.32
      out[end] = [x + (neighbour[0] - x) * step, z + (neighbour[1] - z) * step]
      if (Math.hypot(neighbour[0] - out[end][0], neighbour[1] - out[end][1]) < 1.5) break
    }
  }
  return out
}

/**
 * Symmetric (mean-preserving) grade limiter: over-steep segments are eased by
 * pulling BOTH endpoints toward the average slope, so running it after the
 * village levelling cannot shift the plaza off its datum.
 */
function limitGrade(heights, lengths, maxGrade = MAX_GRADE, passes = 6) {
  const out = heights.slice()
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 1; i < out.length; i += 1) {
      const maxDelta = maxGrade * lengths[i - 1]
      const delta = out[i] - out[i - 1]
      if (Math.abs(delta) > maxDelta) {
        const correction = (Math.abs(delta) - maxDelta) * 0.5 * Math.sign(delta)
        out[i] -= correction
        out[i - 1] += correction
      }
    }
  }
  return out
}

function buildProfile(points) {
  const raw = points.map(([x, z]) => baseHeight(x, z))
  const lengths = []
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
  }

  // 1. Smooth so the road does not inherit every bump of the hills.
  let smoothed = raw.slice()
  for (let pass = 0; pass < 10; pass += 1) {
    const next = smoothed.slice()
    for (let i = 1; i < smoothed.length - 1; i += 1) {
      next[i] = smoothed[i - 1] * 0.25 + smoothed[i] * 0.5 + smoothed[i + 1] * 0.25
    }
    smoothed = next
  }

  // 2. Cap the grade, 3. ease into the village datum, 4. cap the grade again
  //    (the levelling can steepen the approach).
  smoothed = limitGrade(smoothed, lengths)
  smoothed = levelAtVillage(points, smoothed)
  smoothed = limitGrade(smoothed, lengths)
  // 5. Final light levelling keeps the plaza inside its flat tolerance.
  smoothed = levelAtVillage(points, smoothed, 0.6)

  return { heights: smoothed, lengths }
}

/** Roads with their profiles resolved (the data the rest of the world uses). */
export const RESOLVED_ROADS = ROADS.map((road) => {
  const points = trimToLand(road.points)
  const { heights, lengths } = buildProfile(points)
  return { ...road, points, heights, lengths }
})

const SEGMENTS = []
RESOLVED_ROADS.forEach((road) => {
  for (let i = 1; i < road.points.length; i += 1) {
    const [ax, az] = road.points[i - 1]
    const [bx, bz] = road.points[i]
    const length = road.lengths[i - 1] || 1
    SEGMENTS.push({
      road,
      ax,
      az,
      ay: road.heights[i - 1],
      bx,
      bz,
      by: road.heights[i],
      length,
      dx: (bx - ax) / length,
      dz: (bz - az) / length,
      halfWidth: road.width * 0.5,
      outer: road.width * 0.5 + road.shoulder,
    })
  }
})

const BOUNDS = SEGMENTS.reduce(
  (acc, s) => {
    acc.minX = Math.min(acc.minX, s.ax - s.outer, s.bx - s.outer)
    acc.maxX = Math.max(acc.maxX, s.ax + s.outer, s.bx + s.outer)
    acc.minZ = Math.min(acc.minZ, s.az - s.outer, s.bz - s.outer)
    acc.maxZ = Math.max(acc.maxZ, s.az + s.outer, s.bz + s.outer)
    return acc
  },
  { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
)

/**
 * Closest point on the road network.
 * @returns {{distance:number, height:number, weight:number, road:string, halfWidth:number}|null}
 */
export function roadInfluence(x, z, padding = 0) {
  // Broad phase: skip the whole thing when far outside the network's bbox.
  if (
    x < BOUNDS.minX - padding ||
    x > BOUNDS.maxX + padding ||
    z < BOUNDS.minZ - padding ||
    z > BOUNDS.maxZ + padding
  ) {
    return null
  }

  let best = null
  for (let i = 0; i < SEGMENTS.length; i += 1) {
    const s = SEGMENTS[i]
    const wx = x - s.ax
    const wz = z - s.az
    const t = clamp((wx * s.dx + wz * s.dz) / s.length, 0, 1)
    const px = s.ax + (s.bx - s.ax) * t
    const pz = s.az + (s.bz - s.az) * t
    const distance = Math.hypot(x - px, z - pz)
    if (distance > s.outer + padding) continue
    if (!best || distance < best.distance) {
      best = {
        distance,
        height: s.ay + (s.by - s.ay) * t,
        halfWidth: s.halfWidth,
        outer: s.outer,
        road: s.road.id,
      }
    }
  }
  if (!best) return null

  // 1 on the tarmac, fading out across the shoulder.
  const weight = 1 - smoothstep(best.halfWidth * 0.9, best.outer, best.distance)
  return { distance: best.distance, height: best.height, weight, road: best.road, halfWidth: best.halfWidth }
}

/** Road surface height at the village centre - anchor for the plaza pad. */
const plazaAnchor = roadInfluence(VILLAGE.center.x, VILLAGE.center.z)
export const PLAZA_HEIGHT = plazaAnchor
  ? plazaAnchor.height
  : baseHeight(VILLAGE.center.x, VILLAGE.center.z)
export const VILLAGE_BASIN_HEIGHT = PLAZA_HEIGHT + 0.5

/** Order matters: broad basin first, then the hard plaza pad on top. */
export const VILLAGE_PADS = [
  {
    x: VILLAGE.center.x,
    z: VILLAGE.center.z,
    radius: VILLAGE.basinRadius,
    feather: VILLAGE.basinFeather,
    height: VILLAGE_BASIN_HEIGHT,
    strength: VILLAGE.basinStrength,
  },
  {
    x: VILLAGE.center.x,
    z: VILLAGE.center.z,
    radius: VILLAGE.plazaRadius,
    feather: VILLAGE.plazaFeather,
    height: PLAZA_HEIGHT,
    strength: 1,
  },
]

/* ------------------------------------------------------------------ */
/* Road meshes                                                         */
/* ------------------------------------------------------------------ */

const SAMPLE_STEP = 2.6 // metres between ribbon cross-sections

function densify(points, step = SAMPLE_STEP) {
  const out = []
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1]
    const [bx, bz] = points[i]
    const distance = Math.hypot(bx - ax, bz - az)
    const steps = Math.max(1, Math.round(distance / step))
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps
      out.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
  }
  out.push(points[points.length - 1])
  return out
}

/** Unit tangent + left-hand normal at sample `i` of a densified polyline. */
function frame(samples, i) {
  const [px, pz] = samples[Math.max(0, i - 1)]
  const [nx, nz] = samples[Math.min(samples.length - 1, i + 1)]
  let tx = nx - px
  let tz = nz - pz
  const length = Math.hypot(tx, tz) || 1
  tx /= length
  tz /= length
  return { tx, tz, nx: tz, nz: -tx }
}

/**
 * Build a ribbon following the (already flattened) road corridor.
 * @param {object} road resolved road
 * @param {{heightAt:(x:number,z:number)=>number}} sampler
 */
export function buildRoadGeometry(road, sampler, { lift = 0.1, widthScale = 1 } = {}) {
  const samples = densify(road.points)
  const half = road.width * 0.5 * widthScale
  const positions = []
  const uvs = []
  const indices = []

  let travelled = 0
  for (let i = 0; i < samples.length; i += 1) {
    const [x, z] = samples[i]
    const { nx, nz } = frame(samples, i)
    if (i > 0) travelled += Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1])

    for (let k = -1; k <= 1; k += 1) {
      const offX = x + nx * half * k
      const offZ = z + nz * half * k
      positions.push(offX, sampler.heightAt(offX, offZ) + lift, offZ)
      uvs.push((k + 1) / 2, travelled * 0.12)
    }

    if (i > 0) {
      const base = (i - 1) * 3
      const next = i * 3
      for (let k = 0; k < 2; k += 1) {
        indices.push(base + k, next + k, base + k + 1)
        indices.push(base + k + 1, next + k, next + k + 1)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Dashed centre-line geometry for asphalt roads. */
export function buildCenterLineGeometry(road, sampler, { lift = 0.16, halfWidth = 0.14 } = {}) {
  const samples = densify(road.points, 2.2)
  const positions = []
  const indices = []
  const DASH = 4
  let vertexCount = 0

  for (let i = 1; i < samples.length - 1; i += 1) {
    if (Math.floor(i / (DASH * 2)) % 2 !== 0) continue
    const [x, z] = samples[i]
    const { nx, nz } = frame(samples, i)
    const y = sampler.heightAt(x, z) + lift
    positions.push(x, y, z)
    positions.push(x + nx * halfWidth, y, z + nz * halfWidth)
    positions.push(x - nx * halfWidth, y, z - nz * halfWidth)
    if (vertexCount > 0) {
      const base = vertexCount - 3
      const next = vertexCount
      indices.push(base, next, base + 1, base + 1, next, next + 1)
      indices.push(base, next, base + 2, base + 2, next, next + 2)
    }
    vertexCount += 3
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Gameplay helper: is this spot on a drivable surface? */
export function isOnRoad(x, z, tolerance = 1.2) {
  const influence = roadInfluence(x, z)
  return Boolean(influence && influence.distance < influence.halfWidth + tolerance)
}

/**
 * Sample points along every road, with tangent/normal frames.
 * Used to line buildings, stalls, lamps and palms up with the streets.
 */
export function roadSamplePoints(step = 14) {
  const out = []
  for (const road of RESOLVED_ROADS) {
    const samples = densify(road.points, step)
    for (let i = 0; i < samples.length; i += 1) {
      const [x, z] = samples[i]
      const { tx, tz, nx, nz } = frame(samples, i)
      out.push({ x, z, tangentX: tx, tangentZ: tz, normalX: nx, normalZ: nz, road })
    }
  }
  return out
}

export { WORLD }
