/**
 * Headless terrain sanity check (node scripts/check-terrain.mjs).
 *
 * Verifies that the procedural island is actually playable before we ever boot
 * the renderer: roads stay above sea level, the village is flat, spawn points
 * are valid, and the physics mesh has no degenerate triangles.
 */
import { WORLD, PLAYER, VEHICLE, VEHICLE_SPAWNS } from '../src/config/gameConfig.js'
import { baseHeight, islandField } from '../src/world/terrainMath.js'
import {
  RESOLVED_ROADS as ROADS,
  PLAZA_HEIGHT,
  VILLAGE,
  roadInfluence,
  isOnRoad,
} from '../src/world/roadNetwork.js'
import { buildTerrain, terrainHeight, terrainSlope } from '../src/world/terrain.js'

const problems = []
const warnings = []
const log = (...args) => console.log(...args)

log(`\n=== MG Life Simulator - terrain check (seed ${WORLD.seed}) ===`)
log(`island size ${WORLD.size}m, grid ${WORLD.segments}x${WORLD.segments} (${(WORLD.size / WORLD.segments).toFixed(1)}m cells)`)

/* 1. Build the mesh + collider data. */
const started = performance.now()
const terrain = buildTerrain()
const buildMs = performance.now() - started
log(`terrain built in ${buildMs.toFixed(0)}ms - ${terrain.vertices.length / 3} verts, ${terrain.indices.length / 3} tris`)

/* 2. Road corridor: every sample must be dry and drivable. */
log('\n--- roads ---')
for (const road of ROADS) {
  let minHeight = Infinity
  let maxGrade = 0
  let samples = 0
  let submerged = 0
  for (let i = 1; i < road.points.length; i += 1) {
    const [ax, az] = road.points[i - 1]
    const [bx, bz] = road.points[i]
    const steps = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 3))
    let prev = null
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps
      const x = ax + (bx - ax) * t
      const z = az + (bz - az) * t
      const h = terrainHeight(x, z)
      const influence = roadInfluence(x, z)
      minHeight = Math.min(minHeight, h)
      if (h < 0.6) submerged += 1
      if (prev) {
        const d = Math.hypot(x - prev.x, z - prev.z)
        maxGrade = Math.max(maxGrade, Math.abs(h - prev.h) / (d || 1))
      }
      prev = { x, z, h }
      samples += 1
      void influence
    }
  }
  const gradeDeg = (Math.atan(maxGrade) * 180) / Math.PI
  log(
    `${road.id.padEnd(9)} ${String(samples).padStart(4)} samples | min h ${minHeight.toFixed(2)}m | max grade ${gradeDeg.toFixed(1)}° | ${submerged} submerged`,
  )
  if (minHeight < 0.6) problems.push(`${road.id}: ${submerged} samples at/below sea level (min ${minHeight.toFixed(2)}m)`)
  if (gradeDeg > 16) warnings.push(`${road.id}: steep section (${gradeDeg.toFixed(1)}°)`)
}

/* 3. Village flatness + spawn validity. */
log('\n--- village ---')
let maxPlazaDelta = 0
for (let a = 0; a < 64; a += 1) {
  for (let r = 2; r <= 22; r += 4) {
    const angle = (a / 64) * Math.PI * 2
    const x = VILLAGE.center.x + Math.cos(angle) * r
    const z = VILLAGE.center.z + Math.sin(angle) * r
    maxPlazaDelta = Math.max(maxPlazaDelta, Math.abs(terrainHeight(x, z) - PLAZA_HEIGHT))
  }
}
log(
  `plaza centre (${VILLAGE.center.x}, ${VILLAGE.center.z}) height ${PLAZA_HEIGHT.toFixed(2)}m, max deviation over r<=22m: ${maxPlazaDelta.toFixed(3)}m`,
)
if (maxPlazaDelta > 0.4) problems.push(`village plaza is not flat (max delta ${maxPlazaDelta.toFixed(2)}m)`)

const [sx, sy, sz] = PLAYER.spawn
const spawnGround = terrainHeight(sx, sz)
const spawnSlope = (terrainSlope(sx, sz) * 180) / Math.PI
const spawnY = sy === 0 ? spawnGround + PLAYER.halfHeight + PLAYER.radius + 0.25 : sy
log(
  `player spawn (${sx}, ${sx === 0 ? 'auto' : spawnY.toFixed(2)}, ${sz}) -> ground ${spawnGround.toFixed(2)}m, slope ${spawnSlope.toFixed(1)}°`,
)
if (spawnY < spawnGround) problems.push('player spawn is below the ground')
if (spawnSlope > 12) warnings.push(`player spawn slope is ${spawnSlope.toFixed(1)}°`)
if (spawnSlope > 12) warnings.push(`player spawn slope is ${spawnSlope.toFixed(1)}°`)

