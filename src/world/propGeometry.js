import * as THREE from 'three'
import { box, cone, cylinder, gableRoof, merge, paint, sphere, transform } from './geometryUtils.js'

/**
 * Pure geometry builders for every prop in the world.
 *
 * Kept free of React so they can be unit tested (scripts/smoke-world.mjs) and
 * reused by any future renderer. Each function returns ONE merged,
 * vertex-coloured geometry.
 */

const FLAG = { white: '#f2f2f2', red: '#a8342a', green: '#2f7a45' }

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export function buildHouseGeometry(house) {
  const { width, depth, wallHeight, roofHeight, roof, roofColor, wallColor, hasVeranda, hasChimney } =
    house
  const parts = []

  // Stone plinth: tall enough that a gentle slope never opens a gap under a wall.
  parts.push(box(width + 0.4, 2.4, depth + 0.4, '#9a8d7c', { position: [0, -0.95, 0] }))
  parts.push(box(width, wallHeight, depth, wallColor, { position: [0, wallHeight / 2, 0] }))

  // Tall thick thatch for traditional houses, flatter sheets for metal roofs.
  const roofGeometry = gableRoof(width, roofHeight, depth, roofColor, {
    overhang: roof === 'thatch' ? 0.75 : roof === 'metal' ? 0.55 : 0.45,
  })
  transform(roofGeometry, { position: [0, wallHeight, 0] })
  parts.push(roofGeometry)

  // Door + windows on the front (+Z) face.
  parts.push(box(1.1, 2.1, 0.12, '#6d4a2c', { position: [0, 1.05, depth / 2 + 0.02] }))
  parts.push(
    box(0.9, 0.9, 0.12, '#5c6b73', { position: [width / 2 - 1.3, wallHeight * 0.62, depth / 2 + 0.02] }),
  )
  if (width > 7) {
    parts.push(
      box(0.9, 0.9, 0.12, '#5c6b73', {
        position: [-(width / 2) + 1.3, wallHeight * 0.62, depth / 2 + 0.02],
      }),
    )
  }
  parts.push(box(0.12, 0.8, 0.8, '#55636b', { position: [width / 2 + 0.02, wallHeight * 0.6, 0] }))

  if (hasVeranda) {
    parts.push(box(width * 0.75, 0.16, 1.8, '#8b6239', { position: [0, 0.35, depth / 2 + 0.9] }))
    parts.push(cylinder(0.09, 0.09, 1.5, '#7a5632', { position: [-width * 0.3, 1.05, depth / 2 + 1.6] }, 6))
    parts.push(cylinder(0.09, 0.09, 1.5, '#7a5632', { position: [width * 0.3, 1.05, depth / 2 + 1.6] }, 6))
  }

  if (hasChimney) {
    parts.push(box(0.5, 1.1, 0.5, '#8d5a3a', { position: [width * 0.28, wallHeight + roofHeight * 0.55, 0] }))
  }

  return merge(parts)
}

/** Gargote: wooden frame, tarp roof, counter, pot and stools. */
export function buildStallGeometry(stall) {
  const { width, depth, height, tarp, hasTable, hasStools } = stall
  const wood = '#7a5632'
  const woodDark = '#5f4123'
  const parts = []

  const postX = width / 2 - 0.12
  const postZ = depth / 2 - 0.12
  for (const [x, z] of [
    [postX, postZ],
    [-postX, postZ],
    [postX, -postZ],
    [-postX, -postZ],
  ]) {
    parts.push(box(0.14, height, 0.14, woodDark, { position: [x, height / 2, z] }))
  }

  parts.push(box(width + 0.3, 0.1, depth + 0.3, wood, { position: [0, height, 0] }))
  parts.push(
    box(width + 0.7, 0.08, depth + 0.7, tarp, { position: [0, height + 0.18, 0.1], rotation: [-0.06, 0, 0] }),
  )
  parts.push(box(width, height * 0.8, 0.1, '#6f5a45', { position: [0, height * 0.4, -depth / 2 + 0.05] }))

  if (hasTable) {
    parts.push(box(width * 0.9, 0.12, depth * 0.5, '#a9773f', { position: [0, 0.78, 0] }))
    parts.push(box(0.1, 0.78, 0.1, woodDark, { position: [width * 0.35, 0.39, depth * 0.15] }))
    parts.push(box(0.1, 0.78, 0.1, woodDark, { position: [-width * 0.35, 0.39, depth * 0.15] }))
    // Charcoal stove / pot on the counter.
    parts.push(sphere(0.24, '#3a3a3c', { position: [width * 0.25, 0.98, 0], scale: [1, 0.85, 1] }, 1))
  }

  if (hasStools) {
    parts.push(cylinder(0.2, 0.24, 0.42, '#8b6239', { position: [-width * 0.1, 0.21, depth * 0.7] }, 8))
    parts.push(cylinder(0.2, 0.24, 0.42, '#8b6239', { position: [width * 0.32, 0.21, depth * 0.75] }, 8))
  }

  return merge(parts)
}

/** Village street lamp. */
export function buildLampGeometry() {
  return merge([
    box(0.26, 0.3, 0.26, '#6d6a63', { position: [0, 0.15, 0] }),
    cylinder(0.08, 0.1, 4.4, '#8d949a', { position: [0, 2.2, 0] }, 8),
    box(0.3, 0.12, 1.1, '#8d949a', { position: [0, 4.4, 0.45] }),
    box(0.34, 0.18, 0.6, '#f7e9b8', { position: [0, 4.3, 0.85] }),
  ])
}

