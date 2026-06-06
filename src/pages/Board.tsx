import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BigTiles, type Tile } from '../components/BigTiles'
import { Icon } from '../components/Icon'
import { CATS, TOD_ICON, type CatKey } from '../lib/cats'
import { tintInk } from '../lib/colors'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSpeak } from '../lib/speak'
import { timeOfDay } from '../lib/timeofday'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { weatherEmoji, type Weather } from '../lib/weather'
import { imgUrl } from '../lib/image'
import { formatClock, formatDay, formatTime } from '../lib/format'

// The wall board. Polls the whole board in one read on an interval. ZERO AI on
// this path. Tolerates wifi loss: a failed poll keeps the last good frame and
// flips a "showing cache" stamp instead of blanking. The day's list empties
// and stays empty — no counters, no score for clearing it.
interface Member { id: string; display_name: string; colour: string; is_child: number }
interface EventRow { id: string; title: string; start_at: number; all_day: number; member_id: string | null }
interface ListRow { id: string; text: string; source: string }
interface Helper { name: string | null; role: string }
interface ChoreRow { id: string; title: string; rotation_json: string; current_idx: number; last_done_at: number | null; color?: string; helpers?: Helper[] }
interface MealRow { id: string; title: string; cook_member_id: string | null }
interface BoardData {
  syncedAt: number
  scope: string
  members: Member[]
  today: EventRow[]
  tomorrow: EventRow[]
  upcoming: EventRow[]
  tonight: MealRow | null
  tomorrowMeal: MealRow | null
  list: ListRow[]
  chores: ChoreRow[]
}

const BOARD_KEY = ['board']

