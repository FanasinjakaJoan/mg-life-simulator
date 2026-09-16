import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Geometry helpers that turn a prop definition into ONE merged, vertex-coloured
 * geometry. Every house/stall/zebu therefore costs a single draw call while
 * still reusing a single shared material across the whole map.
 */

const COLOR_SCRATCH = new THREE.Color()

/** Stamp a flat colour into a geometry's `color` attribute. */
export function paint(geometry, color) {
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  COLOR_SCRATCH.set(color)
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = COLOR_SCRATCH.r
    colors[i * 3 + 1] = COLOR_SCRATCH.g
    colors[i * 3 + 2] = COLOR_SCRATCH.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** Apply position / rotation / scale to a geometry in place. */
export function transform(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation))
  matrix.compose(
    new THREE.Vector3(...position),
    quaternion,
    new THREE.Vector3(...scale),
  )
  geometry.applyMatrix4(matrix)
  return geometry
}

/** Coloured + transformed box. */
export function box(width, height, depth, color, options) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  paint(geometry, color)
  return transform(geometry, options)
}

/** Coloured + transformed cylinder (8 segments is plenty at this scale). */
export function cylinder(radiusTop, radiusBottom, height, color, options, segments = 8) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
  paint(geometry, color)
  return transform(geometry, options)
}

/** Coloured + transformed sphere / rock blob. */
export function sphere(radius, color, options, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail)
  paint(geometry, color)
  return transform(geometry, options)
}

/**
 * Triangular-prism gable roof: cross-section in XY, extruded along Z, so it
 * spans `width` (x), `roofHeight` (y) and `depth` (z).
 */
export function gableRoof(width, roofHeight, depth, color, { overhang = 0.35 } = {}) {
  const halfWidth = width / 2 + overhang
  const shape = new THREE.Shape()
  shape.moveTo(-halfWidth, 0)
  shape.lineTo(halfWidth, 0)
  shape.lineTo(0, roofHeight)
  shape.closePath()

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth + overhang * 2,
    bevelEnabled: false,
    curveSegments: 1,
  })
  // Extrusion data is in XY and spans z from 0..depth - recentre it.
  geometry.translate(0, 0, -(depth + overhang * 2) / 2)
  geometry.computeVertexNormals()
  paint(geometry, color)
  return geometry
}

/**
 * Merge painted geometries into one.
 *
 * three's mergeGeometries refuses to mix indexed and non-indexed inputs (boxes
 * are indexed, icosahedrons and extrusions are not), so everything is expanded
 * to non-indexed first. Prop meshes are small, so the extra vertices are free.
 */
export function merge(parts) {
  const prepared = parts.filter(Boolean).map((geometry) => {
    if (!geometry.index) return geometry
    const expanded = geometry.toNonIndexed()
    geometry.dispose()
    return expanded
  })

  const merged = mergeGeometries(prepared, false)
  if (!merged) {
    throw new Error('merge() failed: incompatible geometry attributes')
  }
  merged.computeVertexNormals()
  prepared.forEach((geometry) => geometry.dispose())
  return merged
}

/** Cone (used for fronds, roofs and horns). */
export function cone(radius, height, color, options, segments = 6) {
  const geometry = new THREE.ConeGeometry(radius, height, segments)
  paint(geometry, color)
  return transform(geometry, options)
}

/** Shared materials for every vertex-coloured prop. */
export const PROP_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.82,
  metalness: 0.02,
  flatShading: false,
})

export const PROP_MATERIAL_ROUGH = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0,
})
