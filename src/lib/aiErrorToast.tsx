import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { api } from './api'
import { useAudience } from './audience'
import { onAiError, type AiErrorEvent } from './aiErrorBus'

// On-screen surfacing of AI failures. lib/api emits when a handler tagged a
// response with X-AI-Error (a Workers AI call quietly degraded); we show a notice
// that does NOT auto-dismiss — someone has to tap "Accepter", which writes the
// error to the persistent journal (POST /api/ai-errors) the operator reads later
// in Réglages. Calm, but no longer silent: the two-week invisible outage that
// motivated this can't happen again without someone seeing it.
//
// One notice at a time; a burst queues behind it. Identical failures coalesce so
// a polling loop or a frustrated re-click doesn't stack ten copies.
export function AiErrorProvider({ children }: { children: ReactNode }) {
  const t = useT()
  // This notice is OPERATOR chrome: it needs reading and a deliberate "Accepter".
  // On a toddler/simple lens (a locked kiosk, grandma's view) it would block the
  // surface for someone who can't dismiss it — so it HOLDS while a non-parent
  // audience is active and drains the queue when a parent view returns. Nothing
  // is lost: events keep queueing (and coalescing) underneath.
  const { audience } = useAudience()
  const [queue, setQueue] = useState<AiErrorEvent[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(
    () =>
      onAiError((e) => {
        setQueue((q) => {
          if (q.some((x) => x.feature === e.feature && x.message === e.message)) return q
          return [...q, e]
        })
      }),
    [],
  )

  const current = audience === 'parent' ? (queue[0] ?? null) : null

  async function accept() {
    if (!current || saving) return
    setSaving(true)
    try {
      // Persist the acknowledgement. If this very POST fails we still drop the
      // notice — never trap the user in a popup, and never recurse (ai-errors is
      // not an AI route, so it can't emit another X-AI-Error).
      await api('ai-errors', { method: 'POST', body: { feature: current.feature, message: current.message } })
    } catch {
      /* best-effort logging — swallow so dismissal always succeeds */
    } finally {
      setSaving(false)
      setQueue((q) => q.slice(1))
    }
  }

  return (
    <>
      {children}
      {current && (
        <div className="ai-error-toast" role="alertdialog" aria-live="assertive">
          <div className="ai-error-toast__body">
            <strong className="ai-error-toast__title">{t.aiErr.title}</strong>
            <span className="ai-error-toast__feature mono">{current.feature}</span>
            <span className="ai-error-toast__msg">{current.message}</span>
            {queue.length > 1 && <span className="ai-error-toast__more mono">{t.aiErr.more(queue.length - 1)}</span>}
          </div>
          <button type="button" className="ai-error-toast__btn" onClick={accept} disabled={saving}>
            {saving ? t.aiErr.saving : t.aiErr.accept}
          </button>
        </div>
      )}
    </>
  )
}
