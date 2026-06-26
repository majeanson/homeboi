import { type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { formatTime } from '../../lib/format'
import { useCarToday, type CarRide, type CarModel } from '../../lib/car'
import { useCars } from '../../lib/carPrefs'
import { type Member } from '../../lib/members'
import { MEMBERS_KEY } from '../../lib/queryKeys'
import { Icon } from '../Icon'
import { Avatar } from '../Avatar'
import { BoardCard } from './BoardCard'

// The board "L'auto" glance card — a calm strip near the day, in every parent view
// (like CercleBirthdays). Answers "où est l'auto, et est-elle libre ?" at a glance.
// The board feeds it TODAY's resolved model (the status line is the live "right
// now"). The calendar (Mois) feeds the SAME view a single day out of a week range,
// so the card FOLLOWS the selected date instead of always showing today (#28) — on
// another date there is no "now", so it summarizes that day's committed windows
// (who has the car, when) rather than a live status.
// Renders NOTHING when the household uses no car at all. Icons are Pip (Phosphor)
// glyphs, never emoji (NFR-KID-2).
export function AutoCard() {
  const { data: car } = useCarToday()
  if (!car) return null
  return <AutoCardView model={car} day={car.today} />
}

// One day of a resolved CarModel, rendered as the calm L'auto card. `day` selects
// which day of `model.days` to show; the status line is the live "right now" only
// when `day` is today (the model carries `status` for today only), else a summary of
// that date's car windows.
export function AutoCardView({ model, day }: { model: CarModel; day: number }) {
  const t = useT()
  const { lang } = useLang()
  const { name: carName, color: carColor, primary } = useCars()
  const { data: membersData } = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<{ members: Member[] }>('members'),
    ...live,
  })
  const members = membersData?.members ?? []
  const memberOf = (id: string | null | undefined) => (id ? members.find((m) => m.id === id) : undefined)
  const nameOf = (id: string | null | undefined) => memberOf(id)?.display_name

  const carDay = model.days.find((d) => d.day === day)
  const rides = carDay?.rides ?? []
  const isToday = day === model.today
  // Render whenever the household USES « L'auto » — a car configured, a work
  // schedule, or a ride on this day — even on an idle/free day, so the card always
  // answers "où est l'auto ?". Only a household that's set nothing up sees no card.
  if (model.cars.length === 0 && !model.hasSchedule && rides.length === 0) return null

  const hhmm = (at: number) => formatTime(at, lang)
  const carLabel = carName(primary?.id) ?? t.auto.car
  const tint = carColor(primary?.id) ?? '#6b7a8f'

  // The status line. For TODAY it is day-AWARE + time-AWARE: the live "right now"
  // status the server folds rides into (committed → "le reste de la journée", never a
  // false "toute la journée"). For ANOTHER calendar date there is no "now", so it
  // describes the day's committed windows (who holds the car, when) — or "libre toute
  // la journée" when nothing claims it.
  let status: string
  let busy = false
  let holder: Member | undefined
  if (isToday) {
    if (!model.status.free) {
      busy = true
      const hName = nameOf(model.status.span?.holderId) ?? model.status.span?.label ?? ''
      const back = model.status.until ? t.auto.backAround(hhmm(model.status.until)) : ''
      status = hName ? `${t.auto.withWho(hName)}${back ? ` · ${back}` : ''}` : t.auto.taken + (back ? ` · ${back}` : '')
    } else if (model.status.until) {
      status = t.auto.freeUntil(hhmm(model.status.until))
    } else if (model.status.committed) {
      status = t.auto.freeRestOfDay
    } else {
      status = t.auto.freeAllDay
    }
    holder = busy ? memberOf(model.status.span?.holderId) : undefined
  } else {
    const spans = carDay?.spans ?? []
    if (spans.length > 0) {
      busy = true
      const hId = spans.find((s) => s.holderId)?.holderId ?? null
      holder = memberOf(hId)
      const windows = spans.map((s) => `${hhmm(s.start)}–${hhmm(s.end)}`).join(' · ')
      const who = nameOf(hId) ?? spans.find((s) => s.label)?.label ?? ''
      status = who ? `${t.auto.withWho(who)} · ${windows}` : windows
    } else {
      status = t.auto.freeAllDay
    }
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
    // Same header anatomy as every board section (icon disc + label + rule), via the
    // shared BoardCard shell, so « L'auto » reads as a peer of the other cards.
    <BoardCard
      to="/voiture"
      className="auto-card"
      style={{ ['--car-tint']: tint } as CSSProperties}
      ariaLabel={t.auto.title}
      icon="car-bold"
      label={carLabel}
    >
      <div className={`auto-card__status${busy ? ' auto-card__status--busy' : ''}`}>
        {holder && (
          <Avatar kind={holder.avatar_kind} photo={holder.avatar_ref} colour={holder.colour} name={holder.display_name} size={22} />
        )}
        <span>{status}</span>
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
    </BoardCard>
  )
}
