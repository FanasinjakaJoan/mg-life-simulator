import { useEffect, useRef, useState } from 'react'
import { QUALITY } from '../config/gameConfig.js'
import { useGameStore } from '../state/useGameStore.js'

/**
 * Minimal in-game overlay: banner, interaction prompt, speedometer, controls
 * legend and a lightweight FPS readout (useful while tuning the alpha).
 */

const CONTROL_ROWS = [
  ['W A S D / Z Q S D / ↑←↓→', 'Marcher'],
  ['Shift', 'Courir'],
  ['Space', 'Sauter'],
  ['Mouse', 'Regarder'],
  ['Wheel', 'Zoom'],
  ['F', 'Monter / descendre'],
  ['W / S', 'Accélérer / freiner'],
  ['Space', 'Frein à main'],
  ['R', 'Replacer le taxi'],
  ['P', 'Qualité graphique'],
  ['H', 'Afficher les commandes'],
]

export function Hud() {
  const mode = useGameStore((state) => state.mode)
  const nearbyVehicleId = useGameStore((state) => state.nearbyVehicleId)
  const nearbyVehicleName = useGameStore((state) => state.nearbyVehicleName)
  const nearbyDistance = useGameStore((state) => state.nearbyDistance)
  const speedKmh = useGameStore((state) => state.speedKmh)
  const showHelp = useGameStore((state) => state.showHelp)
  const toggleHelp = useGameStore((state) => state.toggleHelp)
  const toast = useGameStore((state) => state.toast)
  const setToast = useGameStore((state) => state.setToast)
  const hasStarted = useGameStore((state) => state.hasStarted)

  // Toast auto-dismiss.
  const [visibleToast, setVisibleToast] = useState(null)
  const toastTimer = useRef(null)
  useEffect(() => {
    if (!toast) return
    setVisibleToast(toast)
    // Clear the source value so repeating the same message re-triggers the toast.
    setToast(null)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setVisibleToast(null), 2600)
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [toast, setToast])

  if (!hasStarted) return null

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans text-white">
      {/* ---- banner ---- */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-full border border-white/15 bg-slate-950/55 px-4 py-1.5 backdrop-blur-sm">
          <span className="flex h-4 w-1.5 overflow-hidden rounded-sm">
            <span className="h-full w-1/3 bg-white" />
            <span className="h-full w-1/3 bg-red-600" />
            <span className="h-full w-1/3 bg-green-600" />
          </span>
          <h1 className="text-[13px] font-semibold tracking-[0.2em] text-white/90 uppercase">
            Madagascar · The Red Island
          </h1>
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-amber-200 uppercase">
            Alpha
          </span>
        </div>
      </div>

      <FpsReadout />

      {/* ---- speed + gear (driving only) ---- */}
      {mode === 'driving' ? (
        <div className="absolute right-5 bottom-24 flex flex-col items-end gap-1">
          <div className="rounded-2xl border border-white/15 bg-slate-950/55 px-5 py-3 backdrop-blur-sm">
            <div className="flex items-end gap-2">
              <span className="font-mono text-5xl leading-none font-semibold tabular-nums">
                {Math.round(Math.abs(speedKmh))}
              </span>
              <span className="pb-1 text-xs tracking-widest text-white/60 uppercase">km/h</span>
            </div>
            <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 transition-[width] duration-150"
                style={{ width: `${Math.min(100, (Math.abs(speedKmh) / 90) * 100)}%` }}
              />
            </div>
          </div>
          <span className="rounded-full bg-slate-950/45 px-3 py-1 text-[11px] text-white/70 backdrop-blur-sm">
            Appuyez sur <kbd className="font-mono text-white">F</kbd> pour descendre
          </span>
        </div>
      ) : null}

      {/* ---- interaction prompt ---- */}
      {mode === 'onFoot' && nearbyVehicleId ? (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-amber-300/30 bg-slate-950/70 px-4 py-2.5 backdrop-blur-sm">
            <kbd className="rounded-md border border-white/25 bg-white/10 px-2 py-1 font-mono text-sm">
              F
            </kbd>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">Conduire le taxi-brousse</span>
              <span className="text-[11px] text-white/60">
                {nearbyVehicleName}
                {Number.isFinite(nearbyDistance) ? ` — ${nearbyDistance.toFixed(1)} m` : ''}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- controls legend ---- */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="flex flex-col items-center gap-2">
          {showHelp ? (
            <div className="grid max-w-5xl grid-cols-2 gap-x-8 gap-y-1 rounded-xl border border-white/10 bg-slate-950/45 px-5 py-3 backdrop-blur-sm sm:grid-cols-3 md:grid-cols-5">
              {CONTROL_ROWS.map(([keys, label]) => (
                <div key={keys} className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-mono text-[11px] text-amber-200/90">{keys}</span>
                  <span className="text-[11px] text-white/65">{label}</span>
                </div>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleHelp}
            className="pointer-events-auto rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-[10px] tracking-widest text-white/50 uppercase transition hover:bg-slate-950/70 hover:text-white/80"
          >
            {showHelp ? 'Masquer les commandes (H)' : 'Commandes (H)'}
          </button>
        </div>
      </div>

      {/* ---- toast ---- */}
      {visibleToast ? (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 transition-opacity duration-300">
          <div className="rounded-lg border border-white/15 bg-slate-950/70 px-4 py-1.5 text-sm text-white/90 backdrop-blur-sm">
            {visibleToast}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FpsReadout() {
  const [fps, setFps] = useState(0)
  const frames = useRef(0)
  const last = useRef(performance.now())
  const quality = useGameStore((state) => state.quality)
  const effectiveDpr = useGameStore((state) => state.effectiveDpr)
  const cycleQuality = useGameStore((state) => state.cycleQuality)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const now = performance.now()
      frames.current += 1
      if (now - last.current >= 500) {
        setFps(Math.round((frames.current * 1000) / (now - last.current)))
        frames.current = 0
        last.current = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="absolute top-4 right-4 flex items-center gap-2">
      {/* Quality selector: cycles Basse -> Moyenne -> Élevée (also key P).
          Shows the effective internal resolution the adaptive governor
          picked within the preset's band. */}
      <button
        type="button"
        onClick={cycleQuality}
        title="Changer la qualité graphique (touche P)"
        className="pointer-events-auto rounded-full border border-white/10 bg-slate-950/45 px-3 py-1 font-mono text-[11px] text-white/60 backdrop-blur-sm transition hover:bg-slate-950/70 hover:text-white/90"
      >
        <span className="text-white/40">Qualité</span>{' '}
        <span className="text-amber-200/90">{QUALITY[quality].label}</span>
        <span className="ml-1.5 text-white/40">{effectiveDpr.toFixed(2)}×</span>
      </button>
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/45 px-3 py-1 font-mono text-[11px] text-white/60 backdrop-blur-sm">
        <span className={fps >= 50 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-red-300'}>
          {fps} FPS
        </span>
      </div>
    </div>
  )
}
