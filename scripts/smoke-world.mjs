/**
 * Headless world smoke test (node scripts/smoke-world.mjs).
 *
 * Exercises every pure builder the renderer relies on - terrain, prop layout,
 * merged prop geometry and the taxi-bé geometry - so a crash-on-mount (bad
 * merge, NaN vertex, empty geometry) is caught without a browser.
 */
import { PROP_COUNTS, buildWorldLayout } from '../src/world/layout.js'
import { terrainHeight, terrainSlope } from '../src/world/terrain.js'
import { roadInfluence, isOnRoad, RESOLVED_ROADS } from '../src/world/roadNetwork.js'
import { PLAYER, VEHICLE_SPAWNS, WORLD } from '../src/config/gameConfig.js'
import {
  buildHouseGeometry,
  buildPropGeometries,
  buildStallGeometry,
  buildZebuGeometry,
} from '../src/world/propGeometry.js'
import {
  WHEEL_POSITIONS,
  buildTaxiBodyGeometry,
  buildWheelGeometry,
} from '../src/vehicles/vehicleGeometry.js'

const problems = []
const log = (...args) => console.log(...args)
const fail = (message) => problems.push(message)

function checkGeometry(name, geometry, { minVerts = 12 } = {}) {
  if (!geometry) return fail(`${name}: builder returned nothing`)
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const color = geometry.attributes.color
  if (!position) return fail(`${name}: no position attribute`)
  if (!normal) fail(`${name}: no normal attribute`)
  if (!color) fail(`${name}: no color attribute`)
  if (position.count < minVerts) fail(`${name}: only ${position.count} vertices`)

  let finite = true
  const array = position.array
  for (let i = 0; i < array.length; i += 1) {
    if (!Number.isFinite(array[i])) {
      finite = false
      break
    }
  }
  if (!finite) fail(`${name}: contains non-finite vertex data`)

  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const size = {
    x: box.max.x - box.min.x,
    y: box.max.y - box.min.y,
    z: box.max.z - box.min.z,
  }
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) fail(`${name}: degenerate bounding box`)
  return { verts: position.count, size }
}

log('\n=== MG Life Simulator - world smoke test ===')

/* ---------------- layout ---------------- */
const startLayout = performance.now()
const layout = buildWorldLayout()
const layoutMs = performance.now() - startLayout
const counts = Object.fromEntries(
  Object.entries(layout).map(([key, value]) => [key, value.length]),
)
log(`layout built in ${layoutMs.toFixed(0)}ms`)
log(`  ${JSON.stringify(counts)}`)

for (const [key, requested] of [
  ['houses', PROP_COUNTS.villageHouses + PROP_COUNTS.hamletHouses * PROP_COUNTS.hamlets],
  ['stalls', PROP_COUNTS.stalls],
  ['palms', PROP_COUNTS.palms],
  ['trees', PROP_COUNTS.trees],
  ['rocks', PROP_COUNTS.rocks],
  ['bushes', PROP_COUNTS.bushes],
  ['zebus', PROP_COUNTS.zebu],
]) {
  if (counts[key] === 0) fail(`no ${key} were placed (requested ${requested})`)
}
if (counts.houses < 12) fail(`only ${counts.houses} houses placed (village would look empty)`)
if (counts.stalls < 6) fail(`only ${counts.stalls} gargotes placed`)
if (counts.lamps < 6) fail(`only ${counts.lamps} street lamps placed`)
if (counts.signs < 2) fail(`only ${counts.signs} road signs placed`)

/* ---------------- prop placement sanity ---------------- */
let belowSea = 0
let onRoad = 0
let floating = 0
const allProps = [
  ...layout.houses,
  ...layout.stalls,
  ...layout.lamps,
  ...layout.signs,
  ...layout.palms,
  ...layout.trees,
  ...layout.rocks,
]
for (const prop of allProps) {
  const ground = terrainHeight(prop.x, prop.z)
  if (ground < 0.9 && prop.kind !== 'rock') belowSea += 1
  if (prop.kind === 'house' || prop.kind === 'gargote') {
    if (Math.abs(prop.y - ground) > 0.35) floating += 1
    if (isOnRoad(prop.x, prop.z, 0.5)) onRoad += 1
  }
}
log(`placement: ${belowSea} props near/under water, ${onRoad} buildings on a road, ${floating} floating`)

