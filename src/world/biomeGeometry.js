import { BIOMES, biomeAt } from './biomes.js'
import { createRng } from './noise.js'
import { terrainHeight, terrainSlope } from './terrain.js'
import { roadInfluence } from './roadNetwork.js'
import { box, cylinder, sphere, merge, cone } from './geometryUtils.js'

// Small, reusable, vertex-coloured botanical silhouettes. These are stylised
// procedural stand-ins, not scanned assets or botanically exact plant models.
export function buildBiomeGeometries() {
  const baobab = [cylinder(1.45, 2.1, 13, '#94826b', { position: [0, 6.5, 0] }, 14)]
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    baobab.push(
      cylinder(
        0.35,
        0.65,
        6,
        '#94826b',
        {
          position: [Math.cos(a) * 1.7, 14, Math.sin(a) * 1.7],
          rotation: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8],
        },
        7,
      ),
    )
    baobab.push(
      sphere(
        2.7,
        '#637449',
        { position: [Math.cos(a) * 3.2, 17 + (i % 2), Math.sin(a) * 3.2], scale: [1, 0.42, 1] },
        1,
      ),
    )
  }
  const spiny = []
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      h = 4 + (i % 3) * 1.4
    const x = Math.cos(a) * 0.6,
      z = Math.sin(a) * 0.6
    spiny.push(
      cylinder(
        0.065,
        0.19,
        h,
        '#869170',
        { position: [x, h / 2, z], rotation: [Math.sin(a) * 0.16, 0, Math.cos(a) * 0.16] },
        6,
      ),
    )
    for (let j = 0; j < 9; j++)
      spiny.push(
        cone(
          0.07,
          0.5,
          '#d0c9a7',
          { position: [x + 0.17, j * 0.55 + 1, z], rotation: [0, a, 1.3] },
          4,
        ),
      )
  }
  const rainforest = [cylinder(0.35, 0.65, 21, '#625b3e', { position: [0, 10.5, 0] }, 8)]
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4
    rainforest.push(
      sphere(
        4.5,
        i % 2 ? '#385638' : '#4f6e3f',
        { position: [Math.cos(a) * 3.1, 20 + (i % 3) * 2, Math.sin(a) * 3.1], scale: [1, 0.65, 1] },
        1,
      ),
    )
  }
  const tsingy = []
  for (let i = 0; i < 9; i++)
    tsingy.push(
      cone(
        0.8 + (i % 2) * 0.6,
        5 + (i % 4) * 2,
        '#93958b',
        {
          position: [Math.cos(i * 2.4) * 2.3, (5 + (i % 4) * 2) / 2, Math.sin(i * 2.4) * 2.3],
          rotation: [0.08 * Math.sin(i), i, 0.08 * Math.cos(i)],
        },
        4,
      ),
    )
  const flower = (color) => {
    const pieces = [cylinder(0.16, 0.28, 5, '#77694f', { position: [0, 2.5, 0] }, 7)]
    for (let i = 0; i < 6; i++)
      pieces.push(
        sphere(
          2.1,
          color,
          {
            position: [Math.cos(i) * 1.8, 5.3 + (i % 2) * 0.4, Math.sin(i) * 1.8],
            scale: [1, 0.4, 1],
          },
          1,
        ),
      )
    return merge(pieces)
  }
  const mangrove = [
    sphere(2, '#557e4d', { position: [0, 3.5, 0], scale: [1.3, 0.7, 1.3] }, 1),
    cylinder(0.2, 0.3, 3, '#71664b', { position: [0, 1.5, 0] }, 7),
  ]
  for (let i = 0; i < 6; i++)
    mangrove.push(
      cylinder(
        0.08,
        0.12,
        2.6,
        '#71664b',
        {
          position: [Math.cos(i) * 0.6, 0.65, Math.sin(i) * 0.6],
          rotation: [Math.sin(i) * 0.6, 0, -Math.cos(i) * 0.6],
        },
        5,
      ),
    )
  const grasses = []
  for (let i = 0; i < 9; i++)
    grasses.push(
      cone(
        0.065,
        0.7 + (i % 3) * 0.2,
        '#b3a969',
        {
          position: [Math.cos(i) * 0.3, 0.45, Math.sin(i) * 0.3],
          rotation: [Math.sin(i) * 0.2, 0, Math.cos(i) * 0.2],
        },
        3,
      ),
    )
  return {
    baobab: merge(baobab),
    spiny: merge(spiny),
    rainforest: merge(rainforest),
    tsingy: merge(tsingy),
    jacaranda: flower('#947faa'),
    flamboyant: flower('#b75137'),
    mangrove: merge(mangrove),
    grass: merge(grasses),
    basalt: merge([sphere(5, '#484b44', { position: [0, 3, 0], scale: [0.8, 1.5, 0.9] }, 0)]),
    rice: box(8, 0.13, 5, '#74a34d'),
  }
}

export function buildBiomeLayout(seed = 4938) {
  const rng = createRng(seed)
  const layout = {
    baobab: [],
    spiny: [],
    rainforest: [],
    tsingy: [],
    jacaranda: [],
    flamboyant: [],
    mangrove: [],
    grass: [],
    basalt: [],
  }
  const counts = {
    rainforest: 170,
    highlands: 30,
    baobabs: 50,
    spiny: 120,
    volcanic: 35,
    coast: 60,
    rivers: 55,
  }
  for (const [biome, count] of Object.entries(counts)) {
    let placed = 0
    for (let tries = 0; tries < count * 100 && placed < count; tries++) {
      const x = rng() * 510 - 255,
        z = rng() * 540 - 270
      if (biomeAt(x, z) !== biome) continue
      const y = terrainHeight(x, z)
      if (y < 1.7 || terrainSlope(x, z) > 0.7) continue
      if (BIOMES.some((b) => Math.hypot(x - b.spawn[0], z - b.spawn[1]) < 11)) continue
      const road = roadInfluence(x, z)
      if (road && road.distance < road.halfWidth + 10) continue
      let kind = {
        rainforest: 'rainforest',
        highlands: 'jacaranda',
        baobabs: 'baobab',
        spiny: 'spiny',
        volcanic: 'basalt',
        coast: 'mangrove',
        rivers: 'mangrove',
      }[biome]
      if (biome === 'baobabs' && placed % 4 === 0) kind = 'tsingy'
      if (biome === 'highlands' && placed % 2) kind = 'flamboyant'
      if (biome === 'volcanic' && placed % 2) kind = 'rainforest'
      const scale = 0.75 + rng() * 0.5
      // Leave clear space between trunks and formations.
      if (
        Object.values(layout).some((items) =>
          items.some((p) => Math.hypot(p.x - x, p.z - z) < (kind === 'baobab' ? 9 : 4)),
        )
      )
        continue
      layout[kind].push({ x, y, z, scale, yaw: rng() * Math.PI * 2 })
      if (biome === 'baobabs' || biome === 'spiny')
        for (let j = 0; j < 6; j++) {
          const gx = x + (rng() - 0.5) * 14,
            gz = z + (rng() - 0.5) * 14,
            gy = terrainHeight(gx, gz)
          if (gy > 1.5)
            layout.grass.push({ x: gx, y: gy, z: gz, scale: 1 + rng(), yaw: rng() * 6.28 })
        }
      placed++
    }
  }
  return layout
}
