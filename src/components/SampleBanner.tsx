import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useAuth } from '../lib/auth'
import { useOnline } from '../lib/online'
import { useConfirm } from '../lib/confirm'
import { useSandbox } from '../lib/demo'
import { useSampleStatus } from '../lib/sample'
import { welcomeDismissed } from './WelcomeCard'
import { api } from '../lib/api'
import { Icon } from './Icon'

// The board banner for a freshly-seeded household (onboarding Phase 1). A new
// account is pre-populated with a small demo family so the board is ALIVE on first
// login; this calm strip tells the operator it's an example and offers two ways
// out: keep it (dismiss — explore, then add real data alongside — clearing later
// never touches what you added, thanks to is_sample) or clear it now.
//
// In a demo SANDBOX session (« Essayer pour vrai » — lib/demo.ts), the SAME strip
// wears its claim face instead: the household is a 24-hour throwaway, so the one
// thing worth saying is « Garder ma maisonnée » (→ /garder, the claim form).
// Clearing examples would be noise there — an emptied throwaway is still a
// throwaway — and once claimed the session stops being a sandbox, so this very
// banner flips back to the ordinary explore/clear face on its own.
//
// Operator-only: clearing is an operator action, and a wall kiosk (no session)
// just shows the living demo until the operator clears it from their phone. Never
// in the toddler lens. Dismissal persists like WelcomeCard's, so it won't nag.
const KEY = 'babillard-sample-banner'
// The claim strip's own dismissal — a visitor who dismissed the sample strip on
// their real account earlier must still see the claim offer in a sandbox.
const CLAIM_KEY = 'babillard-claim-banner'

function isDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function persistDismissed(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* noop */
  }
}

export function SampleBanner() {
  const t = useT()
  const { audience } = useAudience()
  const { signedIn } = useAuth()
  const sandbox = useSandbox()
  const online = useOnline()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [dismissed, setDismissed] = useState(() => isDismissed(KEY))
  const [claimDismissed, setClaimDismissed] = useState(() => isDismissed(CLAIM_KEY))
  const [busy, setBusy] = useState(false)
  // Whether the WelcomeCard (which hosts the claim offer in a sandbox) is gone — it's
  // a sibling, so it announces its dismissal rather than us polling localStorage.
  const [welcomeGone, setWelcomeGone] = useState(welcomeDismissed)
  useEffect(() => {
    const onGone = () => setWelcomeGone(true)
    window.addEventListener('bb:welcome-dismissed', onGone)
    return () => window.removeEventListener('bb:welcome-dismissed', onGone)
  }, [])

  // Only the operator manages sample data (the shared hook gates its query to a
  // signed-in session). hasSample ⇒ the demo is still present ⇒ we're in the
  // "explore" act and this banner is the board's ONE onboarding card.
  const { hasSample } = useSampleStatus()

  if (audience === 'toddler' || !signedIn) return null

  // The sandbox claim face — not gated on hasSample: a visitor who cleared or
  // outgrew the seed still deserves the way to keep what they built.
  //
  // But it stands down while the WelcomeCard's try-this card is up: that card now
  // carries the claim offer itself. Otherwise the demo board opened on TWO stacked
  // banners about the demo and showed no actual board (first-run pass, 2026-07-14).
  // The offer is therefore on screen exactly once — inside the card, then here once
  // the card is dismissed.
  if (sandbox) {
    if (claimDismissed || !welcomeGone) return null
    return (
      <aside className="sample-banner" aria-label={t.claim.bannerTitle}>
        <span className="sample-banner__icon">
          <Icon name="sparkle-bold" size={20} />
        </span>
        <div className="sample-banner__text">
          <span className="sample-banner__title">{t.claim.bannerTitle}</span>
          <span className="sample-banner__hint">{t.claim.bannerHint}</span>
        </div>
        <div className="sample-banner__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              persistDismissed(CLAIM_KEY)
              setClaimDismissed(true)
            }}
          >
            {t.sample.later}
          </button>
          {/* Primary: keep the household — a navigation, so it needs no online gate
              (the claim form itself is the online-only auth step). */}
          <Link to="/garder" className="btn btn--primary btn--sm">
            {t.claim.bannerCta}
          </Link>
        </div>
      </aside>
    )
  }

  if (dismissed || !hasSample) return null

  const keep = () => {
    persistDismissed(KEY)
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
      // Positive tone (not danger): clearing the demo is the guided next step, not a
      // scary delete — it only removes is_sample rows and is reloadable from Réglages.
      tone: 'default',
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