export function Board() {
  const t = useT()
  const { lang } = useLang()
  const { audience } = useAudience()
  const speak = useSpeak()
  const [clock, setClock] = useState(() => formatClock(lang, Date.now()))

  // The whole board in one live read (see `live` in lib/query: polls + refetches
  // on focus so another phone's change lands here within a tick). TanStack keeps
  // the last good frame when a poll fails, so on wifi loss we keep rendering it
  // and just flip the "offline" stamp. retry:false overrides the default → the
  // stale stamp appears promptly and the next poll recovers.
  const { data, error, isError } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<BoardData>('board'),
    ...live,
    retry: false,
  })
  const unauth = isUnauthorized(error)
  const stale = isError && !unauth && !!data

  // Weather is its own slow poll (15 min) off the render-critical board read, and
  // resolves to null when there's no postal / upstream is down → the chip hides.
  const FIFTEEN_MIN = 15 * 60 * 1000
  const { data: wx } = useQuery({
    queryKey: ['weather'],
    queryFn: () => api<{ weather: Weather | null }>('weather'),
    refetchInterval: FIFTEEN_MIN,
    staleTime: FIFTEEN_MIN,
  })
  const weather = wx?.weather ?? null

  useEffect(() => {
    const c = setInterval(() => setClock(formatClock(lang, Date.now())), 30000)
    return () => clearInterval(c)
  }, [lang])

  const memberName = (id: string | null) => data?.members.find((m) => m.id === id)?.display_name ?? null
  const memberColor = (id: string | null) => data?.members.find((m) => m.id === id)?.colour

  if (unauth) {
    return (
      <main className="narrow">
        <p className="lead">{t.pair.lead}</p>
        <Link to="/pair" className="btn btn--primary">
          {t.home.ctaPair}
        </Link>
      </main>
    )
  }

  // Toddler lens on the SAME board data as the parent — same content, kid UI:
  // big read-aloud tiles, picture-first, member colour says whose thing it is.
  // Heroes (meals + weather) sit on top; then Today / Demain / chores / list /
  // photos, mirroring the parent board so nothing is missing for a pre-reader.
  const eventTiles = (rows: EventRow[]): Tile[] =>
    rows.map((e) => ({
      key: e.id,
      icon: '📌',
      label: e.title,
      sub: e.all_day ? t.board.allDay : formatTime(e.start_at, lang),
      narration: e.title,
      color: memberColor(e.member_id) ?? undefined,
    }))

  if (audience === 'toddler') {
    const tod = timeOfDay(Date.now())

    const mealHero = (meal: MealRow | null, key: 'tonight' | 'tomorrow') =>
      meal ? (
        <button
          type="button"
          className="today-hero"
          onClick={() => speak(`${t.board[key]}: ${meal.title}`)}
          aria-label={`${t.board[key]}: ${meal.title}`}
        >
          <span className="today-hero__icon" aria-hidden="true">🍽</span>
          <span className="today-hero__label">{meal.title}</span>
          <span className="today-hero__sub mono">{t.board[key]}</span>
        </button>
      ) : null

    const weatherHero = weather ? (
      <button
        type="button"
        className="today-hero"
        onClick={() => speak(`${t.weather[weather.bucket]}, ${weather.tempC}°`)}
        aria-label={`${t.weather[weather.bucket]} ${weather.tempC}°`}
      >
        <span className="today-hero__icon" aria-hidden="true">{weatherEmoji(weather)}</span>
        <span className="today-hero__label">{weather.tempC}°</span>
        <span className="today-hero__sub mono">{t.weather[weather.bucket]}</span>
      </button>
    ) : null

    const kidSection = (label: string, tiles: Tile[]) =>
      tiles.length > 0 ? (
        <section className="today-kid__section">
          <h2 className="today-kid__h">{label}</h2>
          <BigTiles tiles={tiles} />
        </section>
      ) : null

    return (
      <main className="kid__main today-kid">
        <p className="today-kid__greet">{t.today[tod]}</p>
        {!data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : (
          <>
            <div className="today-kid__heroes">
              {mealHero(data.tonight, 'tonight')}
              {mealHero(data.tomorrowMeal, 'tomorrow')}
              {weatherHero}
            </div>
            {kidSection(t.board.today, eventTiles(data.today))}
            {kidSection(t.board.tomorrow, eventTiles(data.tomorrow))}
            <PhotoFrame />
          </>
        )}
      </main>
    )
  }

  // Parent board, Pip "Today" layout: a handwritten tag + greeting, an "Up next"
  // now-card (tonight's supper), then a gentle grouped timeline of colour-coded
  // activity cards. Same data + writes as before — just the calm Pip surface.
  const tod = timeOfDay(Date.now())
  const eventAct = (e: EventRow) => (
    <Act
      key={e.id}
      cat="event"
      title={e.title}
      when={e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
      who={memberName(e.member_id) ?? undefined}
      color={memberColor(e.member_id) ?? undefined}
    />
  )
  const cookLine = (m: MealRow) =>
    memberName(m.cook_member_id) ? `${memberName(m.cook_member_id)} ${t.board.cooks}` : undefined

  return (
    <main className="board-wall">
      <div className="app-head">
        <div>
          <div className="hand-tag">{t.board.today}</div>
          <h1 className="greet">{t.today[tod]}</h1>
          <div className="subgreet">
            {formatDay(Math.floor(Date.now() / 1000), lang)} · {clock}
            {weather && (
              <span className="weather-chip" aria-label={`${t.weather[weather.bucket]} ${weather.tempC}°`}>
                {' '}
                · <span aria-hidden="true">{weatherEmoji(weather)}</span> {weather.tempC}°
              </span>
            )}
          </div>
        </div>
        <div className="avatar" style={{ background: 'var(--marigold-wash)' }}>
          <Icon name={TOD_ICON[tod]} size={26} color="var(--marigold-deep)" />
        </div>
      </div>

      {!data ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : (
        <div className="board-grid">
          {data.tonight && (
            <div className="now-card" style={{ background: CATS.meal.wash, color: CATS.meal.deep }}>
              <div className="blob" style={{ background: CATS.meal.color }} />
              <div className="label">{t.board.tonight}</div>
              <div className="what">{data.tonight.title}</div>
              {cookLine(data.tonight) && <div className="who">{cookLine(data.tonight)}</div>}
              <div className="icn">
                <Icon name={CATS.meal.icon} size={40} color={CATS.meal.color} />
              </div>
            </div>
          )}

          <Section label={t.board.today} count={data.today.length}>
            {data.today.length === 0 ? <p className="feed-empty">—</p> : data.today.map(eventAct)}
          </Section>

          <Section label={t.board.tomorrow} count={data.tomorrow.length + (data.tomorrowMeal ? 1 : 0)}>
            {data.tomorrowMeal && (
              <Act cat="meal" title={data.tomorrowMeal.title} who={cookLine(data.tomorrowMeal)} />
            )}
            {data.tomorrow.map(eventAct)}
            {data.tomorrow.length === 0 && !data.tomorrowMeal && <p className="feed-empty">—</p>}
          </Section>

          {data.upcoming.length > 0 && (
            <Section label={t.board.upcoming} count={data.upcoming.length}>
              {data.upcoming.map((e) => (
                <Act key={e.id} cat="event" title={e.title} when={formatTime(e.start_at, lang)} />
              ))}
            </Section>
          )}

          <PhotoFrame />
        </div>
      )}

      <p className="board__synced mono">{stale ? t.board.offline : `${t.board.synced} ${clock}`}</p>
    </main>
  )
}

