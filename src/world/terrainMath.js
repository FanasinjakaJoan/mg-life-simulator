import { WORLD } from '../config/gameConfig.js'
import { clamp, fbm, ridged, smoothstep } from './noise.js'

/**
 * The raw shape of the island, before roads and the village are flattened in.
 *
 * Madagascar reads as three bands: a narrow coastal plain, a steep escarpment
 * and a highland plateau running along the long axis. `ISLAND_PROFILE` encodes
 * exactly that as a height cross-section over the normalised distance from the
 * island centre (`islandField`), which keeps slopes predictable everywhere.
 */

/** Rotate a world point into island-local space. */
export function islandLocal(x, z) {
  const { rotation } = WORLD.island
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return {
    x: x * cos - z * sin,
    z: x * sin + z * cos,
  }
}

/**
 * Normalised distance from the island centre: < 1 is land, > 1 is ocean.
 * The coastline is wobbled by noise so it never looks like a clean ellipse.
 */
export function islandField(x, z) {
  const local = islandLocal(x, z)
  const rx = local.x / WORLD.island.radiusX
  const rz = local.z / WORLD.island.radiusZ
  const radial = Math.sqrt(rx * rx + rz * rz)
  const wobble =
    fbm(x * 0.0060, z * 0.0060, { octaves: 3, seed: WORLD.seed + 91 }) * 0.14 +
    fbm(x * 0.026, z * 0.026, { octaves: 2, seed: WORLD.seed + 133 }) * 0.035
  return radial + wobble
}

/**
 * Cross-section of the island, from the interior (0) to deep ocean (>1.4).
 * Chosen so the coastal plain stays under ~8% grade while the escarpment and
 * the highlands give the map some real vertical drama.
 */
const ISLAND_PROFILE = [
  { f: 0.0, h: 34 },
  { f: 0.22, h: 29 },
  { f: 0.38, h: 22 },
  { f: 0.52, h: 15 },
  { f: 0.7, h: 8.5 },
  { f: 0.84, h: 4.0 },
  { f: 0.94, h: 1.6 },
  { f: 1.0, h: -0.8 },
  { f: 1.08, h: -6 },
  { f: 1.3, h: -20 },
  { f: 1.7, h: -32 },
]

/** Non-uniform Catmull-Rom through the profile stops (smooth, no terracing). */
function profileHeight(f) {
  const stops = ISLAND_PROFILE
  if (f <= stops[0].f) return stops[0].h
  const last = stops.length - 1
  if (f >= stops[last].f) return stops[last].h

  let i = 0
  while (i < last - 1 && f > stops[i + 1].f) i += 1

  const p1 = stops[i]
  const p2 = stops[i + 1]
  const p0 = stops[Math.max(0, i - 1)]
  const p3 = stops[Math.min(last, i + 2)]

  const span = p2.f - p1.f
  const t = (f - p1.f) / span
  const t2 = t * t
  const t3 = t2 * t

  const m1 = (p2.h - p0.h) / (p2.f - p0.f)
  const m2 = (p3.h - p1.h) / (p3.f - p1.f)

  const h =
    (2 * t3 - 3 * t2 + 1) * p1.h +
    (t3 - 2 * t2 + t) * m1 * span +
    (-2 * t3 + 3 * t2) * p2.h +
    (t3 - t2) * m2 * span

  // Guard against Catmull-Rom overshoot near sharp stops.
  const lo = Math.min(p1.h, p2.h) - 1
  const hi = Math.max(p1.h, p2.h) + 1
  return clamp(h, lo, hi)
}

/**
 * Terrain elevation ignoring roads / village pads.
 * Sea level is `WORLD.seaLevel`; the coastal plain sits around 2-8 m, the
 * escarpment climbs to ~20 m and the highlands peak near 45 m.
 */
export function baseHeight(x, z) {
  const field = islandField(x, z)
  const profile = profileHeight(field)

  // Hills are dramatic inland and shrink to soft undulations on the plain.
  const hillAmp = 1.4 + 6.4 * (1 - smoothstep(0.45, 0.9, field))
  const hills = fbm(x * 0.0125, z * 0.0125, { octaves: 4, seed: WORLD.seed }) * hillAmp
  const detail = fbm(x * 0.052, z * 0.052, { octaves: 3, seed: WORLD.seed + 7 }) * 0.9

  // Ridged spine only in the deep interior, so the highlands have a crest.
  const spineMask = smoothstep(0.62, 0.18, field)
  const spine = Math.pow(ridged(x * 0.0046, z * 0.0046, { octaves: 3, seed: WORLD.seed + 23 }), 2.1)
  const mountain = spine * 15 * spineMask

  // Only apply hills where there is land, so beaches stay clean and flat.
  const landMask = smoothstep(0.78, 1.02, field)
  const relief = (hills + detail) * (1 - landMask)

  return profile + relief + mountain
}

/** Elevation of the ground at a point (raw terrain, roads excluded). */
export function groundY(x, z) {
  return baseHeight(x, z)
}

/** Approximate surface normal via central differences. */
export function baseNormal(x, z, epsilon = 1.5) {
  const hL = baseHeight(x - epsilon, z)
  const hR = baseHeight(x + epsilon, z)
  const hD = baseHeight(x, z - epsilon)
  const hU = baseHeight(x, z + epsilon)
  const nx = hL - hR
  const ny = 2 * epsilon
  const nz = hD - hU
  const length = Math.hypot(nx, ny, nz) || 1
  return { x: nx / length, y: ny / length, z: nz / length }
}

/** Slope in radians (0 = flat). */
export function baseSlope(x, z, epsilon = 3) {
  const normal = baseNormal(x, z, epsilon)
  return Math.acos(clamp(normal.y, -1, 1))
}

/** Max height difference sampled on a ring - a quick "is it buildable?" test. */
export function reliefOver(x, z, radius, samples = 16) {
  let min = baseHeight(x, z)
  let max = min
  for (let i = 0; i < samples; i += 1) {
    const angle = (i / samples) * Math.PI * 2
    const h = baseHeight(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius)
    if (h < min) min = h
    if (h > max) max = h
  }
  return max - min
}

export { WORLD }
