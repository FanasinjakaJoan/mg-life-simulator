/**
 * Global tuning constants for MG Life Simulator.
 * Every gameplay value lives here so designers can tweak the feel without
 * touching the systems that consume them.
 */

/** World generation + scale. */
export const WORLD = {
  /**
   * Edge length (metres) of the square terrain grid. Big enough that the whole
   * coastline sits comfortably inside it: the mesh ends in open sea, never in
   * the middle of the island (see `scripts/check-terrain.mjs`).
   */
  size: 760,
  /** Number of quads per axis on the terrain grid (segments + 1 vertices). */
  segments: 152,
  /** Height where ocean meets land. */
  seaLevel: 0,
  /** Master seed - changing it reshuffles the island (deterministic PRNG). */
  seed: 20260916,
  /**
   * Island shape: elongated like Madagascar, tilted along its NNE-SSW axis.
   * The radii are deliberately smaller than half the grid (310 m) in every
   * direction, so the coastline and the surrounding sea floor are always inside
   * the terrain mesh - there is no map edge to fall off.
   */
  island: {
    radiusX: 262, // east-west (short axis)
    radiusZ: 292, // north-south (long axis)
    rotation: 0.34, // ~19.5° tilt to mimic the island's diagonal axis
  },
  /** Fog + camera far plane. */
  fogNear: 90,
  fogFar: 430,
}

/** Third-person character tuning. */
export const PLAYER = {
  radius: 0.35,
  halfHeight: 0.45, // capsule total height = 2 * (halfHeight + radius) = 1.6 m
  eyeHeight: 1.25,
  walkSpeed: 4.3,
  sprintSpeed: 7.8,
  jumpSpeed: 6.2,
  /** Exponential approach rates (1/s) - higher = snappier. */
  accelRate: 16,
  brakeRate: 22,
  airAccelRate: 2.5,
  /** Extra downward acceleration applied while falling for a less floaty arc.
   *  (Rapier already applies 9.81 - this is added on top.) */
  fallGravityBoost: 8,
  /** Grace window (s) after leaving the ground where a jump still works. */
  coyoteTime: 0.12,
  /** Jump buffer (s) so early presses are not swallowed. */
  jumpBuffer: 0.18,
  /** Spawn on the village plaza, a few steps in front of the parked taxi-be. */
  spawn: [117, 0, 208], // y = 0 means "drop onto the terrain at load"
}

/**
 * Vehicle tuning (arcade model driven by Rapier collisions + gravity).
 *
 * All acceleration figures are in m/s^2 and were verified with
 * `node scripts/physics-sim.mjs`: 0-50 km/h in ~3 s, 0-86 km/h (top speed) in
 * ~7 s, ~2 s to stop from full speed.
 */
export const VEHICLE = {
  chassis: {
    /** Collider half extents: length is along Z (front = -Z), width along X. */
    halfWidth: 0.95,
    halfHeight: 0.55,
    halfLength: 2.2,
  },
  mass: 1500,
  maxSpeed: 24, // m/s  (~86 km/h)
  maxReverseSpeed: 8,
  engineAccel: 5.2, // m/s^2 of drive force at low speed
  reverseAccel: 3.5,
  brakeDecel: 9.5, // m/s^2 - firm but not face-into-the-windscreen
  /** Torque falls off with speed so the launch feels punchy and the top end lazy. */
  torqueFalloff: 0.75,
  /** Rolling resistance while coasting (m/s^2) plus a linear drag term (1/s). */
  rollResist: 1.2,
  coastDrag: 0.22,
  /** Below this speed with no pedal input the parking brake pins the bus. */
  parkSpeed: 1.2,
  /** How fast lateral slip is killed - lower values = more drift. */
  lateralGrip: 7.5,
  /** Yaw rate at low / high speed (rad/s). */
  steerRateLow: 1.95,
  steerRateHigh: 0.85,
  /** No steering authority at all below the deadzone, full steering above minSpeed. */
  steerDeadzone: 0.15,
  steerMinSpeed: 0.9,
  /** Downforce pushing the chassis onto the terrain (m/s^2 per m/s of speed). */
  downforce: 0.35,
  /** Ground friction on the chassis: kept tiny so the engine never fights it.
   *  Lateral grip is modelled by `lateralGrip` instead. */
  chassisFriction: 0.05,
  /** Interaction radius for entering the vehicle. */
  interactionRadius: 5.5,
}
/** Third-person orbit camera rig. */
export const CAMERA = {
  fov: 55,
  near: 0.1,
  far: 1200,
  /** Boom length on foot / behind the wheel (metres). */
  distanceOnFoot: 6.2,
  distanceDriving: 9.5,
  minDistance: 2.2,
  maxDistance: 16,
  zoomStep: 0.9,
  minPitch: -0.5, // looking slightly up from below
  maxPitch: 1.15, // looking down over the shoulder
  sensitivity: 0.0024, // radians per mouse pixel
  /** Exponential smoothing rates (1/s). */
  followRate: 9,
  lookAtRate: 14,
  /** While driving the camera drifts back behind the bus after this idle time. */
  drivingRecenterDelay: 1.1,
  drivingRecenterRate: 2.6,
  /** Keeps the boom above the ground / sea surface. */
  groundClearance: 1.1,
}