/** Road sign with the Malagasy tricolour on the panel. */
export function buildSignGeometry() {
  return merge([
    cylinder(0.07, 0.09, 2.1, '#8d949a', { position: [0, 1.05, 0] }, 8),
    box(1.5, 0.9, 0.08, FLAG.white, { position: [0, 2.5, 0] }),
    box(0.42, 0.9, 0.04, FLAG.white, { position: [-0.52, 2.5, 0.05] }),
    box(1.06, 0.44, 0.04, FLAG.red, { position: [0.2, 2.72, 0.05] }),
    box(1.06, 0.44, 0.04, FLAG.green, { position: [0.2, 2.28, 0.05] }),
  ])
}

/* ------------------------------------------------------------------ */
/* Vegetation                                                          */
/* ------------------------------------------------------------------ */

/** Palm trunk: unit height so instances can scale it per tree. */
export function palmTrunkGeometry() {
  const geometry = new THREE.CylinderGeometry(0.16, 0.3, 1, 6, 1)
  geometry.translate(0, 0.5, 0)
  paint(geometry, '#8b7355')
  return geometry
}

/** Palm crown: nine fronds fanning out and drooping down. */
export function palmHeadGeometry() {
  const fronds = []
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2
    const droop = 0.55 + (i % 3) * 0.12
    fronds.push(
      cone(0.34, 2.6, i % 2 === 0 ? '#4f7a3f' : '#5d8b45', {
        position: [Math.cos(angle) * 1.05, 1.15 - (i % 3) * 0.14, Math.sin(angle) * 1.05],
        rotation: [Math.PI / 2 - droop, -angle, 0],
        scale: [1, 1, 0.35],
      }),
    )
  }
  return merge(fronds)
}

/** Traveller's palm (ravinala): flat fan of broad blades. */
export function ravenalaGeometry() {
  const blades = []
  for (let i = 0; i < 11; i += 1) {
    const angle = (i / 10) * Math.PI - Math.PI / 2
    blades.push(
      box(0.42, 2.4, 0.06, i % 2 === 0 ? '#3f6b35' : '#4b7c3d', {
        position: [Math.sin(angle) * 1.1, 1.15, 0],
        rotation: [0, 0, -angle * 0.9],
      }),
    )
  }
  return merge(blades)
}

export function treeTrunkGeometry() {
  const geometry = new THREE.CylinderGeometry(0.22, 0.36, 1, 6, 1)
  geometry.translate(0, 0.5, 0)
  paint(geometry, '#6b4b2f')
  return geometry
}

export function treeCanopyGeometry() {
  return merge([
    sphere(1.5, '#3f6b35', { position: [0, 0, 0] }, 1),
    sphere(1.15, '#4b7c3d', { position: [0.9, -0.35, 0.5] }, 0),
    sphere(1.05, '#375d2e', { position: [-0.8, -0.3, -0.55] }, 0),
    sphere(1.0, '#4f7a3f', { position: [0.1, 0.75, -0.6] }, 0),
  ])
}

export function rockGeometry() {
  return merge([
    sphere(1, '#7d7a72', {}, 0),
    sphere(0.62, '#8d8a82', { position: [0.7, -0.2, 0.35] }, 0),
  ])
}

export function bushGeometry() {
  return merge([
    sphere(0.5, '#5d6b3a', {}, 0),
    sphere(0.36, '#6d7f43', { position: [0.35, 0.05, -0.2] }, 0),
    sphere(0.3, '#51603a', { position: [-0.3, -0.06, 0.25] }, 0),
  ])
}

/* ------------------------------------------------------------------ */
/* Zebu                                                                */
/* ------------------------------------------------------------------ */

export function buildZebuGeometry(zebu) {
  const hide = '#6d5a46'
  const hideDark = '#57483a'
  const parts = []
  const length = 1.9
  const height = 1.15

  parts.push(box(length, height * 0.5, 0.68, hide, { position: [0, height * 0.62, 0] }))
  if (zebu.hump) {
    parts.push(sphere(0.34, hideDark, { position: [0.35, height * 1.02, 0], scale: [1.2, 0.8, 0.9] }, 1))
  }
  parts.push(box(0.62, 0.42, 0.42, hideDark, { position: [length * 0.62, height * 0.78, 0] }))
  parts.push(box(0.34, 0.24, 0.3, '#4a3d31', { position: [length * 0.86, height * 0.68, 0] }))
  parts.push(cone(0.07, 0.4, '#d8cdb8', { position: [length * 0.6, height * 1.02, 0.18], rotation: [0.5, 0, 0.6] }, 5))
  parts.push(cone(0.07, 0.4, '#d8cdb8', { position: [length * 0.6, height * 1.02, -0.18], rotation: [-0.5, 0, 0.6] }, 5))
  for (const [x, z] of [
    [0.6, 0.24],
    [0.6, -0.24],
    [-0.62, 0.24],
    [-0.62, -0.24],
  ]) {
    parts.push(box(0.14, height * 0.72, 0.14, hideDark, { position: [x, height * 0.36, z] }))
  }
  parts.push(box(0.1, 0.5, 0.1, hideDark, { position: [-length * 0.55, height * 0.72, 0], rotation: [0.2, 0, 0.25] }))

  return merge(parts)
}

/** Everything the Props component needs, built once. */
export function buildPropGeometries(zebuSample) {
  return {
    lamp: buildLampGeometry(),
    sign: buildSignGeometry(),
    palmTrunk: palmTrunkGeometry(),
    palmHead: palmHeadGeometry(),
    ravenala: ravenalaGeometry(),
    treeTrunk: treeTrunkGeometry(),
    treeCanopy: treeCanopyGeometry(),
    rock: rockGeometry(),
    bush: bushGeometry(),
    zebu: buildZebuGeometry(zebuSample ?? {}),
  }
}
