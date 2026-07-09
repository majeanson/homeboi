import { Link } from 'react-router-dom'
import { useLang, useT } from '../../i18n'
import { BigTiles, Sayable, type Tile } from '../BigTiles'
import { Icon, InlineIcon } from '../Icon'
import { useSpeak } from '../../lib/speak'
import { pictoFor } from '../../lib/picto'
import { formatTime } from '../../lib/format'
import { useMealPrefs } from '../../lib/mealPrefs'
import { useBoardCards, isCardVisible } from '../../lib/boardCards'
import { slotLabel as slotLabelFor } from '../../lib/mealSlots'
import { weatherIcon, weatherTint, weatherTip, type Weather } from '../../lib/weather'
import type { BoardModel } from '../../lib/boardModel'
import type { Todo } from '../../lib/todos'
import { colorOf, type BoardData, type EventRow, type MealRow } from './types'
import { BoardCanvas } from './BoardCanvas'
import { Notes } from './Notes'
import { DayNote } from './DayNote'
import { DayTimeline } from '../jouer/DayTimeline'
import { PhotoFrame } from './PhotoFrame'
import { WonderFrame } from './ApodFrame'

// Toddler lens on the SAME board data as the parent — same content, kid UI:
// big read-aloud tiles, picture-first, member colour says whose thing it is.
// Heroes (meals + weather) sit on top; then Today / Demain / chores / list /
// photos, mirroring the parent board so nothing is missing for a pre-reader.
// Extracted from Board.tsx (C-12 6/6, bmad/10, a PURE move — no behaviour
// change). This is the ONLY code a locked kiosk (`?kid=1`, the kid one-way
// door — no in-app escape) ever runs, so it stays self-contained: everything
// it needs rides in via props or its own lens-local hooks, never a hidden
// re-derivation of what `useBoardModel` already decided.
export function ToddlerBoard({
  data,
  model,
  greet,
  weather,
  openTodos,
}: {
  data: BoardData | undefined
  // The ONE board view-model (C-12, lib/boardModel) — dayClear/kidAllClear,
  // meal visibility, the fêtes merge, the face lens: all model-owned. This
  // lens never re-derives them on its own clock.
  model: BoardModel
  greet: string
  weather: Weather | null
  // À compléter (todos) open items — the board's own light poll (lib/todos),
  // separate from the model; passed through so this lens doesn't re-fetch.
  openTodos: Todo[]
}) {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  // Per-slot meal colour + visibility (Réglages ▸ Repas) — lens-local, like
  // SimpleBoard's own `useMealPrefs()` call: whether a hero/tile SHOWS is a
  // per-device card decision, not model-owned (the model already gates the
  // meal arrays themselves by this same visibility).
  const mealPrefs = useMealPrefs()
  // Which Grille cards this device shows (Réglages ▸ Affichage ▸ Disposition) —
  // only `fil` is consulted here, for « Le fil du jour » toddler section.
  const boardCards = useBoardCards()

  const memberColor = (id: string | null) => colorOf(data?.members ?? [], id)
  const slotLabel = (slot: string) => slotLabelFor(slot, t)
  const tip = weatherTip(weather)

  const todayEvents = model.today.events
  const todayChores = model.today.chores
  const todayTodos = model.today.todos
  const tomorrowEvents = model.tomorrow.events
  const otherMeals = model.meals.otherToday
  const otherTomorrowMeals = model.meals.otherTomorrow
  const leftovers = model.leftovers

  const eventTiles = (rows: EventRow[]): Tile[] =>
    rows.map((e) => ({
      key: e.id,
      // Draw the event's own picture (school/swim/birthday…) so a pre-reader can
      // tell things apart; a derived fête brings its own emoji (⚜️ 🎃 🎄);
      // fall back to a pin when nothing matches.
      icon: e.emoji ?? pictoFor(e.title, '📌'),
      label: e.title,
      // D-21: the flagged-chore evening announce reads « Ce soir » here too — a
      // Sayable tile, same tap-to-hear as every other kid tile (no bespoke wiring).
      sub: e.announce
        ? t.board.binTonight
        : e.holiday
        ? e.ferie ? t.board.holidayOff : t.board.holidayTag
        : e.all_day ? t.board.allDay : formatTime(e.start_at, lang),
      narration: e.title,
      color: memberColor(e.member_id) ?? undefined,
    }))

  const mealHero = (meal: MealRow | null, key: 'tonight' | 'tomorrow') =>
    meal ? (
      <button
        type="button"
        className="today-hero today-hero--meal"
        onClick={() => speak(`${t.board[key]}: ${meal.title}`)}
        aria-label={`${t.board[key]}: ${meal.title}`}
      >
        <span className="today-hero__icon" aria-hidden="true">{pictoFor(meal.title, '🍽')}</span>
        <span className="today-hero__label">{meal.title}</span>
        {/* A picture hint beside the word, so "tonight vs tomorrow" doesn't
            hang on reading alone (NFR-KID-2 soft-reading). */}
        <span className="today-hero__sub mono">
          <InlineIcon
            name={key === 'tonight' ? 'moon-stars-bold' : 'sun-horizon-bold'}
            size={14}
            color={key === 'tonight' ? 'var(--berry-deep)' : 'var(--marigold-deep)'}
          />{' '}
          {t.board[key]}
        </span>
      </button>
    ) : null

  // Tapping the weather also SPEAKS the dressing tip ("mets un manteau") —
  // that's the actionable part for a pre-schooler getting ready. Audio only:
  // the picture + temperature stay the calm visual.
  const weatherHero = weather ? (
    <button
      type="button"
      className="today-hero today-hero--weather"
      onClick={() =>
        speak(`${t.weather[weather.bucket]}, ${weather.tempC}°.${tip ? ` ${t.weather.tip[tip]}` : ''}`)
      }
      aria-label={`${t.weather[weather.bucket]} ${weather.tempC}°`}
    >
      <span className="today-hero__icon" aria-hidden="true"><Icon name={weatherIcon(weather)} size={56} color={weatherTint(weather)} /></span>
      <span className="today-hero__label">{weather.tempC}°</span>
      <span className="today-hero__sub mono">{t.weather[weather.bucket]}</span>
    </button>
  ) : null

  const kidSection = (label: string, tiles: Tile[]) =>
    tiles.length > 0 ? (
      <section className="today-kid__section">
        <Sayable className="today-kid__h" text={label} />
        <BigTiles tiles={tiles} />
      </section>
    ) : null

  // Nothing planned anywhere today/tomorrow → the kid sections all collapse and
  // the board reads as a blank gap. Show one calm, tap-to-hear "all clear" line
  // instead, so an empty day still feels intentional to a pre-reader. Model-owned
  // (lib/boardModel) — a DIFFERENT, wider check than the parent's dayClear (decided,
  // bmad/10: weather/notes/tomorrow count here; see boardModel.ts).
  const kidAllClear = model.kidAllClear
  return (
    <main className="kid__main today-kid">
      <BoardCanvas weatherBucket={weather?.bucket} />
      {/* Greet the picked child by name — same personal touch the parent
          board gets. Generic when nobody's picked (shared wall). Tap to hear. */}
      <Sayable className="today-kid__greet" text={greet} />
      {!data ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : (
        <>
          <div className="today-kid__heroes">
            {/* Supper heroes follow the same show/hide as the parent board. */}
            {mealPrefs.isVisible('supper') && mealHero(data.tonight, 'tonight')}
            {mealPrefs.isVisible('supper') && mealHero(data.tomorrowMeal, 'tomorrow')}
            {weatherHero}
          </div>
          <Notes notes={data.notes ?? []} members={data.members} toddler />
          {/* A big, friendly door into "Mes dessins" — the kid's own drawing
              collection (draw new ones with handwriting lines / tracing / colour-in
              / stickers, and see everything they've kept). */}
          <div className="today-kid__doors">
            <Link to="/drawings" className="today-kid__draw">
              <span className="today-kid__draw-icn" aria-hidden="true">🎨</span>
              <span>{t.memo.galleryTitle}</span>
            </Link>
            {/* A big, friendly door into « Jouer » — the toddler play space (find-it,
                the day timeline, the birthday countdown). All hear-first, no score. */}
            <Link to="/jouer" className="today-kid__draw today-kid__play">
              <span className="today-kid__draw-icn" aria-hidden="true">🎲</span>
              <span>{t.play.door}</span>
            </Link>
          </div>
          {/* « Le fil du jour », toddler lens — the hear-first day SEQUENCE (matin →
              midi → soir → dodo) the play space uses, so a pre-reader gets the same
              "shape of the day" the parent ribbon gives. Honours the per-device 'fil'
              toggle (Réglages ▸ Affichage ▸ Disposition). */}
          {isCardVisible(boardCards, 'fil') && (
            <section className="today-kid__section">
              <Sayable className="today-kid__h" text={t.board.fil} />
              <DayTimeline />
            </section>
          )}
          {data.dayNote && <DayNote note={data.dayNote} members={data.members} toddler />}
          {/* Every meal planned for today, read-aloud — supper rides up in the
              heroes, so this lists the rest of the day's table. */}
          {kidSection(
            t.board.meals,
            otherMeals.map((m) => ({
              key: m.id,
              icon: pictoFor(m.title, '🍽'),
              label: m.title,
              sub: slotLabel(m.slot),
              narration: `${slotLabel(m.slot)}: ${m.title}`,
              color: memberColor(m.cook_member_id) ?? undefined,
            })),
          )}
          {/* Restants à finir — read-aloud reminder to eat leftovers first. A
              pre-reader just sees/hears them; finishing one is a parent action. */}
          {kidSection(
            t.kitchen.leftoversBoard,
            leftovers.map((l) => ({
              key: l.id,
              icon: pictoFor(l.title, '🍽'),
              label: l.title,
              sub: t.kitchen.leftoversTag,
              narration: l.title,
            })),
          )}
          {kidSection(t.board.today, eventTiles(todayEvents))}
          {/* Chores due today, as read-aloud tiles — whose turn rides in the sub. */}
          {kidSection(
            t.board.chores,
            todayChores.map((c) => ({
              key: c.id,
              icon: pictoFor(c.title, '🧹'),
              label: c.title,
              sub: c.who ?? undefined,
              narration: c.who ? `${c.title}. ${c.who}` : c.title,
              color: c.color ?? undefined,
            })),
          )}
          {/* « À faire » — read aloud too. Mirrors the parent board's ONE to-do card:
              the loose one-off tasks AND the checklists (« À compléter ») in a single
              section, so a pre-reader sees everything left to do in one place. */}
          {kidSection(t.board.todos, [
            ...todayTodos.map((c) => ({
              key: c.id,
              icon: pictoFor(c.title, '✅'),
              label: c.title,
              sub: c.who ?? undefined,
              narration: c.title,
              color: c.color ?? undefined,
            })),
            ...openTodos.map((td) => ({
              key: td.id,
              icon: pictoFor(td.title, '✅'),
              label: td.title,
              narration: td.title,
              color: memberColor(td.member_id) ?? undefined,
            })),
          ])}
          {data.tomorrowNote && (
            <DayNote note={data.tomorrowNote} members={data.members} label={t.board.prepTomorrow} toddler />
          )}
          {/* « Demain » follows the SAME parent meal rules (model.meals.otherTomorrow +
              tomorrowSupper, both mealPrefs-gated) — a hidden slot no longer leaks here
              and the souper (already the hero above) no longer repeats (bmad/10 C-12,
              decided bug-fix). kidAllClear above stays on the raw data — a DIFFERENT,
              deliberately wider "truly nothing" check (bmad/10 decided). */}
          {/* D-17: the school/congé qualifier — silent almost every day BY DESIGN
              (see lib/year.schoolDayKind); tap-to-hear, matching every other
              toddler-lens line. */}
          {model.tomorrowSchoolKind && (
            <Sayable
              className="today-kid__school"
              text={
                model.tomorrowSchoolKind === 'school'
                  ? `🎒 ${t.board.tomorrowSchool}`
                  : `🏖️ ${t.board.tomorrowConge}`
              }
            />
          )}
          {kidSection(t.board.tomorrow, [
            ...eventTiles(tomorrowEvents),
            ...otherTomorrowMeals.map((m) => ({
              key: m.id,
              icon: pictoFor(m.title, '🍽'),
              label: m.title,
              sub: slotLabel(m.slot),
              narration: `${slotLabel(m.slot)}: ${m.title}`,
              color: memberColor(m.cook_member_id) ?? undefined,
            })),
          ])}
          {kidAllClear && (
            <Sayable className="today-kid__clear" text={`🌤️ ${t.board.kidAllClear}`} />
          )}
          <PhotoFrame />
          {/* « Photo du jour » — a big tap-to-hear tile in the toddler lens. */}
          <WonderFrame />
        </>
      )}
    </main>
  )
}
