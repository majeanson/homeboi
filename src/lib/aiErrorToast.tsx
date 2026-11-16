import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLang, useT } from '../i18n'
import { api } from './api'
import { useLens } from './audience'
import { onAiError, type AiErrorEvent } from './aiErrorBus'
import { aiSpentKind } from './aiQuota'
import { formatNextUtcMidnight, formatTime } from './format'
import { addLocalDays, todayLocalDay } from './localDay'

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
  const { interrupts } = useLens()
  const [queue, setQueue] = useState<AiErrorEvent[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(
    () =>
      onAiError((e) => {
        setQueue((q) => {
          if (q.some((x) => x.feature === e.feature && x.message === e.message)) return q
          // A spent allowance is ONE fact, however many features hit it: capture, then
          // suggestions, then the recipe reader each failing on the same empty quota
          // stacked three notices for one reason. The first one says it for all.
          const spent = aiSpentKind(e.message)
          if (spent && q.some((x) => aiSpentKind(x.message) === spent)) return q
          return [...q, e]
        })
      }),
    [],
  )

  const current = interrupts ? (queue[0] ?? null) : null
  // Cloudflare's own words (« 4006: you have used up your daily free allocation… ») are
  // for the journal — that is what « Accepter » still writes. The household reads why,
  // in its language, and when it comes back; nothing else in the app is broken.
  const spent = current ? aiSpentKind(current.message) : null
  const { lang } = useLang()

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
      {/* A toast, not a dialog: it takes no focus and traps nothing, so `alertdialog`
          promised a11y behaviour it never had (overlay-rule.test.ts). `status` +
          assertive says what it is — an announcement with a dismiss.
          Portalled to <body> like Modal/Sheet: its z-index (--z-toast-ai, over every
          dialog — layer-order.test.ts) only competes with theirs in the SAME stacking
          context. Rendered in place, « Demander »'s backdrop covered it whatever the
          number said (e2e/ask-sheet.spec.ts). */}
      {current &&
        createPortal(
        <div className="ai-error-toast" role="status" aria-live="assertive">
          <div className="ai-error-toast__body">
            <strong className="ai-error-toast__title">{spent ? t.aiErr.spentTitle : t.aiErr.title}</strong>
            {!spent && <span className="ai-error-toast__feature mono">{current.feature}</span>}
            <span className="ai-error-toast__msg">
              {spent === 'quota'
                ? `${t.recipes.aiReasonQuota} — ${t.aiErr.back(formatNextUtcMidnight(lang))}`
                : spent === 'budget'
                  ? // The household's ceiling turns over at ITS midnight (_lib/usage).
                    `${t.recipes.aiReasonBudget} — ${t.aiErr.back(formatTime(addLocalDays(todayLocalDay(), 1), lang))}`
                  : current.message}
            </span>
            {queue.length > 1 && <span className="ai-error-toast__more mono">{t.aiErr.more(queue.length - 1)}</span>}
          </div>
          <button type="button" className="ai-error-toast__btn" onClick={accept} disabled={saving}>
            {saving ? t.aiErr.saving : t.aiErr.accept}
          </button>
        </div>,
          document.body,
        )}
    </>
  )
}
