import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { useProfile } from '../../lib/profile'
import { useBoardData } from '../../lib/queryHooks'
import { useDayWindow, type DayItems } from '../../lib/useDayWindow'
import { useARegler, frictionRow } from '../../lib/aRegler'
import { todayLocalDay, addLocalDays } from '../../lib/localDay'
import { formatTime, formatDayLong } from '../../lib/format'
import { type Weather, type DayOutlook, weatherIcon, weatherTint, weatherTip } from '../../lib/weather'
import { isGuest } from '../../lib/device'
import { Section } from './Act'
import { DaySection } from './DaySection'
import { MemberSwitcher } from './chrome'
import { CercleBirthdays } from '../cercle/CercleBirthdays'
import { AutoCard } from './AutoCard'
import { SubTabs } from '../SubTabs'
import { Disclosure } from '../Disclosure'
import { EmptyState } from '../EmptyState'
import { Icon, InlineIcon } from '../Icon'

// « La journée » — the unified, curated board view (the prototype that will, once
// loved, replace Maintenant + Par-personne and fold Moments). One face lens
// (Maisonnée or a person) filters everything; two scopes render through the shared
// DaySection: « Maintenant » (what's up next + « À régler ») and « Aujourd'hui » (the
// full day, with tomorrow a tap away). Curated: essentials up front, the rest behind
// « voir plus ». The old 5 views stay untouched as reference.
type Scope = 'now' | 'today'

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function LaJournee() {
  const t = useT()
  const { lang } = useLang()
  const { memberId } = useProfile()
  const [scope, setScope] = useState<Scope>('today')

  const board = useBoardData().data
  const members = board?.members ?? []
  const me = members.find((m) => m.id === memberId) ?? null
  const myName = me?.display_name ?? null

  const today = todayLocalDay()
  const tomorrow = addLocalDays(today, 1)
  const win = useDayWindow(today, addLocalDays(today, 2))

  const wx = useQuery({
    queryKey: ['weather'],
    queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null }>('weather'),
    staleTime: 15 * 60 * 1000,
  }).data
  const weather = wx?.weather ?? null
  const tip = weatherTip(weather)

  const frictions = useARegler(scope === 'now' && !isGuest()).data?.signals ?? []

  // The face lens, mirroring the board: a picked person sees THEIR items + the shared
  // (unassigned) ones; meals + the day note stay household. Chore `who` is a name in
  // the month payload, so match on the picked member's name.
  const lens = (items: DayItems): DayItems =>
    !memberId
      ? items
      : {
          ...items,
          events: items.events.filter((e) => e.member_id === memberId || e.member_id === null || e.work),
          chores: items.chores.filter((c) => !c.who || c.who === myName),
          home: items.home,
          todos: items.todos.filter((td) => td.member_id === memberId || td.member_id === null),
        }

  const todayItems = lens(win.dayItems(today))
  const tomorrowItems = lens(win.dayItems(tomorrow))

  // Next up: the soonest still-to-come timed event today (after the face lens).
  const nowSec = Math.floor(Date.now() / 1000)
  const nextUp = [...todayItems.events]
    .filter((e) => !e.all_day && !e.work && e.at >= nowSec - 1800)
    .sort((a, b) => a.at - b.at)[0]

  // Tonight's supper(s) for the hero line (household — board payload).
  const suppers = board?.tonightMeals ?? []

  const weatherChip = weather && (
    <div className="lajournee__wx" style={{ borderColor: weatherTint(weather) }}>
      <InlineIcon name={weatherIcon(weather)} size={28} color={weatherTint(weather)} />
      <span className="lajournee__wx-temp">{Math.round(weather.tempC)}°</span>
      <span className="lajournee__wx-text">
        <span>{t.weather[weather.bucket]}</span>
        {tip && <span className="mono lajournee__wx-tip">{t.weather.tip[tip]}</span>}
      </span>
    </div>
  )

  return (
    <div className="lajournee">
      {/* The face lens — Maisonnée or a person — filters every scope below. */}
      {members.length > 0 && <MemberSwitcher members={members} t={t} />}

      <SubTabs
        options={[
          { key: 'now', label: t.boardView.next, icon: 'clock-bold' },
          { key: 'today', label: t.board.today, icon: 'sun-bold' },
        ]}
        value={scope}
        onSelect={(k) => setScope(k as Scope)}
        ariaLabel={t.boardView.label}
      />

      {!board ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : scope === 'now' ? (
        <>
          {/* « À régler » first — the few cross-domain frictions worth attention. */}
          {frictions.length > 0 && (
            <Section label={t.aRegler.title}>
              {frictions.map((f) => {
                const r = frictionRow(f, t)
                return (
                  <Link key={f.key} to={f.href} className="a-regler__row">
                    <Icon name={r.icon} size={16} /> <span>{r.text}</span>
                  </Link>
                )
              })}
            </Section>
          )}

          {/* Prochainement — the next thing up, then tonight's supper as the anchor. */}
          <Section label={t.boardView.next}>
            {nextUp ? (
              <div className="lajournee__focus">
                <span className="lajournee__focus-when mono">{formatTime(nextUp.at, lang)}</span>
                <span className="lajournee__focus-title">{nextUp.title}</span>
              </div>
            ) : (
              <EmptyState tone="calm">{t.boardView.nothingNext}</EmptyState>
            )}
            {suppers.map((m) => (
              <div key={m.id} className="lajournee__supper">
                <InlineIcon name="fork-knife-bold" size={15} /> {m.title}
              </div>
            ))}
          </Section>
          {weatherChip}
        </>
      ) : (
        <>
          {weatherChip}
          {/* Aujourd'hui — the full day through the shared DaySection (agenda + the
              « À compléter » checklist + the fridge note). */}
          <Section label={capitalize(formatDayLong(today, lang))}>
            {suppers.length > 0 && (
              <div className="lajournee__supper lajournee__supper--hero">
                <InlineIcon name="fork-knife-bold" size={16} /> {suppers.map((m) => m.title).join(' · ')}
              </div>
            )}
            <DaySection day={today} items={todayItems} members={members} showTodos showNote />
          </Section>

          {/* Demain — a tap away (curated: secondary, behind « voir plus »). */}
          <Disclosure label={capitalize(formatDayLong(tomorrow, lang))} className="lajournee__more">
            <DaySection day={tomorrow} items={tomorrowItems} members={members} showTodos todosHideWhenEmpty showNote />
          </Disclosure>

          {/* L'auto + birthdays ride consistently below, like the other parent views. */}
          <AutoCard />
          <CercleBirthdays />
        </>
      )}
    </div>
  )
}
