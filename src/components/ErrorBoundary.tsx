import { Component, type ErrorInfo, type ReactNode } from 'react'

// App-level safety net. React unmounts the ENTIRE tree when a render throws and
// nothing catches it — that's how a single bad field access (e.g. a member with no
// display_name) once blanked the whole app to the cream <body>, with no way back.
// This boundary turns any such throw into a calm, recoverable screen instead of a
// void. It is deliberately copy-light and dependency-free (no hooks/i18n/router) so
// it can't itself fail while rendering the fallback. Bilingual inline, FR first.
interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface it for the console / future telemetry. Swallow any logging error so
    // the fallback always renders.
    try {
      console.error('Babillard a planté (render):', error, info.componentStack)
    } catch {
      /* noop */
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="errboundary" role="alert">
        <div className="errboundary__card surface">
          <p className="errboundary__title">Oups — un pépin</p>
          <p className="errboundary__msg mono">
            Quelque chose a planté à l’affichage. Tes données sont intactes ; on recharge et ça repart.
            <br />
            <span className="errboundary__en">Something broke while rendering. Your data is safe — reload to continue.</span>
          </p>
          <div className="errboundary__actions">
            <button type="button" className="btn btn--primary mono" onClick={() => window.location.reload()}>
              Recharger
            </button>
            <button
              type="button"
              className="btn btn--ghost mono"
              onClick={() => {
                // Bounce to the board — the most likely-healthy route — then reload
                // so the boundary resets and the broken view is left behind.
                window.location.assign('/board')
              }}
            >
              Aller au babillard
            </button>
            <button
              type="button"
              className="btn btn--ghost mono"
              onClick={() => {
                // « Les remarques » (0136) — the highest-value door in the app, because
                // this is the moment with the most context and the least patience for
                // retyping it.
                //
                // IT HANDS OFF RATHER THAN OPENING THE COMPOSER HERE, and that is not
                // laziness. This file is deliberately hook-free, i18n-free and
                // router-free so it cannot itself throw while rendering the fallback
                // (see the header) — and the composer needs Query, the write hook, the
                // toast and the i18n context, any of which may be exactly what just
                // broke. So the boundary does the two things it can safely do: stash
                // the message, and navigate. RemarksSection picks it up on the other
                // side, where the app is healthy by definition because it rendered.
                try {
                  sessionStorage.setItem(
                    'bb-remark-seed',
                    JSON.stringify({ text: String(this.state.error?.message ?? '').slice(0, 500) }),
                  )
                } catch {
                  /* private mode / blocked storage — the door still opens, just empty */
                }
                window.location.assign('/settings?tab=settings&sub=tablets&focus=remarks&report=1')
              }}
            >
              Signaler
            </button>
          </div>
        </div>
      </div>
    )
  }
}
