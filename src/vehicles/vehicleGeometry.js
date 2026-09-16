import * as THREE from 'three'
import { PALETTE, VEHICLE } from '../config/gameConfig.js'
import { box, cone, cylinder, merge, sphere } from '../world/geometryUtils.js'

/**
 * Pure geometry for the taxi-brousse (no React, unit-testable).
 *
 * The body is a single merged vertex-coloured mesh; the wheels are separate so
 * the controller can spin and steer them.
 */

/**
 * Shared material for the taxi-bé meshes: the body and the wheels are merged,
 * vertex-coloured geometries, so without `vertexColors` three.js would ignore
 * the paint and render the whole bus white.
 */
export const VEHICLE_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.42,
  metalness: 0.28,
})

export const VEHICLE_MATERIAL_MATTE = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.85,
  metalness: 0.0,
})

const GLASS = '#3c4a52'
const TIRE = '#232326'
const HUB = '#b9b2a4'
const CHROME = '#c9ccd0'
const RED = '#a8342a'
const WHITE = '#f2f2f2'
const GREEN = '#2f7a45'

const { halfWidth, halfLength, halfHeight } = VEHICLE.chassis

/** Wheel hub offsets in the chassis' local space (front = -Z). */
export const WHEEL_POSITIONS = [
  { x: -halfWidth - 0.02, z: -halfLength + 0.75, front: true },
  { x: halfWidth + 0.02, z: -halfLength + 0.75, front: true },
  { x: -halfWidth - 0.02, z: halfLength - 0.8, front: false },
  { x: halfWidth + 0.02, z: halfLength - 0.8, front: false },
]

