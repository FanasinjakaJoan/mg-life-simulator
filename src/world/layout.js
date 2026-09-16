import { VILLAGE } from './roadNetwork.js'
import { WORLD } from '../config/gameConfig.js'
import { createRng, smoothstep } from './noise.js'
import { terrainHeight, terrainSlope } from './terrain.js'
import { RESOLVED_ROADS, roadInfluence, roadSamplePoints } from './roadNetwork.js'

/**
 * Deterministic prop layout.
 *
 * Everything the player can bump into (houses, gargotes, lamps, trees, rocks,
 * zebu) is placed here once, using the same terrain function as the mesh and
 * the collider, so nothing ever floats or sinks. Changing `WORLD.seed`
 * reshuffles the whole settlement.
 */

export const PROP_COUNTS = {
  villageHouses: 22,
  hamletHouses: 6,
  hamlets: 3,
  stalls: 16,
  palms: 150,
  trees: 190,
  rocks: 70,
  bushes: 260,
  zebu: 7,
}

export function buildWorldLayout(seed = WORLD.seed) {
  const rng = createRng(seed * 31 + 7)
  const range = (min, max) => min + (max - min) * rng()
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length]

  const occupied = []
  const houses = []
  const stalls = []
  const lamps = []
  const trees = []
  const palms = []
  const rocks = []
  const zebus = []
  const bushes = []
  const signs = []

  const isFree = (x, z, radius) => {
    for (let i = 0; i < occupied.length; i += 1) {
      const o = occupied[i]
      const dx = x - o.x
      const dz = z - o.z
      const min = o.radius + radius
      if (dx * dx + dz * dz < min * min) return false
    }
    return true
  }

  const offRoad = (x, z, margin) => {
    const influence = roadInfluence(x, z)
    return !influence || influence.distance > influence.halfWidth + margin
  }

  /** Place a prop if the terrain is sane; returns the ground height or null. */
  const tryPlace = (x, z, radius, { maxSlope = 0.45, roadMargin = 2, spacing = true } = {}) => {
    const size = WORLD.size / 2 - 6
    if (Math.abs(x) > size || Math.abs(z) > size) return null
    const y = terrainHeight(x, z)
    if (y < 1.1 || y > 42) return null
    if (terrainSlope(x, z) > maxSlope) return null
    if (!offRoad(x, z, roadMargin)) return null
    if (spacing && !isFree(x, z, radius)) return null
    occupied.push({ x, z, radius })
    return { x, y, z }
  }

  /* ---------------- village houses ---------------- */

  /** Side-aware helper: place on whichever shoulder is flatter / drier. */
  const tryBothSides = (x, z, nx, nz, offsets, radius, options) => {
    const candidates = []
    for (const side of [1, -1]) {
      for (const offset of offsets) {
        const cx = x + nx * offset * side
        const cz = z + nz * offset * side
        if (terrainSlope(cx, cz) > options.maxSlope) continue
        if (!offRoad(cx, cz, options.roadMargin)) continue
        candidates.push({ x: cx, z: cz, slope: terrainSlope(cx, cz) })
      }
    }
    candidates.sort((a, b) => a.slope - b.slope)
    for (const candidate of candidates) {
      const spot = tryPlace(candidate.x, candidate.z, radius, options)
      if (spot) return spot
    }
    return null
  }

  const facadeColors = ['#e8e0d0', '#dfd3bb', '#c98d63', '#b8643f', '#e2dbc8']
  const roofStyles = ['thatch', 'thatch', 'thatch', 'metal', 'metal', 'shingle']
  const roofColors = { thatch: '#c9a86a', metal: '#8d949a', shingle: '#7c5540' }

  let houseIndex = 0
  for (let attempt = 0; attempt < 900 && houses.length < PROP_COUNTS.villageHouses; attempt += 1) {
    const angle = range(0, Math.PI * 2)
    const radius = range(30, 104)
    const x = VILLAGE.center.x + Math.cos(angle) * radius
    const z = VILLAGE.center.z + Math.sin(angle) * radius
    const width = range(5.5, 9.5)
    const depth = range(5, 8)
    const footprint = Math.max(width, depth) * 0.62
    const spot = tryPlace(x, z, footprint, { maxSlope: 0.22, roadMargin: 5.5, spacing: true })
    if (!spot) continue

    // Face the nearest road if there is one, otherwise face the plaza.
    const influence = roadInfluence(x, z)
    const yaw = influence
      ? Math.atan2(x - VILLAGE.center.x, z - VILLAGE.center.z) + range(-0.35, 0.35)
      : angle + Math.PI / 2 + range(-0.4, 0.4)

    const roof = pick(roofStyles)
    houses.push({
      id: `house-${houseIndex++}`,
      kind: 'house',
      x: spot.x,
      y: spot.y,
      z: spot.z,
      yaw,
      width,
      depth,
      wallHeight: range(2.7, 3.6),
      roofHeight: roof === 'thatch' ? range(1.8, 2.6) : range(1.1, 1.6),
      roof,
      roofColor: roofColors[roof],
      wallColor: pick(facadeColors),
      hasVeranda: rng() < 0.35,
      hasChimney: rng() < 0.25,
    })
  }

  /* ---------------- hamlets along the RN7 ---------------- */

  const rn7 = RESOLVED_ROADS.find((r) => r.id === 'rn7')
  const hamletAnchors = [
    rn7.points[4],
    rn7.points[8],
    rn7.points[12],
  ]
  hamletAnchors.forEach(([ax, az], hamletIndex) => {
    let placed = 0
    for (let attempt = 0; attempt < 260 && placed < PROP_COUNTS.hamletHouses; attempt += 1) {
      const angle = range(0, Math.PI * 2)
      const radius = range(16, 46)
      const x = ax + Math.cos(angle) * radius
      const z = az + Math.sin(angle) * radius
      const width = range(5, 8.5)
      const depth = range(4.5, 7)
      const spot = tryPlace(x, z, Math.max(width, depth) * 0.62, {
        maxSlope: 0.2,
        roadMargin: 5,
        spacing: true,
      })
      if (!spot) continue
      const roof = pick(roofStyles)
      houses.push({
        id: `hamlet-${hamletIndex}-${placed}`,
        kind: 'house',
        x: spot.x,
        y: spot.y,
        z: spot.z,
        yaw: angle + Math.PI / 2,
        width,
        depth,
        wallHeight: range(2.6, 3.4),
        roofHeight: roof === 'thatch' ? range(1.7, 2.4) : range(1, 1.5),
        roof,
        roofColor: roofColors[roof],
        wallColor: pick(facadeColors),
        hasVeranda: rng() < 0.25,
        hasChimney: rng() < 0.3,
      })
      placed += 1
    }
  })

  /* ---------------- gargotes (street food stalls) ---------------- */

  const stallSamples = roadSamplePoints(13).filter((sample) => {
    const dx = sample.x - VILLAGE.center.x
    const dz = sample.z - VILLAGE.center.z
    return dx * dx + dz * dz < 170 * 170
  })

  for (const sample of stallSamples) {
    if (stalls.length >= PROP_COUNTS.stalls) break
    if (rng() < (sample.road.surface === 'dirt' ? 0.2 : 0.55)) continue
    const side = rng() < 0.5 ? 1 : -1
    const offset = sample.road.width * 0.5 + range(3.2, 5.4)
    const x = sample.x + sample.normalX * offset * side
    const z = sample.z + sample.normalZ * offset * side
    const spot = tryPlace(x, z, 2.6, { maxSlope: 0.22, roadMargin: 1.6, spacing: true })
    if (!spot) continue
    stalls.push({
      id: `gargote-${stalls.length}`,
      kind: 'gargote',
      x: spot.x,
      y: spot.y,
      z: spot.z,
      yaw: Math.atan2(sample.tangentX, sample.tangentZ) + (side > 0 ? Math.PI / 2 : -Math.PI / 2),
      width: range(2.4, 3.4),
      depth: range(1.9, 2.6),
      height: range(2.0, 2.4),
      tarp: pick(['#2f6fb0', '#3f7a4a', '#b8623a', '#c9c2b0']),
      hasTable: rng() < 0.8,
      hasStools: rng() < 0.7,
    })
  }

  /* ---------------- street lamps through the village ---------------- */

  roadSamplePoints(15)
    .filter((sample) => {
      const dx = sample.x - VILLAGE.center.x
      const dz = sample.z - VILLAGE.center.z
      return dx * dx + dz * dz < 130 * 130
    })
    .forEach((sample, index) => {
      if (index % 2 !== 0) return
      const offsets = [sample.road.width * 0.5 + 1.7, sample.road.width * 0.5 + 3.2]
      const spot = tryBothSides(sample.x, sample.z, sample.normalX, sample.normalZ, offsets, 0.9, {
        maxSlope: 0.5,
        roadMargin: 0.8,
        spacing: false,
      })
      if (!spot) return
      lamps.push({
        id: `lamp-${index}`,
        kind: 'lamp',
        x: spot.x,
        y: spot.y,
        z: spot.z,
        height: 4.6,
        yaw: Math.atan2(sample.tangentX, sample.tangentZ),
      })
    })

  /* ---------------- road signs at the village entrances ---------------- */

  const entranceSamples = roadSamplePoints(9).filter((sample) => {
    const dx = sample.x - VILLAGE.center.x
    const dz = sample.z - VILLAGE.center.z
    const distance = Math.hypot(dx, dz)
    return sample.road.id === 'rn7' && distance > 96 && distance < 115
  })
  let signIndex = 0
  for (const sample of entranceSamples.slice(0, 2)) {
    const spot = tryBothSides(
      sample.x,
      sample.z,
      sample.normalX,
      sample.normalZ,
      [sample.road.width * 0.5 + 1.3, sample.road.width * 0.5 + 2.6],
      1.0,
      { maxSlope: 0.6, roadMargin: 0.6, spacing: false },
    )
    if (!spot) continue
    signs.push({
      id: `sign-${signIndex}`,
      kind: 'sign',
      x: spot.x,
      y: spot.y,
      z: spot.z,
      yaw: Math.atan2(spot.x - sample.x, spot.z - sample.z) + Math.PI,
      label: signIndex === 0 ? 'ANTSIRABE' : 'TOAMASINA',
      distanceKm: signIndex === 0 ? 12 : 168,
    })
    signIndex += 1
  }

  /* ---------------- palms along the coast ---------------- */

  for (let attempt = 0; attempt < 5200 && palms.length < PROP_COUNTS.palms; attempt += 1) {
    const x = range(-WORLD.size / 2, WORLD.size / 2)
    const z = range(-WORLD.size / 2, WORLD.size / 2)
    const y = terrainHeight(x, z)
    // Coastal belt only, with a bit of noise so the treeline is not a stripe.
    if (y < 0.9 || y > 9) continue
    if (rng() > 0.35 + smoothstep(0.9, 1, 1 - y / 10) * 0.4) continue
    const spot = tryPlace(x, z, 2.4, { maxSlope: 0.5, roadMargin: 2.5 })
    if (!spot) continue
    palms.push({
      id: `palm-${palms.length}`,
      kind: 'palm',
      x: spot.x,
      y: spot.y,
      z: spot.z,
      yaw: range(0, Math.PI * 2),
      height: range(5.5, 10.5),
      lean: range(-0.12, 0.12),
      scale: range(0.85, 1.25),
    })
  }

  /* ---------------- inland trees (rainforest belt) ---------------- */

  for (let attempt = 0; attempt < 9000 && trees.length < PROP_COUNTS.trees; attempt += 1) {
    const x = range(-WORLD.size / 2, WORLD.size / 2)
    const z = range(-WORLD.size / 2, WORLD.size / 2)
    const y = terrainHeight(x, z)
    if (y < 8 || y > 46) continue
    // Higher ground is denser (mimics the eastern rainforest belt).
    const density = 0.25 + smoothstep(10, 34, y) * 0.6
    if (rng() > density) continue
    const spot = tryPlace(x, z, 2.8, { maxSlope: 0.62, roadMargin: 3 })
    if (!spot) continue
    trees.push({
      id: `tree-${trees.length}`,
      kind: rng() < 0.3 ? 'ravenala' : 'tree',
      x: spot.x,
      y: spot.y,
      z: spot.z,
      yaw: range(0, Math.PI * 2),
      height: range(4.5, 11),
      radius: range(1.5, 3.4),
      scale: range(0.8, 1.3),
      hue: rng(),
    })
  }

  /* ---------------- rocks ---------------- */

  for (let attempt = 0; attempt < 2600 && rocks.length < PROP_COUNTS.rocks; attempt += 1) {
    const x = range(-WORLD.size / 2, WORLD.size / 2)
    const z = range(-WORLD.size / 2, WORLD.size / 2)
    const y = terrainHeight(x, z)
    if (y < 1.2 || y > 46) continue
    const slope = terrainSlope(x, z)
    if (slope < 0.22 && rng() < 0.75) continue
    const spot = tryPlace(x, z, 2.2, { maxSlope: 1.4, roadMargin: 2 })
    if (!spot) continue
    rocks.push({
      id: `rock-${rocks.length}`,
      kind: 'rock',
      x: spot.x,
      y: spot.y - 0.25,
      z: spot.z,
      yaw: range(0, Math.PI * 2),
      scale: range(0.6, 2.6),
      squash: range(0.5, 0.95),
    })
  }

  /* ---------------- bushes / grass tufts ---------------- */

  for (let attempt = 0; attempt < 4200 && bushes.length < PROP_COUNTS.bushes; attempt += 1) {
    const x = range(-WORLD.size / 2, WORLD.size / 2)
    const z = range(-WORLD.size / 2, WORLD.size / 2)
    const y = terrainHeight(x, z)
    if (y < 1.0 || y > 46) continue
    const influence = roadInfluence(x, z, 2)
    if (influence) continue // keep roads and their shoulders clear
    bushes.push({
      id: `bush-${bushes.length}`,
      kind: 'bush',
      x,
      y,
      z,
      yaw: range(0, Math.PI * 2),
      scale: range(0.35, 1.15),
      hue: rng(),
    })
  }

  /* ---------------- zebu grazing near the village ---------------- */

  for (let attempt = 0; attempt < 700 && zebus.length < PROP_COUNTS.zebu; attempt += 1) {
    const angle = range(0, Math.PI * 2)
    const radius = range(115, 175)
    const x = VILLAGE.center.x + Math.cos(angle) * radius
    const z = VILLAGE.center.z + Math.sin(angle) * radius
    const spot = tryPlace(x, z, 3.4, { maxSlope: 0.3, roadMargin: 4 })
    if (!spot) continue
    zebus.push({
      id: `zebu-${zebus.length}`,
      kind: 'zebu',
      x: spot.x,
      y: spot.y,
      z: spot.z,
      yaw: range(0, Math.PI * 2),
      scale: range(0.9, 1.15),
      hump: rng() < 0.5,
    })
  }

  return { houses, stalls, lamps, signs, palms, trees, rocks, bushes, zebus }
}

/** Cached layout - generated once per session. */
let cached = null
export function getWorldLayout() {
  if (!cached) cached = buildWorldLayout()
  return cached
}
