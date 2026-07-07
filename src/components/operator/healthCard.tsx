import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { HEALTH_KEY } from '../../lib/queryKeys'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ Système ▸ Version & diagnostics — « État des services » (E-34, bmad/08).
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
}

export function HealthSection() {
  const t = useT()
  const q = useQuery({ queryKey: HEALTH_KEY, queryFn: () => api<Health>('health'), staleTime: 5 * 60_000 })
  const h = q.data
  if (!h) return null
  const rows = [
    {
      name: t.operator.healthAi,
      on: h.ai,
      // Three states for AI only: wired+on, wired-but-household-off, not wired.
      state: !h.aiAvailable ? t.operator.healthOff : h.ai ? t.operator.healthOn : t.operator.healthDisabled,
      when: t.operator.healthAiWhen,
    },
    {
      name: t.operator.healthPhotos,
      on: h.photos,
      state: h.photos ? t.operator.healthOn : t.operator.healthOff,
      when: t.operator.healthPhotosWhen,
    },
    {
      name: t.operator.healthRealtime,
      on: h.realtime,
      state: h.realtime ? t.operator.healthOn : t.operator.healthOff,
      when: t.operator.healthRealtimeWhen,
    },
    {
      name: t.operator.healthCloudOcr,
      on: h.cloudOcr,
      state: h.cloudOcr ? t.operator.healthOn : t.operator.healthOff,
      when: t.operator.healthCloudOcrWhen,
    },
  ]
  return (
    <OperatorSection title={t.operator.healthTitle} hint={t.operator.healthHint}>
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