/** Tropical midday sun plus its shadow frustum (which follows the player). */
export const SUN = {
  /** Direction the light comes *from* (normalised by the consumer). */
  direction: [0.45, 0.82, 0.35],
  color: '#fff3d6',
  intensity: 2.6,
  ambient: {
    skyColor: '#bcd9f2',
    groundColor: '#6b4a2f', // light bouncing off the red laterite
    // Kept modest: the IBL environment map (world/Environment.jsx) supplies
    // most of the ambient light, so a stronger hemisphere term over-exposes.
    intensity: 0.38,
  },
  shadow: {
    mapSize: 2048,
    /** Half-extent of the shadow box that tracks the player (metres). */
    size: 60,
    bias: -0.0006,
    normalBias: 0.05,
  },
}

/**
 * Quality presets: the pixel-ratio range the adaptive governor may roam in,
 * the shadow-map resolution and whether the post-processing chain (bloom,
 * tone mapping, vignette, grain) is active.
 *
 * `dprMin`/`dprMax` are not the whole story - drei's PerformanceMonitor
 * nudges the effective pixel ratio up and down inside that range at runtime,
 * so a slow machine gets a lower internal resolution while keeping the full
 * image quality (shadows, IBL) of its tier.
 */
export const QUALITY = {
  low: {
    label: 'Basse',
    dprMin: 0.75,
    dprMax: 1,
    shadowMapSize: 1024,
    post: false,
  },
  medium: {
    label: 'Moyenne',
    dprMin: 1,
    dprMax: 1.5,
    shadowMapSize: 2048,
    post: true,
    bloom: 0.3,
  },
  high: {
    label: 'Élevée',
    dprMin: 1,
    dprMax: 2,
    shadowMapSize: 4096,
    post: true,
    bloom: 0.45,
  },
}

export const QUALITY_ORDER = ['low', 'medium', 'high']
export const QUALITY_DEFAULT = 'high'
export const QUALITY_STORAGE_KEY = 'madagascar-quality'

/**
 * Madagascar palette: red laterite soil, dry tapia grass, highland rainforest,
 * Indian Ocean blues and the white-and-blue taxi-brousse livery.
 */
export const PALETTE = {
  laterite: '#b0562f',
  lateriteDark: '#7f3a20',
  dryGrass: '#bda75f',
  jungle: '#3d6b3a',
  rock: '#8d857c',
  sand: '#e3d09b',
  waterDeep: '#155e83',
  taxiBeWhite: '#f2efe6',
  taxiBeBlue: '#2a5fa8',
}

/**
 * Where the taxi-brousses are parked. Both sit on the RN7 shoulder in front of
 * the market, nose toward the plaza, so driving forward takes you into the
 * village. Verified by `scripts/physics-sim.mjs` (on the road, pointing along
 * the road, not intersecting any prop).
 */
export const VEHICLE_SPAWNS = [
  {
    id: 'taxi-be-01',
    name: 'Taxi-brousse « Tanà Express »',
    color: PALETTE.taxiBeWhite,
    accent: PALETTE.taxiBeBlue,
    position: [111.92, 0, 197.63],
    rotation: -2.583,
  },
  {
    id: 'taxi-be-02',
    name: 'Taxi-brousse « Route du Sud »',
    color: '#e7d8b4',
    accent: '#c1553a',
    position: [105.25, 0, 186.97],
    rotation: -2.583,
  },
]
