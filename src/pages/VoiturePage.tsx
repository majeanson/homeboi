import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { useWrite } from '../lib/write'
import { CAR_KEY, BOARD_KEY, MEMBERS_KEY } from '../lib/queryKeys'
import { useCarWeek, type CarDay, type CarRide, type CarModel } from '../lib/car'
import { useCars } from '../lib/carPrefs'
import { type Member } from '../lib/members'
import { useAudience } from '../lib/audience'
import { todayLocalDay, addLocalDays, localDayOfWeek } from '../lib/localDay'
import { formatWeekday, formatDay, formatTime } from '../lib/format'
import { SceneHead } from '../components/SceneHead'
import { EmptyState } from '../components/EmptyState'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { useNavigate } from 'react-router-dom'

// « L'auto » week scene (/voiture) — the FAST weekly editor + glance. The weekly
// schedule template pre-fills every day, so a normal week needs zero taps; tapping a
// day overrides just that date (who has the car + when, or "stays home"), without
// touching the template. Shows each day's resolved car windows + rides (who drives
// whom). Toddler audience gets a picture-first "qui te reconduit ?" today view.
// #28 carpool / single-car coordination.

const pad = (n: number) => String(n).padStart(2, '0')
const minToHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
const hhmmToMin = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  const v = +m[1] * 60 + +m[2]
  return v >= 0 && v <= 1440 ? v : null
}
// The Sunday on/before a local day (matches the recur week boundary).
const startOfWeek = (day: number) => addLocalDays(day, -localDayOfWeek(new Date(day * 1000)))

