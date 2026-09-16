import { create } from 'zustand'

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
}))