/* 4. Vehicle spawns. */
log('\n--- vehicles ---')
for (const spawn of VEHICLE_SPAWNS) {
  const [x, y, z] = spawn.position
  const ground = terrainHeight(x, z)
  const slope = (terrainSlope(x, z) * 180) / Math.PI
  log(
    `${spawn.id} at (${x}, ${z}) -> ground ${ground.toFixed(2)}m, slope ${slope.toFixed(1)}°, on road: ${isOnRoad(x, z, 6)}`,
  )
  if (slope > 10) warnings.push(`${spawn.id} spawns on a ${slope.toFixed(1)}° slope`)
  if (ground < 1) problems.push(`${spawn.id} spawns too close to the waterline`)
  // Chassis half length 2.2m: make sure the car is not intersecting a hill.
  for (const [ox, oz] of [
    [VEHICLE.chassis.halfWidth + 0.4, 0],
    [-VEHICLE.chassis.halfWidth - 0.4, 0],
    [0, VEHICLE.chassis.halfLength + 0.4],
    [0, -VEHICLE.chassis.halfLength - 0.4],
  ]) {
    const delta = Math.abs(terrainHeight(x + ox, z + oz) - ground)
    if (delta > 0.55) warnings.push(`${spawn.id}: terrain steps ${delta.toFixed(2)}m across the chassis footprint`)
  }
  void y
}

/* 5. Island statistics. */
log('\n--- island ---')
let land = 0
let sea = 0
let minH = Infinity
let maxH = -Infinity
const samples = 120
for (let i = 0; i < samples; i += 1) {
  for (let j = 0; j < samples; j += 1) {
    const x = (i / (samples - 1)) * WORLD.size - WORLD.size / 2
    const z = (j / (samples - 1)) * WORLD.size - WORLD.size / 2
    const h = baseHeight(x, z)
    if (h > WORLD.seaLevel) land += 1
    else sea += 1
    minH = Math.min(minH, h)
    maxH = Math.max(maxH, h)
  }
}
const landPct = ((land / (land + sea)) * 100).toFixed(1)
log(`elevation range ${minH.toFixed(1)}m .. ${maxH.toFixed(1)}m, land coverage ${landPct}%`)
if (land / (land + sea) < 0.35) problems.push('island covers less than 35% of the map - too much ocean')
if (maxH < 20) warnings.push('island has no notable highlands')

/* 6. The whole coastline must sit inside the terrain grid: if land touches the
   map edge the player can walk (or drive) off the world. */
const edge = WORLD.size / 2 - 1
let maxEdgeHeight = -Infinity
const edgeSamples = []
for (let i = 0; i <= 40; i += 1) {
  const t = -WORLD.size / 2 + (i / 40) * WORLD.size
  edgeSamples.push([t, -edge], [t, edge], [-edge, t], [edge, t])
}
for (const [x, z] of edgeSamples) maxEdgeHeight = Math.max(maxEdgeHeight, terrainHeight(x, z))
log(`\n--- map edges ---\nhighest point on the map border: ${maxEdgeHeight.toFixed(2)}m (must be below sea level)`)
if (maxEdgeHeight > -0.5) {
  problems.push(`terrain reaches ${maxEdgeHeight.toFixed(2)}m at the map border - shrink WORLD.island so the coast fits inside the grid`)
}

/* 7. Mesh integrity. */
let degenerate = 0
for (let i = 0; i < terrain.indices.length; i += 3) {
  const a = terrain.indices[i] * 3
  const b = terrain.indices[i + 1] * 3
  const c = terrain.indices[i + 2] * 3
  const v = terrain.vertices
  const abx = v[b] - v[a]
  const aby = v[b + 1] - v[a + 1]
  const abz = v[b + 2] - v[a + 2]
  const acx = v[c] - v[a]
  const acy = v[c + 1] - v[a + 1]
  const acz = v[c + 2] - v[a + 2]
  const cx = aby * acz - abz * acy
  const cy = abz * acx - abx * acz
  const cz = abx * acy - aby * acx
  if (Math.hypot(cx, cy, cz) < 1e-6) degenerate += 1
}
log(`degenerate triangles: ${degenerate}`)
if (degenerate > 0) warnings.push(`${degenerate} degenerate triangles in the physics mesh`)

/* 8. Performance budget: height lookups per frame are cheap, but the build must be quick. */
const lookupStart = performance.now()
let accumulator = 0
for (let i = 0; i < 20000; i += 1) accumulator += terrainHeight((i % 500) - 250, ((i * 7) % 500) - 250)
const lookupMs = performance.now() - lookupStart
log(`20k height lookups in ${lookupMs.toFixed(1)}ms (${((lookupMs / 20000) * 1000).toFixed(2)}µs each) [${accumulator.toFixed(0)}]`)
if (buildMs > 2500) warnings.push(`terrain build takes ${buildMs.toFixed(0)}ms - consider fewer segments`)

void islandField

log('\n--- result ---')
if (problems.length) {
  problems.forEach((p) => console.log(`  PROBLEM  ${p}`))
}
if (warnings.length) {
  warnings.forEach((w) => console.log(`  warning  ${w}`))
}
if (!problems.length && !warnings.length) console.log('  all checks passed')
console.log('')
process.exit(problems.length ? 1 : 0)