export function VoiturePage() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  const { audience } = useAudience()
  const write = useWrite()
  const { name: carName, color: carColorOf, primary } = useCars()
  const carId = primary?.id ?? 'car'
  const carColor = carColorOf(primary?.id) ?? '#6b7a8f'
  const { data: membersData } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members'), ...live })
  const members = membersData?.members ?? []
  const nameOf = (id: string | null | undefined) => (id ? members.find((m) => m.id === id)?.display_name : undefined)
  const colorOf = (id: string | null | undefined) => (id ? members.find((m) => m.id === id)?.colour : undefined)

  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayLocalDay()))
  const weekEnd = addLocalDays(weekStart, 7)
  const { data: car } = useCarWeek(weekStart, weekEnd)
  const today = todayLocalDay()
  const [editDay, setEditDay] = useState<number | null>(null)

  const hhmm = (at: number) => formatTime(at, lang)

  // Persist an override for one day (a window + holder, or "stays home"), or clear it
  // (revert that day to the template). Invalidates the car + board caches.
  async function saveDay(day: number, body: { free: boolean; holderId?: string | null; startMin?: number; endMin?: number }) {
    await write('car-day', { method: 'POST', body: { carId, day, ...body }, affectedKeys: [CAR_KEY, BOARD_KEY] })
    setEditDay(null)
  }
  async function clearDay(day: number) {
    await write('car-day', { method: 'DELETE', body: { carId, day }, affectedKeys: [CAR_KEY, BOARD_KEY] })
    setEditDay(null)
  }
  // Reset the whole visible week to the template (drop every override in it).
  async function resetWeek() {
    const days = (car?.days ?? []).filter((d) => d.override)
    for (const d of days) await write('car-day', { method: 'DELETE', body: { carId, day: d.day }, affectedKeys: [CAR_KEY, BOARD_KEY] })
  }
  // Copy last week's adjustments onto this week (only the days that were overridden).
  async function copyLastWeek() {
    const prevStart = addLocalDays(weekStart, -7)
    const prev = await api<CarModel>(`car?from=${prevStart}&to=${weekStart}`)
    for (const d of prev.days) {
      if (!d.override) continue
      const target = addLocalDays(d.day, 7)
      await write('car-day', {
        method: 'POST',
        body: {
          carId,
          day: target,
          free: d.override.free,
          holderId: d.override.holderId ?? null,
          startMin: d.override.startMin ?? undefined,
          endMin: d.override.endMin ?? undefined,
        },
        affectedKeys: [CAR_KEY, BOARD_KEY],
      })
    }
  }

  // Who drives a ride (member = we drive · contact = carpool parent · business = dest).
  const driverLine = (r: CarRide): string => {
    if (r.memberId) return t.auto.drives(nameOf(r.memberId) ?? '')
    if (r.contactId) return t.auto.carpool(r.contactName ?? '')
    if (r.businessId) return r.businessName ?? ''
    return ''
  }

  // ── Toddler: a picture-first "who drives you today?" ───────────────────────────
  if (audience === 'toddler') {
    const todayDay = car?.days.find((d) => d.day === today)
    const firstRide = todayDay?.rides[0]
    const driverId = firstRide?.memberId ?? null
    return (
      <div className="scene voiture voiture--kid" aria-label={t.auto.title}>
        <SceneHead title={t.auto.toddlerWho} onClose={close} />
        <div className="scene__body voiture__kid-body">
          {firstRide ? (
            <div className="voiture__kid-card">
              <span className="voiture__kid-face" style={{ background: colorOf(driverId) ?? '#6b7a8f' }}>
                {firstRide.contactName || nameOf(driverId) ? (
                  (firstRide.contactName ?? nameOf(driverId) ?? '').slice(0, 1)
                ) : (
                  <Icon name="car-bold" size={72} color="#fff" />
                )}
              </span>
              <span className="voiture__kid-name">{firstRide.contactName ?? nameOf(driverId) ?? t.auto.car}</span>
              <span className="voiture__kid-what">{firstRide.title}</span>
            </div>
          ) : (
            <EmptyState>{t.auto.toddlerNobody}</EmptyState>
          )}
        </div>
      </div>
    )
  }

  // ── Parent: the week grid + fast per-day editor ────────────────────────────────
  const weekLabel = `${formatDay(weekStart, lang)} – ${formatDay(addLocalDays(weekStart, 6), lang)}`
  const membersOut = car?.membersOut ?? []

  return (
    <div className="scene voiture" aria-label={t.auto.weekTitle}>
      <SceneHead title={t.auto.weekTitle} subtitle={carName(primary?.id) ?? t.auto.car} onClose={close} />
      <div className="scene__body voiture__body">
        <p className="voiture__hint mono">{t.auto.weekHint}</p>

        <div className="voiture__weeknav">
          <button type="button" className="btn btn--ghost" onClick={() => setWeekStart((w) => addLocalDays(w, -7))} aria-label={t.auto.prevWeek}>
            ◀
          </button>
          <span className="voiture__weeklabel mono">{weekLabel}</span>
          <button type="button" className="btn btn--ghost" onClick={() => setWeekStart((w) => addLocalDays(w, 7))} aria-label={t.auto.nextWeek}>
            ▶
          </button>
          <button type="button" className="btn btn--ghost mono" onClick={() => setWeekStart(startOfWeek(today))}>
            {t.auto.thisWeek}
          </button>
        </div>

        {/* Today's presence — who's away right now (derived from the schedule). */}
        {car && car.today >= weekStart && car.today < weekEnd && (
          <p className="voiture__presence mono">
            {membersOut.length === 0
              ? t.auto.everyoneHome
              : `${t.auto.whosHome}: ${members.filter((m) => !membersOut.includes(m.id)).map((m) => m.display_name).join(', ') || t.auto.nobodyHome}`}
          </p>
        )}

        <div className="voiture__week">
          {(car?.days ?? []).map((d) => (
            <DayRow
              key={d.day}
              d={d}
              isToday={d.day === today}
              lang={lang}
              t={t}
              members={members}
              nameOf={nameOf}
              colorOf={colorOf}
              carColor={carColor}
              hhmm={hhmm}
              driverLine={driverLine}
              editing={editDay === d.day}
              onEdit={() => setEditDay(editDay === d.day ? null : d.day)}
              onSave={(b) => saveDay(d.day, b)}
              onClear={() => clearDay(d.day)}
              onAddRide={() => nav(`/event/new?date=${d.day}`)}
            />
          ))}
          {!car && <p className="loading mono">{t.common.loading}</p>}
        </div>

        <div className="voiture__weekactions">
          <button type="button" className="btn btn--ghost mono" onClick={copyLastWeek}>
            {t.auto.copyLastWeek}
          </button>
          <button type="button" className="btn btn--ghost mono" onClick={resetWeek}>
            {t.auto.resetWeek}
          </button>
        </div>
      </div>
    </div>
  )
}

