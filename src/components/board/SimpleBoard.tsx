import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { useLang, useT } from '../../i18n'
import { Sayable } from '../BigTiles'
import { Notes } from './Notes'
import { formatTime } from '../../lib/format'
import { pictoFor } from '../../lib/picto'
import { useMealPrefs } from '../../lib/mealPrefs'
import { heroCardLabel } from '../../lib/mealSlots'
import type { BoardModel } from '../../lib/boardModel'
import type { BoardData } from './types'

// « Simple » board (bmad/08 A-1) — the post-reader/grandma glance: FOUR calm
// zones instead of the parent's bento. Three giant door-tiles (Aujourd'hui →
// the Moments recap, Souper → La cuisine, La liste → Liste) each answer their
// question right on the tile (next thing today, tonight's supper, the first few
// list items), and the fridge notes render inline as the fourth zone — a note
// IS its content, there's nothing deeper to open. Reuses the toddler's
// .bigtiles/.bigtile cut-paper cards + Sayable, but tiles are ONE-tap doors
// (real words, a capable reader — no hear-first arming), tinted with their hub
// section's colour so the door matches the tab it opens. `data-speak` carries
// the clean summary for the tap-to-hear long-press (A-2).
export function SimpleBoard({
  data,
  model,
  greet,
}: {
  data: BoardData | undefined
  // The ONE board view-model (C-12, lib/boardModel) — nextUp/today events/tonight's
  // supper are model-owned; this lens no longer re-derives them on its own clock.
  model: BoardModel
  greet: string
}) {
  const t = useT()
  const { lang } = useLang()
  // Lens-side only: whether the supper tile appears at all is a per-device card
  // decision (Réglages ▸ Repas), not model-owned — the model already gates
  // `meals.tonight` by this same visibility.
  const mealPrefs = useMealPrefs()

  if (!data) {
    return (
      <main className="kid__main today-simple">
        <p className="loading mono">{t.common.loading}</p>
      </main>
    )
  }

  // Next still-to-come timed event today (model's nextUp — same 30-min grace),
  // else an all-day thing, else a calm "nothing planned".
  const next = model.nextUp
  const allDay = model.today.events.find((e) => !!e.all_day)
  const todaySub = next ? `${formatTime(next.start_at, lang)} · ${next.title}` : allDay ? allDay.title : t.monthView.empty
  // Tonight's supper headline — already gated by the household's slot
  // visibility inside the model (souper toggled off → null, same as before).
  const tonight = model.meals.tonight
  // The list glances its first few items by NAME (never a count — a name is
  // what a glance actually wants, and calm never scores the list).
  const items = data.list
  const listSub =
    items.length === 0
      ? t.board.listEmpty
      : items.slice(0, 3).map((i) => i.text).join(' · ') + (items.length > 3 ? ' …' : '')

  // Door tiles wear their hub section's nav colour (HubLayout TABS) so the tile
  // visually matches the tab it opens.
  const tiles = [
    { key: 'today', to: '/moment?scope=tonight', icon: '📅', tint: '#D9842A', label: t.board.today, sub: todaySub },
    // The hero slot as the model resolved it (from the board payload), so the tile and
    // its meal always describe the same slot — and it's NAMED after that slot, so a
    // household whose headline is the dîner doesn't read « Ce soir » above a lunch.
    ...(mealPrefs.isVisible(model.meals.hero)
      ? [{ key: 'supper', to: '/kitchen', icon: pictoFor(tonight?.title ?? '', '🍽'), tint: '#C2563A', label: heroCardLabel(model.meals.hero, t), sub: tonight?.title ?? t.board.nothingTonight }]
      : []),
    { key: 'list', to: '/liste', icon: '🛒', tint: '#5891AC', label: t.board.list, sub: listSub },
  ]

  return (
    <main className="kid__main today-simple">
      {/* Same personal greeting as the other lenses; tap to hear it. */}
      <Sayable className="today-simple__greet" text={greet} />
      {/* D-17: the school/congé qualifier — silent almost every day BY DESIGN
          (see lib/year.schoolDayKind), plain readable text like the rest of the
          Simple lens (a capable reader, unlike the toddler Sayable). */}
      {model.tomorrowSchoolKind && (
        <p className="today-simple__school mono">
          {model.tomorrowSchoolKind === 'school' ? `🎒 ${t.board.tomorrowSchool}` : `🏖️ ${t.board.tomorrowConge}`}
        </p>
      )}
      <div className="bigtiles today-simple__tiles">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            to={tile.to}
            className="bigtile"
            style={{ '--tile-tint': tile.tint } as CSSProperties}
            data-speak={`${tile.label}. ${tile.sub}`}
          >
            <span className="bigtile__icon" aria-hidden="true">
              {tile.icon}
            </span>
            <span className="bigtile__label">{tile.label}</span>
            <span className="bigtile__sub mono">{tile.sub}</span>
          </Link>
        ))}
      </div>
      {/* The fourth zone: fridge notes inline — full capability, so a grandma
          can read, play or clear a note exactly like the parent board. */}
      {data.notes.length > 0 && (
        <section className="today-kid__section">
          <Sayable className="today-kid__h" text={t.board.notes} />
          <Notes notes={data.notes} members={data.members} />
        </section>
      )}
    </main>
  )
}
