import * as THREE from 'three'

/**
 * Tiny tileable value-noise textures generated on a canvas, so the project
 * stays asset-free while giving the PBR pipeline something to work with:
 * a grain map used as bumpMap (surface relief) and roughnessMap (matte
 * variation) on the laterite terrain and the tapia props.
 *
 * The lattice is sampled with wrap-around indices, so the noise is truly
 * periodic and RepeatWrapping never shows a seam.
 */

const imageCache = new Map()
const textureCache = new Map()

/** Deterministic pseudo-random in [0, 1) for integer lattice cells. */
function hash2(x, y, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return s - Math.floor(s)
}

/** Smooth value noise at (x, y) on a lattice that wraps every `period` cells. */
function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const x0 = ((xi % period) + period) % period
  const x1 = (x0 + 1) % period
  const y0 = ((yi % period) + period) % period
  const y1 = (y0 + 1) % period
  const a = hash2(x0, y0, seed)
  const b = hash2(x1, y0, seed)
  const c = hash2(x0, y1, seed)
  const d = hash2(x1, y1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Four-octave fractal grain in [0, 1). */
function grainAt(x, y, period, seed) {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  let weight = 0
  for (let octave = 0; octave < 4; octave += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, period * frequency, seed + octave * 13)
    weight += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / weight
}

/**
 * Render the grain once per (size, min, max, seed) and cache the canvas.
 * The output is mapped to [min, max] so the caller picks the roughness band.
 */
function grainImage(size, min, max, seed) {
  const key = `${size}:${min}:${max}:${seed}`
  const cached = imageCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const lattice = 8 // octave-0 noise cells across the tile

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = grainAt((x / size) * lattice, (y / size) * lattice, lattice, seed)
      const g = Math.round((min + (max - min) * value) * 255)
      const i = (y * size + x) * 4
      image.data[i] = g
      image.data[i + 1] = g
      image.data[i + 2] = g
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  imageCache.set(key, canvas)
  return canvas
}

/**
 * A grain texture that tiles `repeat` times per UV unit.
 *
 * `repeat` is per-texture state in three, so different consumers (terrain vs.
 * props) ask for their own instance; all of them share one cached canvas.
 */
export function getGrainTexture(size = 256, repeat = 1, min = 0.78, max = 1.0, seed = 11) {
  const key = `${size}:${repeat}:${min}:${max}:${seed}`
  const cached = textureCache.get(key)
  if (cached) return cached

  const canvas = grainImage(size, min, max, seed)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.NoColorSpace // data texture: keep linear
  texture.anisotropy = 4
  texture.repeat.set(repeat, repeat)
  textureCache.set(key, texture)
  return texture
}
