import { create } from 'zustand'
import { QUALITY, QUALITY_DEFAULT, QUALITY_ORDER, QUALITY_STORAGE_KEY } from '../config/gameConfig.js'

function readStoredQuality() {
  try {
    if (typeof window === 'undefined') return QUALITY_DEFAULT
    const value = window.localStorage.getItem(QUALITY_STORAGE_KEY)
    return QUALITY[value] ? value : QUALITY_DEFAULT
  } catch {
    return QUALITY_DEFAULT
  }
}

/**
 * UI-facing game state.
 *
 * Only values that actually need to reach React live here (they are written at
 * a throttled rate from the render loop). Simulation data such as rigid bodies
 * stays in module-level registries instead.
 */
export const useGameStore = create((set, get) => ({
  /** 'onFoot' | 'driving' */
  mode: 'onFoot',
  selectedBiome: 'highlands',
  currentBiome: 'highlands',
  activeVehicleId: null,
  /** Nearest interactable vehicle id, or null. */
  nearbyVehicleId: null,
  nearbyVehicleName: '',
  nearbyDistance: Infinity,
  /** Speedometer value (rounded km/h, only written when it changes). */
  speedKmh: 0,
  isDriving: () => get().mode === 'driving',

  /** Pointer lock bookkeeping. */
  isPointerLocked: false,
  pointerLockSupported: true,
  hasStarted: false,
  /** Flipped after the first rendered frame so the title screen can enable Play. */
  isReady: false,
  /** Physics collider wireframes (F3). */
  physicsDebug: false,
  showHelp: true,
  /** Small transient toast shown in the HUD. */
  toast: null,

  /** 'low' | 'medium' | 'high' - the active QUALITY preset (persisted). */
  quality: readStoredQuality(),
  /**
   * Effective pixel ratio written by the render loop (throttled) so the HUD
   * can show how much the adaptive governor is rescaling the internal
   * resolution without re-rendering React every frame. Seeded with the
   * preset ceiling so the post composer doesn't remount once on load.
   */
  effectiveDpr: QUALITY[readStoredQuality()].dprMax,

  setMode: (mode) => set({ mode: mode === 'driving' ? 'driving' : 'onFoot' }),
  enterVehicle: (id) => set({ mode: 'driving', activeVehicleId: id }),
  exitVehicle: () => set({ mode: 'onFoot', activeVehicleId: null, speedKmh: 0 }),
  setNearbyVehicle: (id, name, distance) =>
    set({ nearbyVehicleId: id, nearbyVehicleName: name, nearbyDistance: distance }),
  setSpeedKmh: (speedKmh) => {
    if (Math.round(get().speedKmh) !== Math.round(speedKmh)) set({ speedKmh })
  },
  setPointerLocked: (isPointerLocked) => set({ isPointerLocked }),
  setPointerLockSupported: (pointerLockSupported) => set({ pointerLockSupported }),
  setHasStarted: (hasStarted) => set({ hasStarted }),
  setReady: (isReady) => set({ isReady }),
  togglePhysicsDebug: () => set({ physicsDebug: !get().physicsDebug }),
  toggleHelp: () => set({ showHelp: !get().showHelp }),
  setToast: (toast) => set({ toast }),
  setQuality: (quality) => {
    if (!QUALITY[quality]) return
    set({ quality })
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(QUALITY_STORAGE_KEY, quality)
      }
    } catch {
      /* private mode / storage full - the setting simply won't persist */
    }
  },
  cycleQuality: () => {
    const next =
      QUALITY_ORDER[(QUALITY_ORDER.indexOf(get().quality) + 1) % QUALITY_ORDER.length]
    get().setQuality(next)
  },
  setEffectiveDpr: (effectiveDpr) => {
    // Only publish real changes; the governor calls this every frame.
    if (Math.abs(get().effectiveDpr - effectiveDpr) >= 0.05) set({ effectiveDpr })
  },
}))
