import { useQuery } from '@tanstack/react-query'
import { useOperatorT } from '../../i18n.operator'
import { api } from '../../lib/api'
import { HEALTH_KEY } from '../../lib/queryKeys'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ Système ▸ Appareils & accès — « État des services » (E-34, bmad/08).
// The optional bindings degrade SILENTLY by design (right for guests, mystifying
// for the operator): AI-unset hides capture's sparkle, R2-unset hides every photo/
// memo/document control, DO-unset quietly falls back to polling. This card is
// where that silence becomes legible — each service, its state, and one plain line
// on what hides without it. Reads the same /api/health flags the SPA already gates
// on (lib/ai.ts `useAi`, same HEALTH_KEY cache), plus the `photos`/`realtime`
// presence facts health.ts now reports.

interface Health {
  ai: boolean
  aiAvailable: boolean
  cloudOcr: boolean
  photos: boolean
  realtime: boolean
  rateLimit: boolean
  alerts: boolean
}

export function HealthSection() {
  const o18n = useOperatorT()
  const q = useQuery({ queryKey: HEALTH_KEY, queryFn: () => api<Health>('health'), staleTime: 5 * 60_000 })
  const h = q.data
  if (!h) return null
  const rows = [
    {
      name: o18n.healthAi,
      on: h.ai,
      // Three states for AI only: wired+on, wired-but-household-off, not wired.
      state: !h.aiAvailable ? o18n.healthOff : h.ai ? o18n.healthOn : o18n.healthDisabled,
      when: o18n.healthAiWhen,
    },
    {
      name: o18n.healthPhotos,
      on: h.photos,
      state: h.photos ? o18n.healthOn : o18n.healthOff,
      when: o18n.healthPhotosWhen,
    },
    {
      name: o18n.healthRealtime,
      on: h.realtime,
      state: h.realtime ? o18n.healthOn : o18n.healthOff,
      when: o18n.healthRealtimeWhen,
    },
    {
      name: o18n.healthCloudOcr,
      on: h.cloudOcr,
      state: h.cloudOcr ? o18n.healthOn : o18n.healthOff,
      when: o18n.healthCloudOcrWhen,
    },
    {
      // The brute-force bound on the sign-in doors (functions/_lib/rateLimit.ts). Off
      // means the two bindings are not wired on this deployment — a hole, not a mood.
      name: o18n.healthRateLimit,
      on: h.rateLimit,
      state: h.rateLimit ? o18n.healthOn : o18n.healthOff,
      when: o18n.healthRateLimitWhen,
    },
    {
      // The nightly cron's alert channel (functions/_lib/nightly.ts): off means a failed
      // backup or a broken sandbox sweep only reaches a log nobody opens.
      name: o18n.healthAlerts,
      on: h.alerts,
      state: h.alerts ? o18n.healthOn : o18n.healthOff,
      when: o18n.healthAlertsWhen,
    },
  ]
  return (
    <OperatorSection title={o18n.healthTitle} hint={o18n.healthHint} helpKey="health">
      <ul className="health-list">
        {rows.map((r) => (
          <li key={r.name} className="health-list__row">
            <div className="health-list__head">
              <span className="health-list__name">{r.name}</span>
              <span className={`tag ${r.on ? 'tag--on' : 'tag--off'}`}>{r.state}</span>
            </div>
            {/* Calm: explain only what's absent — a working service needs no prose. */}
            {!r.on && <p className="health-list__when">{r.when}</p>}
          </li>
        ))}
      </ul>
    </OperatorSection>
  )
}
