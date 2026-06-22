import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { formatTime } from '../../lib/format'
import { useCarToday, type CarRide } from '../../lib/car'
import { useCars } from '../../lib/carPrefs'
import { type Member } from '../../lib/members'

// The board "L'auto" glance card — a calm strip above the day, in every parent view
// (like CercleBirthdays). Answers "où est l'auto, et est-elle libre ?" at a glance:
// the car's status right now (libre jusqu'à… / avec X — revient ~…), today's rides
// with who drives + who rides, and a soft conflict note when a ride collides with a
// moment the car's already spoken for. Renders NOTHING when there's nothing to say
// (no rides + nothing busy today) — finite glance, NFR-CALM. Taps into /voiture.
export function AutoCard() {
  const t = useT()
  const { lang } = useLang()
  const { data: car } = useCarToday()
  const { name: carName, primary } = useCars()
  const { data: membersData } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ members: Member[] }>('members'),
    ...live,
  })
  const members = membersData?.members ?? []
  const nameOf = (id: string | null | undefined) => (id ? members.find((m) => m.id === id)?.display_name : undefined)
  const colorOf = (id: string | null | undefined) => (id ? members.find((m) => m.id === id)?.colour : undefined)

  if (!car) return null
  const today = car.days.find((d) => d.day === car.today)
  const rides = today?.rides ?? []
  // Render whenever the household USES « L'auto » — a car configured, a work
  // schedule, or a ride today — even on an idle/free day, so the board always
  // answers "où est l'auto ?" (the always-visible board behaviour, #28). Only a
  // household that's set nothing up at all sees no card.
  if (car.cars.length === 0 && !car.hasSchedule && rides.length === 0) return null

  const hhmm = (at: number) => formatTime(at, lang)
  const carLabel = carName(primary?.id) ?? t.auto.car

  // The status line — busy now (with who + when it frees) or free (until the next
  // commitment, if any).
  let status: string
  if (!car.status.free) {
    const holder = nameOf(car.status.span?.holderId) ?? car.status.span?.label ?? ''
    const back = car.status.until ? t.auto.backAround(hhmm(car.status.until)) : ''
    status = holder ? `${t.auto.withWho(holder)}${back ? ` · ${back}` : ''}` : t.auto.taken + (back ? ` · ${back}` : '')
  } else {
    status = car.status.until ? t.auto.freeUntil(hhmm(car.status.until)) : t.auto.freeAllDay
  }

  // Who drives a ride: a member = we drive (our car); a cercle contact = a carpool
  // parent drives (their car); a business = a rendez-vous destination.
  const driverLine = (r: CarRide): string => {
    if (r.memberId) return t.auto.drives(nameOf(r.memberId) ?? '')
    if (r.contactId) return t.auto.carpool(r.contactName ?? '')
    if (r.businessId) return r.businessName ?? ''
    return ''
  }

  return (
    <Link to="/voiture" className="surface auto-card" aria-label={t.auto.title}>
      <div className="auto-card__head">
        <span className="auto-card__title">
          <span aria-hidden="true">🚗</span> {carLabel}
        </span>
        <span className={`auto-card__status mono${car.status.free ? '' : ' auto-card__status--busy'}`}>{status}</span>
      </div>
      {rides.length > 0 && (
        <ul className="auto-card__rides">
          {rides.map((r) => (
            <li key={r.id} className="auto-card__ride">
              <span className="auto-card__when mono">{r.allDay ? t.board.allDay : hhmm(r.at)}</span>
              <span className="auto-card__what">
                {r.title}
                {driverLine(r) ? <span className="auto-card__who mono"> · {driverLine(r)}</span> : null}
                {r.passengers.length > 0 && (
                  <span className="auto-card__pax" aria-hidden="true">
                    {r.passengers.map((pid) => (
                      <span key={pid} className="auto-card__face" style={{ background: colorOf(pid) ?? '#888' }}>
                        {(nameOf(pid) ?? '?').slice(0, 1)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {r.conflict && (
                <span className="auto-card__conflict mono" title={t.auto.conflict}>
                  <span aria-hidden="true">⚠️</span> {t.auto.conflictShort}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}
