import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useAuth } from '../lib/auth'
import { useOnline } from '../lib/online'
import { useConfirm } from '../lib/confirm'
import { useSampleStatus } from '../lib/sample'
import { api } from '../lib/api'
import { Icon } from './Icon'

// The board banner for a freshly-seeded household (onboarding Phase 1). A new
// account is pre-populated with a small demo family so the board is ALIVE on first
// login; this calm strip tells the operator it's an example and offers two ways
// out: keep it (dismiss — explore, then add real data alongside — clearing later
// never touches what you added, thanks to is_sample) or clear it now.
//
// Operator-only: clearing is an operator action, and a wall kiosk (no session)
// just shows the living demo until the operator clears it from their phone. Never
// in the toddler lens. Dismissal persists like WelcomeCard's, so it won't nag.
const KEY = 'babillard-sample-banner'

function isDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
function persistDismissed() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* noop */
  }
}

export function SampleBanner() {
  const t = useT()
  const { audience } = useAudience()
  const { signedIn } = useAuth()
  const online = useOnline()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [dismissed, setDismissed] = useState(isDismissed)
  const [busy, setBusy] = useState(false)

  // Only the operator manages sample data (the shared hook gates its query to a
  // signed-in session). hasSample ⇒ the demo is still present ⇒ we're in the
  // "explore" act and this banner is the board's ONE onboarding card.
  const { hasSample } = useSampleStatus()

  if (audience === 'toddler' || !signedIn || dismissed || !hasSample) return null

  const keep = () => {
    persistDismissed()
    setDismissed(true)
  }

  // Clearing is the GRADUATION step, not a scary delete: it removes only the demo
  // (is_sample rows), then the empty board reveals the real setup checklist. Frame
  // the confirm positively + reassure it's reloadable.
  const clear = async () => {
    if (busy) return
    const okay = await confirm({
      message: t.sample.clearConfirm,
      confirmLabel: t.sample.clearStart,
    })
    if (!okay) return
    setBusy(true)
    try {
      await api('seed', { method: 'DELETE' })
      // A clear touches most tables — refetch everything so every card empties at
      // once (and the shared sample count → 0, which unmounts this banner AND lets
      // the WelcomeCard setup checklist take over).
      await qc.invalidateQueries()
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="sample-banner" aria-label={t.sample.title}>
      <span className="sample-banner__icon">
        <Icon name="sparkle-bold" size={20} />
      </span>
      <div className="sample-banner__text">
        <span className="sample-banner__title">{t.sample.title}</span>
        <span className="sample-banner__hint">{t.sample.hint}</span>
      </div>
      <div className="sample-banner__actions">
        {/* Secondary: keep exploring, dismiss the banner (graduate later from Réglages). */}
        <button type="button" className="btn btn--ghost btn--sm" onClick={keep}>
          {t.sample.later}
        </button>
        {/* Primary + positive: the guided next step — clear the demo and start for real. */}
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={clear}
          disabled={busy || !online}
          title={!online ? t.offline.unavailable : undefined}
        >
          {busy ? t.sample.clearing : t.sample.clearStart}
        </button>
      </div>
    </aside>
  )
}