export function buildTaxiBodyGeometry(color = PALETTE.taxiBeWhite, accent = PALETTE.taxiBeBlue) {
  const parts = []

  // ---- lower hull ----
  const hullHeight = 1.05
  const hullY = -halfHeight + hullHeight / 2
  parts.push(box(halfWidth * 2, hullHeight, halfLength * 2, color, { position: [0, hullY, 0] }))
  parts.push(box(halfWidth * 1.94, 0.34, 0.5, color, { position: [0, hullY - 0.3, -halfLength - 0.18] }))

  // ---- accent stripe + tricolour ----
  parts.push(box(halfWidth * 2 + 0.03, 0.2, halfLength * 2 + 0.03, accent, { position: [0, hullY - 0.18, 0] }))
  for (let i = 0; i < 3; i += 1) {
    parts.push(
      box(0.012, 0.24, 0.34, [RED, WHITE, GREEN][i], {
        position: [halfWidth + 0.02, hullY - 0.18, -0.6 + i * 0.36],
      }),
    )
    parts.push(
      box(0.012, 0.24, 0.34, [GREEN, WHITE, RED][i], {
        position: [-halfWidth - 0.02, hullY - 0.18, -0.6 + i * 0.36],
      }),
    )
  }

  // ---- cab: glass belt + pillars + roof ----
  const glassHeight = 0.62
  const glassY = hullY + hullHeight / 2 + glassHeight / 2
  parts.push(box(halfWidth * 2 - 0.06, glassHeight, halfLength * 2 - 0.06, GLASS, { position: [0, glassY, 0] }))

  const roofHeight = 0.34
  const roofY = glassY + glassHeight / 2 + roofHeight / 2
  parts.push(box(halfWidth * 2, roofHeight, halfLength * 2, color, { position: [0, roofY, 0] }))
  for (const z of [-halfLength + 0.18, -0.9, 0.9, halfLength - 0.18]) {
    parts.push(box(halfWidth * 2 + 0.02, glassHeight, 0.16, color, { position: [0, glassY, z] }))
  }
  parts.push(
    box(halfWidth * 1.9, glassHeight, 0.1, GLASS, {
      position: [0, glassY + 0.1, -halfLength - 0.02],
      rotation: [-0.22, 0, 0],
    }),
  )

  // ---- front ----
  parts.push(box(halfWidth * 2.02, 0.22, 0.3, '#3a3d40', { position: [0, hullY - 0.42, -halfLength - 0.1] }))
  parts.push(box(0.42, 0.2, 0.12, '#f4efd8', { position: [-0.6, hullY - 0.05, -halfLength - 0.14] }))
  parts.push(box(0.42, 0.2, 0.12, '#f4efd8', { position: [0.6, hullY - 0.05, -halfLength - 0.14] }))
  parts.push(box(1.1, 0.16, 0.08, CHROME, { position: [0, hullY + 0.2, -halfLength - 0.16] }))
  parts.push(cylinder(0.035, 0.035, 0.3, '#2a2c2e', { position: [-halfWidth - 0.14, glassY - 0.05, -halfLength + 0.2], rotation: [0, 0, Math.PI / 2] }, 6))
  parts.push(cylinder(0.035, 0.035, 0.3, '#2a2c2e', { position: [halfWidth + 0.14, glassY - 0.05, -halfLength + 0.2], rotation: [0, 0, Math.PI / 2] }, 6))

  // ---- rear ----
  parts.push(box(0.3, 0.2, 0.1, '#b03a2e', { position: [-0.6, hullY - 0.05, halfLength + 0.1] }))
  parts.push(box(0.3, 0.2, 0.1, '#b03a2e', { position: [0.6, hullY - 0.05, halfLength + 0.1] }))
  parts.push(box(halfWidth * 2.02, 0.2, 0.28, '#3a3d40', { position: [0, hullY - 0.42, halfLength + 0.1] }))
  parts.push(box(0.08, 0.9, 0.08, CHROME, { position: [halfWidth - 0.24, glassY, halfLength + 0.08] }))
  parts.push(box(0.08, 0.9, 0.08, CHROME, { position: [halfWidth - 0.02, glassY, halfLength + 0.08] }))

  // ---- roof rack + village cargo ----
  const rackY = roofY + roofHeight / 2
  parts.push(box(halfWidth * 1.9, 0.06, halfLength * 1.7, '#6f6a63', { position: [0, rackY + 0.06, 0] }))
  for (const x of [-halfWidth * 0.9, halfWidth * 0.9]) {
    parts.push(box(0.06, 0.16, halfLength * 1.7, '#6f6a63', { position: [x, rackY + 0.16, 0] }))
  }
  // Rice sacks.
  parts.push(sphere(0.32, '#b09a6a', { position: [-0.35, rackY + 0.32, -0.8], scale: [1.2, 0.85, 1] }, 1))
  parts.push(sphere(0.3, '#a08f61', { position: [0.3, rackY + 0.3, 1.1], scale: [1.15, 0.8, 1] }, 1))
  parts.push(sphere(0.26, '#c4b183', { position: [0.25, rackY + 0.3, -1.35], scale: [1.1, 0.8, 1] }, 1))
  // Wooden crate.
  parts.push(box(0.6, 0.42, 0.7, '#8b6239', { position: [-0.35, rackY + 0.28, 1.25] }))
  // Slatted chicken cage.
  parts.push(box(0.62, 0.4, 0.5, '#7a6a4f', { position: [-0.35, rackY + 0.24, 0.3] }))
  for (let i = 0; i < 3; i += 1) {
    parts.push(box(0.63, 0.03, 0.51, '#4a3f2c', { position: [-0.35, rackY + 0.1 + i * 0.13, 0.3] }))
  }
  // Spare tyre lying flat + a loudspeaker for market announcements.
  parts.push(cylinder(0.34, 0.34, 0.18, TIRE, { position: [0.5, rackY + 0.2, -0.1] }, 12))
  parts.push(cylinder(0.17, 0.17, 0.2, HUB, { position: [0.5, rackY + 0.2, -0.1] }, 10))
  parts.push(cone(0.12, 0.2, '#d8d2c4', { position: [-0.5, rackY + 0.24, -0.5], rotation: [0.6, 0, 0] }, 8))

  return merge(parts)
}

/** One wheel = tyre + hub, spun by the controller. */
export function buildWheelGeometry() {
  return merge([
    cylinder(0.42, 0.42, 0.3, TIRE, { rotation: [0, 0, Math.PI / 2] }, 14),
    cylinder(0.2, 0.2, 0.32, HUB, { rotation: [0, 0, Math.PI / 2] }, 10),
  ])
}