// One day in the week — its resolved car windows + rides, tap to adjust. Reads at a
// glance: a BUSY day (the car is claimed) gets a coloured accent + the holder's face
// and window; a FREE day stays muted with a calm « Libre ». Drivers + passengers show
// as faces (colour = who), never just text — "qui a l'auto" answered visually.
function DayRow({
  d,
  isToday,
  lang,
  t,
  members,
  nameOf,
  colorOf,
  carColor,
  hhmm,
  driverLine,
  editing,
  onEdit,
  onSave,
  onClear,
  onAddRide,
}: {
  d: CarDay
  isToday: boolean
  lang: 'fr' | 'en'
  t: ReturnType<typeof useT>
  members: Member[]
  nameOf: (id: string | null | undefined) => string | undefined
  colorOf: (id: string | null | undefined) => string | undefined
  carColor: string
  hhmm: (at: number) => string
  driverLine: (r: CarRide) => string
  editing: boolean
  onEdit: () => void
  onSave: (b: { free: boolean; holderId?: string | null; startMin?: number; endMin?: number }) => void
  onClear: () => void
  onAddRide: () => void
}) {
  const memberOf = (id: string | null | undefined) => (id ? members.find((m) => m.id === id) : undefined)
  const busy = d.spans.length > 0
  // The face(s) shown on a busy day = the distinct people holding the car (most days
  // it's one). The accent colour follows the first holder, else the car's own colour.
  const holderIds = [...new Set(d.spans.map((s) => s.holderId).filter((x): x is string => !!x))]
  const tint = colorOf(holderIds[0]) ?? carColor

  return (
    <div
      className={`voiture__day${isToday ? ' voiture__day--today' : ''}${busy ? ' voiture__day--busy' : ' voiture__day--free'}`}
      style={busy ? ({ '--day-tint': tint } as CSSProperties) : undefined}
    >
      <button type="button" className="voiture__day-head" onClick={onEdit} aria-expanded={editing}>
        <span className="voiture__day-date">
          <span className="voiture__day-dow">{formatWeekday(d.day, lang)}</span>
          <span className="voiture__day-num mono">{formatDay(d.day, lang)}</span>
        </span>
        <span className="voiture__day-main">
          {busy ? (
            <>
              <span className="voiture__day-holders">
                {holderIds.length > 0 ? (
                  holderIds.map((id) => {
                    const m = memberOf(id)
                    return (
                      <span key={id} className="voiture__day-holder">
                        <Avatar kind={m?.avatar_kind} photo={m?.avatar_ref} colour={m?.colour ?? tint} name={m?.display_name} size={30} />
                        <span className="voiture__day-holdername">{nameOf(id) ?? d.spans.find((s) => s.holderId === id)?.label ?? ''}</span>
                      </span>
                    )
                  })
                ) : (
                  <span className="voiture__day-holder">
                    <span className="voiture__day-caricon" style={{ color: tint }} aria-hidden="true">
                      <Icon name="car-bold" size={22} />
                    </span>
                    <span className="voiture__day-holdername">{d.spans[0]?.label ?? t.auto.car}</span>
                  </span>
                )}
              </span>
              <span className="voiture__day-window mono">{d.spans.map((s) => `${hhmm(s.start)}–${hhmm(s.end)}`).join(' · ')}</span>
            </>
          ) : (
            <span className="voiture__day-free-label">{t.auto.freeAllDay}</span>
          )}
        </span>
        {d.override && <span className="voiture__day-badge mono">{t.auto.adjusted}</span>}
      </button>

      {d.rides.length > 0 && (
        <ul className="voiture__rides">
          {d.rides.map((r) => {
            const driver = memberOf(r.memberId)
            return (
              <li key={r.id} className={`voiture__ride${r.conflict ? ' voiture__ride--conflict' : ''}`}>
                <span className="voiture__ride-when mono">{r.allDay ? '' : hhmm(r.at)}</span>
                {driver ? (
                  <Avatar kind={driver.avatar_kind} photo={driver.avatar_ref} colour={driver.colour} name={driver.display_name} size={26} />
                ) : (
                  <span className="voiture__day-caricon voiture__day-caricon--ride" style={{ color: carColor }} aria-hidden="true">
                    <Icon name="car-bold" size={18} />
                  </span>
                )}
                <span className="voiture__ride-what">
                  <span className="voiture__ride-title">{r.title}</span>
                  {driverLine(r) ? <span className="voiture__ride-driver">{driverLine(r)}</span> : null}
                </span>
                {r.passengers.length > 0 && (
                  <span className="voiture__pax" aria-hidden="true">
                    {r.passengers.map((pid) => {
                      const p = memberOf(pid)
                      return <Avatar key={pid} kind={p?.avatar_kind} photo={p?.avatar_ref} colour={p?.colour ?? '#888'} name={p?.display_name} size={22} />
                    })}
                  </span>
                )}
                {r.conflict && (
                  <span className="voiture__conflict" title={t.auto.conflict} aria-label={t.auto.conflict}>
                    <Icon name="warning-bold" size={17} />
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <DayEditor d={d} members={members} t={t} onSave={onSave} onClear={onClear} onAddRide={onAddRide} />
      )}
    </div>
  )
}

// The fast per-day editor — who has the car + when, or "stays home", or back to the
// template. Pre-filled from the current override / first resolved window.
function DayEditor({
  d,
  members,
  t,
  onSave,
  onClear,
  onAddRide,
}: {
  d: CarDay
  members: Member[]
  t: ReturnType<typeof useT>
  onSave: (b: { free: boolean; holderId?: string | null; startMin?: number; endMin?: number }) => void
  onClear: () => void
  onAddRide: () => void
}) {
  // Wall-clock minutes of an instant via the browser (the kiosk runs in the
  // household tz), so the editor pre-fills the real start/end the spans show.
  const minutesOfDay = (at: number): number => {
    const dt = new Date(at * 1000)
    return dt.getHours() * 60 + dt.getMinutes()
  }
  const seedSpan = d.spans[0]
  const [holderId, setHolderId] = useState<string | null>(d.override?.holderId ?? seedSpan?.holderId ?? null)
  const [start, setStart] = useState(minToHHMM(d.override?.startMin ?? (seedSpan ? minutesOfDay(seedSpan.start) : 8 * 60)))
  const [end, setEnd] = useState(minToHHMM(d.override?.endMin ?? (seedSpan ? minutesOfDay(seedSpan.end) : 17 * 60)))

  const save = () => {
    const s = hhmmToMin(start)
    const e = hhmmToMin(end)
    if (s == null || e == null || e <= s) return
    onSave({ free: false, holderId, startMin: s, endMin: e })
  }

  return (
    <div className="voiture__editor">
      <p className="mono voiture__editor-label">{t.auto.whoHasCar}</p>
      <div className="voiture__faces">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`voiture__facebtn${holderId === m.id ? ' is-active' : ''}`}
            style={holderId === m.id ? { borderColor: m.colour } : undefined}
            onClick={() => setHolderId(holderId === m.id ? null : m.id)}
          >
            <span className="voiture__face" style={{ background: m.colour }}>{m.display_name.slice(0, 1)}</span>
            {m.display_name}
          </button>
        ))}
      </div>
      <div className="voiture__times mono">
        <label>{t.auto.from} <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>{t.auto.to} <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <div className="voiture__editor-actions">
        <button type="button" className="btn" onClick={save}>{t.auto.saveDay}</button>
        <button type="button" className="btn btn--ghost mono" onClick={() => onSave({ free: true })}>{t.auto.staysHome}</button>
        {d.override && <button type="button" className="btn btn--ghost mono" onClick={onClear}>{t.auto.resetWeek}</button>}
        <button type="button" className="btn btn--ghost mono" onClick={onAddRide}>＋ {t.auto.addRide}</button>
      </div>
    </div>
  )
}
