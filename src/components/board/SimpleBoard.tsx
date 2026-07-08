import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { useLang, useT } from '../../i18n'
import { Sayable } from '../BigTiles'
import { Notes } from './Notes'
import { formatTime } from '../../lib/format'
import { pictoFor } from '../../lib/picto'
import { useMealPrefs } from '../../lib/mealPrefs'
import { useNow } from '../../lib/itemLife'
import type { BoardData, EventRow } from './types'

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
  todayEvents,
  greet,
}: {
  data: BoardData | undefined
  // Already face-lens filtered by Board (same rows the parent board shows).
  todayEvents: EventRow[]
  greet: string
}) {
  const t = useT()
  const { lang } = useLang()
  const mealPrefs = useMealPrefs()
  // The shared minute clock, so "next up" rolls forward on a left-open tablet.
  const nowSec = Math.floor(useNow() / 1000)

  if (!data) {
    return (
      <main className="kid__main today-simple">
        <p className="loading mono">{t.common.loading}</p>
      </main>
    )
  }

  // Next still-to-come timed event today (same 30-min grace as the parent's
  // « Prochainement »), else an all-day thing, else a calm "nothing planned".
  const next = todayEvents
    .filter((e) => !e.all_day && e.start_at >= nowSec - 1800)
    .sort((a, b) => a.start_at - b.start_at)[0]
  const allDay = todayEvents.find((e) => !!e.all_day)
  const todaySub = next ? `${formatTime(next.start_at, lang)} · ${next.title}` : allDay ? allDay.title : t.monthView.empty
  // Tonight's supper headline, honouring the household's slot visibility —
  // souper toggled off drops the whole tile, same as the parent hero.
  const tonight = mealPrefs.isVisible('supper') ? data.tonight : null
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
    ...(mealPrefs.isVisible('supper')
      ? [{ key: 'supper', to: '/kitchen', icon: pictoFor(tonight?.title ?? '', '🍽'), tint: '#C2563A', label: t.board.tonight, sub: tonight?.title ?? t.board.nothingTonight }]
      : []),
    { key: 'list', to: '/liste', icon: '🛒', tint: '#5891AC', label: t.board.list, sub: listSub },
  ]

  return (
    <main className="kid__main today-simple">
      {/* Same personal greeting as the other lenses; tap to hear it. */}
      <Sayable className="today-simple__greet" text={greet} />
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
