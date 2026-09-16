import { useGameStore } from '../state/useGameStore.js'

/**
 * Title screen / pause gate.
 *
 * Clicking Play hides the overlay and (when the browser allows it) captures the
 * pointer. The game is fully playable without pointer lock - mouse movement
 * orbits the camera either way.
 */
export function StartOverlay() {
  const hasStarted = useGameStore((state) => state.hasStarted)
  const setHasStarted = useGameStore((state) => state.setHasStarted)
  const isReady = useGameStore((state) => state.isReady)
  const isPointerLocked = useGameStore((state) => state.isPointerLocked)
  const pointerLockSupported = useGameStore((state) => state.pointerLockSupported)

  if (hasStarted) {
    return isPointerLocked || !pointerLockSupported ? null : (
      <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2">
        <div className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-[11px] text-white/50 backdrop-blur-sm">
          Click the world to capture the mouse (Esc releases it)
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/80 p-8 text-white shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-8 w-2.5 overflow-hidden rounded-sm">
            <span className="h-full w-1/3 bg-white" />
            <span className="h-full w-1/3 bg-red-600" />
            <span className="h-full w-1/3 bg-green-600" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-[0.18em] uppercase">MG Life Simulator</h1>
            <p className="text-xs tracking-[0.3em] text-amber-200/80 uppercase">
              Alpha — Island of Madagascar
            </p>
          </div>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-white/70">
          A 3D open-world life sim prototype. Explore a procedurally generated island, walk through a
          coastal village of traditional houses and <em>gargotes</em>, then take a taxi-brousse for a
          drive up the Route Nationale 7.
        </p>

        <div className="mb-6 grid grid-cols-2 gap-3 text-[12px] text-white/60">
          <Legend keys="W A S D" label="Walk" />
          <Legend keys="Shift" label="Sprint" />
          <Legend keys="Space" label="Jump" />
          <Legend keys="Mouse" label="Camera" />
          <Legend keys="F" label="Enter / exit vehicle" />
          <Legend keys="Space" label="Handbrake (driving)" />
        </div>

        <button
          type="button"
          disabled={!isReady}
          onClick={() => setHasStarted(true)}
          className="w-full rounded-xl bg-amber-400 px-6 py-3 text-sm font-semibold tracking-widest text-slate-950 uppercase transition hover:bg-amber-300 disabled:cursor-wait disabled:bg-white/20 disabled:text-white/50"
        >
          {isReady ? 'Play' : 'Generating the island…'}
        </button>

        <p className="mt-4 text-center text-[11px] text-white/35">
          Procedural terrain · Rapier physics · React Three Fiber
        </p>
      </div>
    </div>
  )
}

function Legend({ keys, label }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="rounded border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/80">
        {keys}
      </kbd>
      <span>{label}</span>
    </div>
  )
}
