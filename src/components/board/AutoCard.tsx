import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { formatTime } from '../../lib/format'
import { useCarToday, type CarRide } from '../../lib/car'
import { useCars } from '../../lib/carPrefs'
import { type Member } from '../../lib/members'
import { Icon } from '../Icon'
import { Avatar } from '../Avatar'

// The board "L'auto" glance card — a calm strip near the day, in every parent view
// (like CercleBirthdays). Answers "où est l'auto, et est-elle libre ?" at a glance:
// the car's status right now (libre jusqu'à… / avec X — revient ~…), today's rides
// with WHO drives (their face) + who rides along, and a soft conflict note when a
// ride collides with a moment the car's already spoken for. Renders NOTHING when
// there's nothing to say (no car, no schedule, no rides) — finite glance, NFR-CALM.
// Taps into /voiture. Icons are Pip (Phosphor) glyphs, never emoji (NFR-KID-2).
export function AutoCard() {
  const t = useT()
  const { lang } = useLang()
  const { data: car } = useCarToday()
  const { name: carName, color: carColor, primary } = useCars()
  const { data: membersData } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ members: Member[] }>('members'),
    ...live,
  })
  const members = membersData?.members ?? []
  const memberOf = (id: string | null | undefined) => (id ? members.find((m) => m.id === id) : undefined)
  const nameOf = (id: string | null | undefined) => memberOf(id)?.display_name

  if (!car) return null
  const today = car.days.find((d) => d.day === car.today)
  const rides = today?.rides ?? []
  const spans = today?.spans ?? []
  // Render whenever the household USES « L'auto » — a car configured, a work
  // schedule, or a ride today — even on an idle/free day, so the board always
  // answers "où est l'auto ?" (#28). Only a household that's set nothing up sees no card.
  if (car.cars.length === 0 && !car.hasSchedule && rides.length === 0) return null

  const hhmm = (at: number) => formatTime(at, lang)
  const carLabel = carName(primary?.id) ?? t.auto.car
  const tint = carColor(primary?.id) ?? '#6b7a8f'

  // The status line. Day-AWARE so the glance never lies: "Libre toute la journée"
  // only when the day truly holds NOTHING. If the car was out earlier today but is
  // back now (a finished work block, an evening), it reads "libre — le reste de la
  // journée", not "toute la journée" (the old now-only bug).
  let status: string
  let busy = false
  if (!car.status.free) {
    busy = true
    const holder = nameOf(car.status.span?.holderId) ?? car.status.span?.label ?? ''
    const back = car.status.until ? t.auto.backAround(hhmm(car.status.until)) : ''
    status = holder ? `${t.auto.withWho(holder)}${back ? ` · ${back}` : ''}` : t.auto.taken + (back ? ` · ${back}` : '')
  } else if (car.status.until) {
    status = t.auto.freeUntil(hhmm(car.status.until))
  } else if (spans.length > 0) {
    status = t.auto.freeRestOfDay
  } else {
    status = t.auto.freeAllDay
  }
  const holder = busy ? memberOf(car.status.span?.holderId) : undefined

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
          <span className="auto-card__caricon" style={{ color: tint }} aria-hidden="true">
            <Icon name="car-bold" size={22} />
          </span>
          {carLabel}
        </span>
        <span className={`auto-card__status${busy ? ' auto-card__status--busy' : ''}`}>
          {holder && (
            <Avatar kind={holder.avatar_kind} photo={holder.avatar_ref} colour={holder.colour} name={holder.display_name} size={22} />
          )}
          <span>{status}</span>
        </span>
      </div>
      {rides.length > 0 && (
        <ul className="auto-card__rides">
          {rides.map((r) => {
            const driver = memberOf(r.memberId)
            return (
              <li key={r.id} className={`auto-card__ride${r.conflict ? ' auto-card__ride--conflict' : ''}`}>
                <span className="auto-card__when mono">{r.allDay ? t.board.allDay : hhmm(r.at)}</span>
                {driver ? (
                  <Avatar kind={driver.avatar_kind} photo={driver.avatar_ref} colour={driver.colour} name={driver.display_name} size={26} />
                ) : (
                  <span className="auto-card__caricon auto-card__caricon--ride" style={{ color: tint }} aria-hidden="true">
                    <Icon name="car-bold" size={17} />
                  </span>
                )}
                <span className="auto-card__what">
                  <span className="auto-card__ride-title">{r.title}</span>
                  {driverLine(r) ? <span className="auto-card__who">{driverLine(r)}</span> : null}
                </span>
                {r.passengers.length > 0 && (
                  <span className="auto-card__pax" aria-hidden="true">
                    {r.passengers.map((pid) => {
                      const p = memberOf(pid)
                      return <Avatar key={pid} kind={p?.avatar_kind} photo={p?.avatar_ref} colour={p?.colour ?? '#888'} name={p?.display_name} size={20} />
                    })}
                  </span>
                )}
                {r.conflict && (
                  <span className="auto-card__conflict" title={t.auto.conflict}>
                    <Icon name="warning-bold" size={15} />
                    <span className="mono">{t.auto.conflictShort}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Link>
  )
}
