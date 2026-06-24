import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { useProfile } from '../../lib/profile'
import { useBoardData, useTagColors } from '../../lib/queryHooks'
import { useDayWindow, type DayItems } from '../../lib/useDayWindow'
import { useMealPrefs } from '../../lib/mealPrefs'
import { todayLocalDay, addLocalDays } from '../../lib/localDay'
import { formatTime, formatDayLong } from '../../lib/format'
import { type Weather, type DayOutlook } from '../../lib/weather'
import { Section } from './Act'
import { DaySection } from './DaySection'
import { DayHeroes } from './DayHeroes'
import { useWonder } from './ApodFrame'
import { CercleBirthdays } from '../cercle/CercleBirthdays'
import { AutoCard } from './AutoCard'
import { SubTabs } from '../SubTabs'
import { Disclosure } from '../Disclosure'
import { EmptyState } from '../EmptyState'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildMeal, type DetailCtx } from '../detail/adapters'
import { useRecipeForMeal } from '../kitchen/mealLookup'
import { type DayMealRow } from './types'

// « La journée » — the unified, curated board view (the prototype that will, once
// loved, replace Maintenant + Par-personne and fold Moments). The global face lens
// beside the toggle (Maisonnée or a person) filters everything; two scopes render
// through the SAME polished pieces the other views use — no thinner re-rolls:
//   • « Maintenant » — what's up next + every ACTION needed today AND tomorrow
//     (corvées, entretien, à-compléter) through `DaySection actionsOnly`, reusing the
//     board's cards + detail peek.
//   • « Aujourd'hui » — the full day: the shared `DayHeroes` (Grille's « Ce soir »
//     supper + weather-photo cards) on top, then the agenda + checklist, with tomorrow
//     a tap away behind « voir plus ».
// The old 5 views stay untouched as reference. « À régler » isn't repeated here — the
// compact chip above the view (Board.tsx) already carries it.
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
  const memberName = (id: string | null | undefined) =>
    (id && members.find((m) => m.id === id)?.display_name) || undefined

  const today = todayLocalDay()
  const tomorrow = addLocalDays(today, 1)
  const win = useDayWindow(today, addLocalDays(today, 2))

  // The shared detail peek (same as Grille): a tapped row/meal opens the picture +
  // date + smart actions sheet. DaySection wires its own; DayHeroes' supper tap is ours.
  const detail = useEntityDetail()
  const recipeFor = useRecipeForMeal()
  const tagColors = useTagColors()
  const detailCtx: DetailCtx = { t, lang, members, recipeFor, tagColors }

  // Per-slot supper colour + show/hide (Réglages ▸ Repas) — same source as Grille's hero.
  const mealPrefs = useMealPrefs()
  const supperColor = mealPrefs.color('supper')

  const wx = useQuery({
    queryKey: ['weather'],
    queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null }>('weather'),
    staleTime: 15 * 60 * 1000,
  }).data
  const weather = wx?.weather ?? null
  // The daily-wonder photo backdrop + shuffle, same as the Grille weather card.
  const { wonder, shuffle: shuffleWonder } = useWonder()

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

  // Tonight's supper(s) for the shared hero — household (board payload), gated by the
  // souper show/hide toggle exactly like Grille.
  const suppers: DayMealRow[] = mealPrefs.isVisible('supper') ? board?.tonightMeals ?? [] : []
  const cookLine = (m: DayMealRow) =>
    memberName(m.cook_member_id) ? `${memberName(m.cook_member_id)} ${t.board.cooks}` : undefined
  // The supper tap opens the same detail peek Grille uses (read peek — the leftover/
  // remove writes stay on the full Grille view).
  const openSupper = (m: DayMealRow) =>
    detail.open(buildMeal(m, detailCtx, { color: supperColor, slotLabel: t.board.tonight, daySec: today }))

  // Whether a day has any ACTION to do (chores + entretien) — drives the empty line in
  // the Maintenant scope (todos render their own add row regardless).
  const hasActions = (items: DayItems) => items.chores.length + items.home.length > 0

  return (
    <div className="lajournee">
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
          {/* Prochainement — the next timed thing today, the anchor of « Maintenant ». */}
          <Section label={t.boardView.next}>
            {nextUp ? (
              <div className="lajournee__focus">
                <span className="lajournee__focus-when mono">{formatTime(nextUp.at, lang)}</span>
                <span className="lajournee__focus-title">{nextUp.title}</span>
              </div>
            ) : (
              <EmptyState tone="calm">{t.boardView.nothingNext}</EmptyState>
            )}
          </Section>

          {/* Tout ce qu'il y a à faire — aujourd'hui ET demain — par les MÊMES cartes que
              le reste du board (corvées, entretien, à-compléter), via DaySection
              actionsOnly. Pas de repas/événements ici : c'est la liste des actions. */}
          <Section label={capitalize(formatDayLong(today, lang))}>
            <DaySection day={today} items={todayItems} members={members} actionsOnly showTodos />
            {!hasActions(todayItems) && <EmptyState tone="calm">{t.board.todayClear}</EmptyState>}
          </Section>
          <Section label={capitalize(formatDayLong(tomorrow, lang))}>
            <DaySection day={tomorrow} items={tomorrowItems} members={members} actionsOnly showTodos todosHideWhenEmpty />
            {!hasActions(tomorrowItems) && <EmptyState tone="calm">{t.board.tomorrowClear}</EmptyState>}
          </Section>
        </>
      ) : (
        <>
          {/* Aujourd'hui — the SAME polished heroes as Grille (« Ce soir » supper +
              weather-photo wonder card), then the full day. */}
          <DayHeroes
            suppers={suppers}
            supperColor={supperColor!}
            onOpenMeal={openSupper}
            cookLine={cookLine}
            weather={weather}
            wonder={wonder}
            onShuffleWonder={shuffleWonder}
          />

          {/* The full day through the shared DaySection (agenda + the « À compléter »
              checklist + the fridge note). */}
          <Section label={capitalize(formatDayLong(today, lang))}>
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
