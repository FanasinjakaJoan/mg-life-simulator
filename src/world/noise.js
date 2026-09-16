/**
 * Deterministic noise utilities.
 *
 * Everything in the world is generated procedurally from a single seed, so the
 * same island (and prop layout) is produced on every reload without shipping
 * any asset files.
 */

/** Integer hash -> [0,1). Uses Math.imul to stay in 32-bit integer territory. */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth 2D value noise in [-1, 1]. */
export function valueNoise(x, y, seed = 0) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  // Quintic smoothstep keeps gradients continuous for nicer hills.
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)

  const a = hash2(x0, y0, seed)
  const b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed)
  const d = hash2(x0 + 1, y0 + 1, seed)

  const top = a + (b - a) * ux
  const bottom = c + (d - c) * ux
  return (top + (bottom - top) * uy) * 2 - 1
}

/** Fractal brownian motion - stacked octaves of value noise. */
export function fbm(x, y, { octaves = 4, lacunarity = 2, gain = 0.5, seed = 0 } = {}) {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 1013) * amplitude
    norm += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }
  return sum / (norm || 1)
}

/** Ridged noise - good for mountain spines. */
export function ridged(x, y, options = {}) {
  return 1 - Math.abs(fbm(x, y, options))
}

/** Tiny deterministic PRNG (mulberry32) for prop scattering. */
export function createRng(seed = 1) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value)

export function lerp(a, b, t) {
  return a + (b - a) * t
}

/** Hermite smoothstep between two edges. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Exponential smoothing factor, frame-rate independent. */
export function damp(rate, delta) {
  return 1 - Math.exp(-rate * delta)
}
