import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useAuth } from '../lib/auth'
import { useOnline } from '../lib/online'
import { useConfirm } from '../lib/confirm'
import { api } from '../lib/api'
import { SAMPLE_KEY } from '../lib/queryKeys'
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

  // Only the operator manages sample data; the query is gated to a signed-in
  // session so a kiosk doesn't poll it. count>0 ⇒ the demo is still present.
  const count =
    useQuery({
      queryKey: SAMPLE_KEY,
      queryFn: () => api<{ count: number }>('seed'),
      enabled: signedIn,
    }).data?.count ?? 0

  if (audience === 'toddler' || !signedIn || dismissed || count === 0) return null

  const keep = () => {
    persistDismissed()
    setDismissed(true)
  }

  const clear = async () => {
    if (busy) return
    const okay = await confirm({
      message: t.sample.clearConfirm,
      confirmLabel: t.sample.clear,
      tone: 'danger',
    })
    if (!okay) return
    setBusy(true)
    try {
      await api('seed', { method: 'DELETE' })
      // A clear touches most tables — refetch everything so every card empties at
      // once (and the banner's own count → 0, which unmounts it).
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
        <button type="button" className="btn btn--ghost btn--sm" onClick={keep}>
          {t.sample.keep}
        </button>
        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={clear}
          disabled={busy || !online}
          title={!online ? t.offline.unavailable : undefined}
        >
          {busy ? t.sample.clearing : t.sample.clear}
        </button>
      </div>
    </aside>
  )
}