// A calm family-photo frame for the wall: one photo at a time, a slow cross-fade
// every 30s. Silent no-op when there are no photos (or R2 is off).
function PhotoFrame() {
  const { data } = useQuery({
    queryKey: ['photos'],
    queryFn: () => api<{ photos: { id: string; key: string }[] }>('photos'),
    ...live,
  })
  const photos = data?.photos ?? []
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (photos.length < 2) return
    const id = setInterval(() => setIdx((i) => (i + 1) % photos.length), 30000)
    return () => clearInterval(id)
  }, [photos.length])
  if (!photos.length) return null
  const p = photos[idx % photos.length]
  // key=id so React remounts the <img>, re-triggering the gentle fade per photo.
  return (
    <div className="photo-frame">
      <img key={p.id} src={imgUrl(p.key)} alt="" />
    </div>
  )
}

// Pip section header: label + rule + a quiet count (never a score). Each Section
// is a bento tile in the board grid.
function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bento">
      <div className="sec-label">
        <b>{label}</b>
        <span className="ln" />
        {count ? <span className="ct">{count}</span> : null}
      </div>
      {children}
    </div>
  )
}

// Pip activity card: colour spine + washed icon tile + title, optional tappable
// check (settles into sage when done). Interactive variant is a <button>;
// informational rows (events) render as a static card.
function Act({
  cat,
  title,
  when,
  who,
  done,
  onCheck,
  color,
}: {
  cat: CatKey
  title: string
  when?: string
  who?: string
  done?: boolean
  onCheck?: () => void
  color?: string // overrides the category colour (member colour, task colour)
}) {
  const c = CATS[cat]
  const spine = color ?? c.color
  const tileBg = color ? color + '22' : c.wash
  const glyph = color ?? c.deep
  const body = (
    <>
      <span className="spine" style={{ background: spine }} aria-hidden="true" />
      <span className="tile" style={{ background: tileBg }} aria-hidden="true">
        <Icon name={c.icon} size={28} color={glyph} />
      </span>
      <span className="act__text">
        {when && <span className="when">{when}</span>}
        <span className="title" style={done ? undefined : { color: tintInk(spine) }}>
          {title}
        </span>
        {who && <span className="who">{who}</span>}
      </span>
      {onCheck && (
        <span className="check" aria-hidden="true">
          <Icon name="check-bold" size={18} />
        </span>
      )}
    </>
  )
  if (onCheck) {
    return (
      <button type="button" className={'act' + (done ? ' done' : '')} onClick={onCheck} aria-pressed={!!done}>
        {body}
      </button>
    )
  }
  return <div className={'act' + (done ? ' done' : '')}>{body}</div>
}

