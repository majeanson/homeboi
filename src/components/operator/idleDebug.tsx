import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useSurface } from '../../lib/surface'
import { useProfile } from '../../lib/profile'
import { imgUrl } from '../../lib/image'
import { Icon, InlineIcon } from '../Icon'
import { currentIdleSpeed, setIdleSpeed, forceIdle, IDLE_SPEED_MS, type IdleSpeed } from '../../lib/idleDebug'

// Debug the shared-kiosk idle drift (HubLayout): once a face is picked, the app
// drifts back to Maisonnée after 3 idle minutes, with a heads-up chip 30 s before.
// Normally invisible while developing, and its effect (clearing the profile) is
// silent — so this panel makes the WHOLE cycle observable in one place: pick a
// test face here, shrink the window to seconds (or force it), and watch the
// "current profile" readout below flip back to Maisonnée when the drift fires.
// Dev tooling, not a family feature; lives under Réglages ▸ Debug.
const SPEEDS: IdleSpeed[] = ['normal', '30s', '10s', '5s']

interface Member {
  id: string
  display_name: string
  avatar_kind: string
  avatar_ref: string
  colour: string
}

export function IdleDebugSection() {
  const t = useT()
  const { surface } = useSurface()
  const { memberId, setMemberId } = useProfile()
  const { data } = useQuery({ queryKey: ['members'], queryFn: () => api<{ members: Member[] }>('members') })
  const members = data?.members ?? []
  const current = members.find((m) => m.id === memberId)

  const [speed, setSpeed] = useState<IdleSpeed>(currentIdleSpeed())
  // The timer arms on a kiosk OR whenever a debug speed is set (HubLayout mirrors
  // this), and only with a profile to clear — so say plainly when it's live.
  const armed = (surface === 'kiosk' || speed !== 'normal') && !!memberId

  const speedLabel = (s: IdleSpeed) =>
    s === 'normal' ? t.operator.debugSpeedNormal : t.operator.debugSpeedSeconds(Math.round((IDLE_SPEED_MS[s] ?? 0) / 1000))

  function pickSpeed(s: IdleSpeed) {
    setSpeed(s)
    setIdleSpeed(s)
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.debugIdleTitle}</h2>
      <p className="mono">{t.operator.debugIdleHint}</p>

      {/* Live readout — this is what "pops off": when the drift fires, the name
          here flips to Maisonnée. */}
      <p className="operator__hint mono" role="status">
        <InlineIcon name="hourglass-high-bold" /> {armed ? t.operator.debugIdleArmed : t.operator.debugIdleIdle}
        {' · '}
        {t.operator.debugIdleSurface(surface)}
        {' · '}
        {t.operator.debugIdleProfileNow}{' '}
        <strong>{current?.display_name ?? t.profile.household}</strong>
      </p>

      {/* Pick a test face here (no need to go to the board), then watch it clear. */}
      <p className="sheet__group-label mono">{t.operator.debugIdlePick}</p>
      <div className="profile-faces">
        {members.map((m) => {
          const photo = m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null
          const sel = m.id === memberId
          return (
            <button
              key={m.id}
              type="button"
              className={'profile-face' + (sel ? ' is-sel' : '')}
              onClick={() => setMemberId(m.id)}
              aria-pressed={sel}
            >
              <span className="profile-face__av" style={{ background: photo ? undefined : m.colour }}>
                {photo ? <img src={photo} alt="" /> : (m.display_name[0] ?? '?').toUpperCase()}
              </span>
              <span className="profile-face__name">{m.display_name}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={'profile-face' + (memberId === null ? ' is-sel' : '')}
          onClick={() => setMemberId(null)}
          aria-pressed={memberId === null}
        >
          <span className="profile-face__av profile-face__av--all" aria-hidden="true">
            <Icon name="users-three-bold" size={24} />
          </span>
          <span className="profile-face__name">{t.profile.household}</span>
        </button>
      </div>

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
              onClick={() => pickSpeed(s)}
            >
              {speedLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {/* Force the moments without waiting for the timer at all. */}
      <div className="operator__debug-actions">
        <button type="button" className="btn btn--ghost" onClick={() => forceIdle('screensaver')}>
          <Icon name="image-square-bold" size={18} />
          {t.operator.debugForceSaver}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => forceIdle('warn')} disabled={!memberId}>
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
