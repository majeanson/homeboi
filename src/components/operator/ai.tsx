import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { useAi, useAiToggle } from '../../lib/ai'
import { isGuest } from '../../lib/device'
import { InlineIcon } from '../Icon'

// Réglages ▸ IA — the household AI on/off switch (the operator's "turn it off
// completely"). Flipping it off makes /api/health report AI as off, which hides
// every AI affordance app-wide AND makes each AI endpoint fall back to its no-AI
// path server-side (capture → plain note, recipe import → parsers only, suggestions
// / recap / ask hidden). Nothing breaks: the app is fully usable without AI.
//
// Three states: no binding on this deployment (nothing to enable), AI on, AI off.
// A read-only guest sees the state as text only (the toggle is a household write).
export function AiSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { enabled, available } = useAi()
  const toggle = useAiToggle()
  const ro = isGuest()
  const [busy, setBusy] = useState(false)

  async function flip() {
    if (busy) return
    setBusy(true)
    try {
      await toggle(!enabled)
    } finally {
      setBusy(false)
    }
  }

  const statusLabel = enabled ? t.operator.aiOn : t.operator.aiDisabled

  return (
    <OperatorSection title={t.operator.aiTitle} help={help} helpKey="ai" hint={t.operator.aiSectionHint}>
      {!available ? (
        // The env.AI binding isn't wired on this deployment — there's nothing to
        // switch on. Say so plainly rather than showing a dead toggle.
        <p className="operator__hint mono">{t.operator.aiUnavailableHint}</p>
      ) : ro ? (
        <p className="operator__hint mono">{statusLabel}</p>
      ) : (
        <>
          <button
            type="button"
            className={`btn${enabled ? ' btn--primary' : ''}`}
            onClick={flip}
            disabled={busy}
            aria-pressed={enabled}
          >
            <InlineIcon name="sparkle-bold" /> {busy ? t.operator.aiSaving : statusLabel}
          </button>
          <p className="operator__hint mono">{enabled ? t.operator.aiToggleHintOn : t.operator.aiToggleHintOff}</p>
        </>
      )}
      <p className="operator__hint mono">
        <Link to="/settings?tab=guide&card=ai" className="devkit__link">
          <InlineIcon name="book-open-bold" size={14} /> {t.operator.aiLearnMore}
        </Link>
      </p>
    </OperatorSection>
  )
}