/* ---------------- spawns must be clear of scenery ---------------- */
// The player and the taxi-bés must never spawn inside a tree, lamp or stall.
const clearanceChecks = [
  { name: 'player spawn', x: PLAYER.spawn[0], z: PLAYER.spawn[2], need: 1.4 },
  ...VEHICLE_SPAWNS.map((spawn) => ({
    name: spawn.id,
    x: spawn.position[0],
    z: spawn.position[2],
    need: 3.2,
  })),
]
let spawnBlocked = 0
for (const check of clearanceChecks) {
  let nearest = Infinity
  for (const prop of allProps) {
    nearest = Math.min(nearest, Math.hypot(prop.x - check.x, prop.z - check.z))
  }
  const clear = nearest >= check.need
  if (!clear) spawnBlocked += 1
  log(
    `spawn clearance: ${check.name.padEnd(14)} nearest prop ${nearest.toFixed(2)}m ` +
      `(needs ${check.need}${clear ? '' : ' - BLOCKED'})`,
  )
}
if (spawnBlocked > 0) fail(`${spawnBlocked} spawn point(s) are inside a prop`)

const steepest = layout.houses.reduce((max, house) => Math.max(max, terrainSlope(house.x, house.z)), 0)
log(`steepest building site: ${((steepest * 180) / Math.PI).toFixed(1)}°`)
if (steepest > 0.5) fail(`a house sits on a ${((steepest * 180) / Math.PI).toFixed(0)}° slope`)

/* ---------------- geometry builders ---------------- */
const sampleHouse = layout.houses[0]
const sampleStall = layout.stalls[0] ?? {
  width: 3,
  depth: 2.2,
  height: 2.2,
  tarp: '#2f6fb0',
  hasTable: true,
  hasStools: true,
}
const houseInfo = checkGeometry('house', buildHouseGeometry(sampleHouse))
const stallInfo = checkGeometry('gargote', buildStallGeometry(sampleStall))
const zebuInfo = checkGeometry('zebu', buildZebuGeometry({ hump: true }), { minVerts: 60 })
log(
  `geometry: house ${houseInfo?.verts} verts (${houseInfo?.size.x.toFixed(1)}x${houseInfo?.size.y.toFixed(1)}x${houseInfo?.size.z.toFixed(1)}m), ` +
    `gargote ${stallInfo?.verts} verts, zebu ${zebuInfo?.verts} verts`,
)

const propGeometries = buildPropGeometries(layout.zebus[0])
for (const [name, geometry] of Object.entries(propGeometries)) {
  checkGeometry(`prop:${name}`, geometry)
}
const taxiInfo = checkGeometry('taxi-bé', buildTaxiBodyGeometry(), { minVerts: 200 })
const wheelInfo = checkGeometry('wheel', buildWheelGeometry(), { minVerts: 30 })
log(`vehicle: taxi-bé ${taxiInfo?.verts} verts, wheel ${wheelInfo?.verts} verts x ${WHEEL_POSITIONS.length}`)
if (WHEEL_POSITIONS.length !== 4) fail('expected 4 wheels')

/* ---------------- prop loadout cost ---------------- */
const propDrawCalls =
  layout.houses.length + layout.stalls.length + layout.lamps.length + layout.signs.length + layout.zebus.length + 7
log(`draw calls: terrain 1 + roads 5 + ocean 1 + sky 1 + props ~${propDrawCalls} + instanced 7 + player/vehicles ~16`)

/* ---------------- deterministic rebuild ---------------- */
const second = buildWorldLayout()
if (second.houses.length !== layout.houses.length) fail('layout is not deterministic')
else if (Math.abs(second.houses[0].x - layout.houses[0].x) > 1e-9) fail('layout positions drift between builds')

/* ---------------- terrain contract used by the camera ---------------- */
const probe = terrainHeight(WORLD.size / 2 - 1, WORLD.size / 2 - 1)
if (!Number.isFinite(probe)) fail('terrainHeight returned a non-finite value at the map edge')
const road = RESOLVED_ROADS[0]
const influence = roadInfluence(road.points[3][0], road.points[3][1])
if (!influence || influence.weight < 0.9) fail('road corridor is not flattened on the RN7')

log('\n--- result ---')
if (problems.length) {
  problems.forEach((problem) => console.log(`  PROBLEM  ${problem}`))
  console.log('')
  process.exit(1)
}
console.log('  all checks passed\n')
