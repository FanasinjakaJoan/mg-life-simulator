import { Component, useEffect, useState } from 'react'

/**
 * Visible runtime errors.
 *
 * An alpha build should never fail silently to a black screen: any uncaught
 * error (React render, unhandled promise, WebGL/Rapier setup) is surfaced in a
 * readable panel with the message and the first stack frames.
 */
export function ErrorOverlay() {
  const [error, setError] = useState(null)

  useEffect(() => {
    const onError = (event) => {
      setError({
        message: event.message || String(event.error ?? 'Unknown error'),
        stack: event.error?.stack ?? '',
      })
    }
    const onRejection = (event) => {
      const reason = event.reason
      setError({
        message: reason?.message ? `Unhandled rejection: ${reason.message}` : String(reason),
        stack: reason?.stack ?? '',
      })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (!error) return null

  return (
    <div className="absolute inset-x-0 bottom-0 z-50 max-h-[45vh] overflow-auto border-t border-red-500/40 bg-red-950/90 p-4 font-mono text-[12px] text-red-100 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-4">
        <strong className="tracking-widest uppercase">Runtime error</strong>
        <button
          type="button"
          onClick={() => setError(null)}
          className="rounded border border-red-300/40 px-2 py-0.5 text-[11px] hover:bg-red-900/60"
        >
          Dismiss
        </button>
      </div>
      <div className="whitespace-pre-wrap">{error.message}</div>
      {error.stack ? (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-red-200/70">
          {error.stack.split('\n').slice(0, 8).join('\n')}
        </pre>
      ) : null}
    </div>
  )
}

/** Classic React error boundary for render-time failures. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep the console useful for bug reports.
    console.error('[MG Life Simulator] render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-6">
          <div className="max-w-2xl rounded-xl border border-red-500/40 bg-red-950/60 p-6 font-mono text-sm text-red-100">
            <h2 className="mb-3 text-base font-semibold tracking-widest uppercase">
              Scene failed to load
            </h2>
            <p className="whitespace-pre-wrap">{String(this.state.error?.message ?? this.state.error)}</p>
            <p className="mt-3 text-red-200/70">
              Reload the page after fixing the code below. The console has the full stack.
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
