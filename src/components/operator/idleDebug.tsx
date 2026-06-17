import { useState } from 'react'
import { useT } from '../../i18n'
import { useSurface } from '../../lib/surface'
import { useProfile } from '../../lib/profile'
import { Icon, InlineIcon } from '../Icon'
import { currentIdleSpeed, setIdleSpeed, forceIdle, IDLE_SPEED_MS, type IdleSpeed } from '../../lib/idleDebug'

// Debug the shared-kiosk idle drift (HubLayout): on a KIOSK with a profile picked,
// the app drifts back to Maisonnée after 3 idle minutes, with a heads-up chip 30 s
// before. Normally invisible while developing — this panel shrinks the window to
// seconds and forces the warning / the drift on demand. Dev tooling, not a family
// feature; lives under Réglages ▸ Debug beside the AI error log.
const SPEEDS: IdleSpeed[] = ['normal', '30s', '10s', '5s']

export function IdleDebugSection() {
  const t = useT()
  const { surface } = useSurface()
  const { memberId } = useProfile()
  // The timer only runs where idle does (a kiosk with a picked profile). We say so
  // plainly so a test on a phone/laptop doesn't look "broken" — the force buttons
  // still work everywhere, but the countdown won't arm off a kiosk.
  const armed = surface === 'kiosk' && !!memberId
  const [speed, setSpeed] = useState<IdleSpeed>(currentIdleSpeed())

  const speedLabel = (s: IdleSpeed) =>
    s === 'normal' ? t.operator.debugSpeedNormal : t.operator.debugSpeedSeconds(Math.round((IDLE_SPEED_MS[s] ?? 0) / 1000))

  function pick(s: IdleSpeed) {
    setSpeed(s)
    setIdleSpeed(s)
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.debugIdleTitle}</h2>
      <p className="mono">{t.operator.debugIdleHint}</p>

      {/* Where the timer stands right now. */}
      <p className="operator__hint mono" role="status">
        <InlineIcon name="hourglass-high-bold" /> {armed ? t.operator.debugIdleArmed : t.operator.debugIdleIdle}
        {' · '}
        {t.operator.debugIdleSurface(surface)}
        {' · '}
        {memberId ? t.operator.debugIdleProfileSet : t.operator.debugIdleProfileNone}
      </p>

      {/* Shrink the 3-minute window so the drift happens in seconds. */}
      <div className="operator__seg">
        <span className="operator__seg-label mono">{t.operator.debugIdleSpeed}</span>
        <div className="audience-switch mono" role="group" aria-label={t.operator.debugIdleSpeed}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`audience-switch__opt${speed === s ? ' is-active' : ''}`}
              aria-pressed={speed === s}
              onClick={() => pick(s)}
            >
              {speedLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {/* Force the two moments without waiting for the timer at all. */}
      <div className="operator__debug-actions">
        <button type="button" className="btn btn--ghost" onClick={() => forceIdle('warn')}>
          <Icon name="hourglass-high-bold" size={18} />
          {t.operator.debugForceWarn}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => forceIdle('drift')} disabled={!memberId}>
          <Icon name="users-three-bold" size={18} />
          {t.operator.debugForceDrift}
        </button>
      </div>

      <p className="operator__hint mono">{t.operator.debugIdleNote}</p>
    </section>
  )
}
