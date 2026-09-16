import assert from 'node:assert/strict'
import { BIOMES, biomeAt } from '../src/world/biomes.js'
import { terrainHeight, terrainSlope, surfaceColor } from '../src/world/terrain.js'
import { buildBiomeGeometries, buildBiomeLayout } from '../src/world/biomeGeometry.js'
import { readFileSync, existsSync } from 'node:fs'

assert.equal(BIOMES.length, 7)
assert.equal(new Set(BIOMES.map((b) => b.id)).size, 7)
const colours = new Set()
for (const biome of BIOMES) {
  const [x, z] = biome.spawn
  assert.equal(biomeAt(x, z), biome.id, `${biome.id}: spawn must be in its region`)
  assert.ok(terrainHeight(x, z) > 1.5, `${biome.id}: spawn must be on land`)
  assert.ok(terrainSlope(x, z) < 0.35, `${biome.id}: spawn must be walkable`)
  assert.ok(existsSync(`public/images/${biome.image}.jpg`), `${biome.id}: local image missing`)
  colours.add(surfaceColor(x, z, terrainHeight(x, z), terrainSlope(x, z)).getHexString())
}
assert.equal(colours.size, 7, 'each region needs a distinct ground material')
const layout = buildBiomeLayout()
assert.deepEqual(layout, buildBiomeLayout(), 'decor placement must be deterministic')
for (const [kind, items] of Object.entries(layout)) {
  assert.ok(items.length > 0, `${kind} must actually be placed`)
  for (const p of items) {
    assert.ok(Number.isFinite(p.y))
    if (kind !== 'grass')
      assert.ok(
        BIOMES.every((b) => Math.hypot(b.spawn[0] - p.x, b.spawn[1] - p.z) >= 11),
        'biome spawn clearance',
      )
  }
}
const geometries = buildBiomeGeometries()
for (const [kind, g] of Object.entries(geometries)) {
  assert.ok(g.attributes.position.count > 0, `${kind} geometry empty`)
  assert.equal(g.attributes.position.count, g.attributes.color.count)
  assert.ok(g.attributes.position.array.every(Number.isFinite))
  g.dispose()
}
const coast = JSON.parse(readFileSync('public/data/madagascar.json', 'utf8'))
assert.ok(coast.flat().length > 100, 'atlas must use a detailed geographic coastline')
console.log(
  '✓ Seven biome spawns, soils, local imagery, deterministic scenery and geographic atlas checked.',
)
