import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BigTiles, type Tile } from '../components/BigTiles'
import { Icon, type IconName } from '../components/Icon'
import { CATS, TOD_ICON, type CatKey } from '../lib/cats'
import { tintInk } from '../lib/colors'
import { useLang, useT, type Lang } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { useProfile } from '../lib/profile'
import { ProfilePicker } from '../components/ProfilePicker'
import { useAddSheet } from '../lib/addSheet'
import { readBoardView, saveBoardView, type BoardView } from '../lib/boardview'
import { useSpeak } from '../lib/speak'
import { timeOfDay } from '../lib/timeofday'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { weatherEmoji, weatherTip, type Weather, type DayOutlook } from '../lib/weather'
import { imgUrl } from '../lib/image'
import { formatClock, formatDay, formatTime } from '../lib/format'
import { pictoFor } from '../lib/picto'

// The wall board. Polls the whole board in one read on an interval. ZERO AI on
// this path. Tolerates wifi loss: a failed poll keeps the last good frame and
// flips a "showing cache" stamp instead of blanking. The day's list empties
// and stays empty — no counters, no score for clearing it.
interface Member { id: string; display_name: string; colour: string; is_child: number; avatar_kind?: string; avatar_ref?: string }
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
  const { surface } = useSurface()
  // Pick-your-face: who's on this phone — greets them + marks their day.
  const { memberId: profileId, setMemberId } = useProfile()
  const [profileOpen, setProfileOpen] = useState(false)
  // Mobile glance: a quick-capture bar sits at the top and opens the shared
  // AddSheet (note/voice → AI router) owned by HubLayout. The primary phone action.
  const { open: openAdd } = useAddSheet()
  const speak = useSpeak()
  const [clock, setClock] = useState(() => formatClock(lang, Date.now()))
  // The board layout for this device (bento | next | lanes), remembered locally.
  const [view, setView] = useState<BoardView>(() => readBoardView())
  function changeView(v: BoardView) {
    setView(v)
    saveBoardView(v)
  }

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
    queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null }>('weather'),
    refetchInterval: FIFTEEN_MIN,
    staleTime: FIFTEEN_MIN,
  })
  const weather = wx?.weather ?? null
  const tomorrowWx = wx?.tomorrow ?? null
  const tip = weatherTip(weather)

  useEffect(() => {
    const c = setInterval(() => setClock(formatClock(lang, Date.now())), 30000)
    return () => clearInterval(c)
  }, [lang])

  // Shared kiosk: when someone has tapped their face, drift back to Maisonnée
  // after a few idle minutes so the wall tablet never gets "stuck" as one person.
  // Mobile (a personal device) is left as-is. Resets on any interaction.
  useEffect(() => {
    if (surface !== 'kiosk' || !profileId) return
    const IDLE = 3 * 60 * 1000
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setMemberId(null), IDLE)
    }
    reset()
    window.addEventListener('pointerdown', reset, { passive: true })
    window.addEventListener('keydown', reset)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [surface, profileId, setMemberId])

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
      // Draw the event's own picture (school/swim/birthday…) so a pre-reader can
      // tell things apart; fall back to a pin when nothing matches.
      icon: pictoFor(e.title, '📌'),
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
          className="today-hero today-hero--meal"
          onClick={() => speak(`${t.board[key]}: ${meal.title}`)}
          aria-label={`${t.board[key]}: ${meal.title}`}
        >
          <span className="today-hero__icon" aria-hidden="true">{pictoFor(meal.title, '🍽')}</span>
          <span className="today-hero__label">{meal.title}</span>
          <span className="today-hero__sub mono">{t.board[key]}</span>
        </button>
      ) : null

    const weatherHero = weather ? (
      <button
        type="button"
        className="today-hero today-hero--weather"
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
  // The picked member on this device (greeting + "your day" emphasis). Null on a
  // shared kiosk (no profile chosen there).
  const me = data?.members.find((m) => m.id === profileId) ?? null
  const eventAct = (e: EventRow) => (
    <Act
      key={e.id}
      cat="event"
      title={e.title}
      when={e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
      who={memberName(e.member_id) ?? undefined}
      color={memberColor(e.member_id) ?? undefined}
      mine={!!profileId && e.member_id === profileId}
    />
  )
  const cookLine = (m: MealRow) =>
    memberName(m.cook_member_id) ? `${memberName(m.cook_member_id)} ${t.board.cooks}` : undefined

  return (
    <main className="board-wall">
      {surface === 'mobile' && (
        <button type="button" className="qcap" onClick={openAdd}>
          <span className="qcap__icon" aria-hidden="true">
            <Icon name="plus-bold" size={20} color="var(--on-primary)" />
          </span>
          <span className="qcap__text">{t.capture.placeholder}</span>
          {/* The mic is a hint here; the sheet hosts the real voice input. */}
          <span className="qcap__mic" aria-hidden="true">🎤</span>
        </button>
      )}
      <div className="app-head">
        <div>
          <div className="hand-tag">{t.board.today}</div>
          <h1 className="greet">{me ? `${t.today[tod]}, ${me.display_name}` : t.today[tod]}</h1>
          <div className="subgreet">
            {formatDay(Math.floor(Date.now() / 1000), lang)} · {clock}
            {weather && (
              <span className="weather-chip" aria-label={`${t.weather[weather.bucket]} ${weather.tempC}°`}>
                {' '}
                · <span aria-hidden="true">{weatherEmoji(weather)}</span> {weather.tempC}°
              </span>
            )}
          </div>
          {/* One calm dressing tip from today's weather — hides when there's nothing
              worth saying (the usual case). */}
          {tip && <div className="weather-tip mono">{t.weather.tip[tip]}</div>}
        </div>
        <div className="board-head__right">
          {surface === 'mobile' && (
            <button
              type="button"
              className="profile-chip"
              onClick={() => setProfileOpen(true)}
              aria-label={t.profile.who}
            >
              {me ? (
                <span className="profile-chip__av" style={{ background: me.colour }}>
                  {(me.display_name[0] ?? '?').toUpperCase()}
                </span>
              ) : (
                <span className="profile-chip__ask mono">{t.profile.askShort}</span>
              )}
            </button>
          )}
          <BoardViewToggle view={view} onChange={changeView} t={t} />
          <div className="avatar" style={{ background: 'var(--marigold-wash)' }}>
            <Icon name={TOD_ICON[tod]} size={26} color="var(--marigold-deep)" />
          </div>
        </div>
      </div>

      {/* Shared kiosk: a one-tap face row to switch between Maisonnée (everyone)
          and an individual member — so anyone at the wall tablet can quickly act
          as themselves, then tap Maisonnée (or their face again) to step back. */}
      {surface === 'kiosk' && data && data.members.length > 0 && (
        <MemberSwitcher members={data.members} t={t} />
      )}

      {!data ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : view === 'next' ? (
        <NowNext data={data} lang={lang} t={t} profileId={profileId} />
      ) : view === 'lanes' ? (
        <Lanes data={data} lang={lang} t={t} profileId={profileId} />
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
            {tomorrowWx && (
              <div className="tomorrow-wx mono" aria-label={`${t.weather[tomorrowWx.bucket]} ${tomorrowWx.highC}° / ${tomorrowWx.lowC}°`}>
                <span aria-hidden="true">
                  {weatherEmoji({ bucket: tomorrowWx.bucket, isDay: true, tempC: tomorrowWx.highC })}
                </span>{' '}
                {tomorrowWx.highC}° / {tomorrowWx.lowC}°
              </div>
            )}
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
      {surface === 'mobile' && <ProfilePicker open={profileOpen} onClose={() => setProfileOpen(false)} />}
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
  mine,
}: {
  cat: CatKey
  title: string
  when?: string
  who?: string
  done?: boolean
  onCheck?: () => void
  color?: string // overrides the category colour (member colour, task colour)
  mine?: boolean // belongs to the device's picked member → a quiet "you" accent
}) {
  const c = CATS[cat]
  const spine = color ?? c.color
  const tileBg = color ? color + '22' : c.wash
  const glyph = color ?? c.deep
  const cls = 'act' + (done ? ' done' : '') + (mine ? ' act--mine' : '')
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
      {mine && <span className="act__mine" aria-hidden="true">★</span>}
      {onCheck && (
        <span className="check" aria-hidden="true">
          <Icon name="check-bold" size={18} />
        </span>
      )}
    </>
  )
  if (onCheck) {
    return (
      <button type="button" className={cls} onClick={onCheck} aria-pressed={!!done}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}

// ---- Board view switching --------------------------------------------------
// Module helpers so the alternate views (NowNext, Lanes) don't recreate Board's
// member lookups.
type Dict = ReturnType<typeof useT>
const nameOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.display_name ?? null
const colorOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.colour

// A tiny segmented control in the board header: bento (grid) · next (focus) ·
// lanes (per-person). Calm and small; the choice is remembered per device.
function BoardViewToggle({ view, onChange, t }: { view: BoardView; onChange: (v: BoardView) => void; t: Dict }) {
  const opts: { v: BoardView; icon: IconName; label: string }[] = [
    { v: 'bento', icon: 'calendar-blank-bold', label: t.boardView.bento },
    { v: 'next', icon: 'clock-bold', label: t.boardView.next },
    { v: 'lanes', icon: 'smiley-bold', label: t.boardView.lanes },
  ]
  return (
    <div className="boardview" role="group" aria-label={t.boardView.label}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          className={'boardview__opt' + (view === o.v ? ' is-on' : '')}
          aria-pressed={view === o.v}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.v)}
        >
          <Icon name={o.icon} size={18} />
        </button>
      ))}
    </div>
  )
}

// The kiosk member switcher: a calm face row. "Maisonnée" (everyone) is the
// default neutral mode; tapping a face acts/personalizes as that member; tapping
// the active face again, or Maisonnée, returns to everyone. Uses the device
// profile (lib/profile) — the same identity the mobile chip sets.
function MemberSwitcher({ members, t }: { members: Member[]; t: Dict }) {
  const { memberId, setMemberId } = useProfile()
  return (
    <div className="mswitch" role="group" aria-label={t.profile.switch}>
      <button
        type="button"
        className={'mswitch__opt' + (memberId === null ? ' is-on' : '')}
        aria-pressed={memberId === null}
        onClick={() => setMemberId(null)}
      >
        <span className="mswitch__av mswitch__av--all" aria-hidden="true">👥</span>
        <span className="mswitch__name">{t.profile.household}</span>
      </button>
      {members.map((m) => {
        const photo = m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null
        const on = m.id === memberId
        return (
          <button
            key={m.id}
            type="button"
            className={'mswitch__opt' + (on ? ' is-on' : '')}
            aria-pressed={on}
            onClick={() => setMemberId(on ? null : m.id)}
          >
            <span className="mswitch__av" style={{ background: photo ? undefined : m.colour }}>
              {photo ? <img src={photo} alt="" /> : (m.display_name[0] ?? '?').toUpperCase()}
            </span>
            <span className="mswitch__name">{m.display_name}</span>
          </button>
        )
      })}
    </div>
  )
}

// "Now & Next" — a departure-board focus: the next thing up, big, with the one
// after it small beneath. When today is exhausted it BRIDGES to tomorrow's first
// event (rather than a stale "tonight" card); only an empty tomorrow falls back to
// the supper, then a calm empty. All-day items ride along as a quiet footer.
function NowNext({ data, lang, t, profileId }: { data: BoardData; lang: Lang; t: Dict; profileId: string | null }) {
  const now = Date.now() / 1000
  const timed = data.today.filter((e) => !e.all_day).sort((a, b) => a.start_at - b.start_at)
  const allDay = data.today.filter((e) => e.all_day)
  // Something that started in the last 30 min still counts as "now".
  const upcoming = timed.filter((e) => e.start_at >= now - 1800)
  const tomorrow = [...data.tomorrow].sort((a, b) => a.start_at - b.start_at)

  let focus: EventRow | undefined
  let focusWhen = ''
  let then: EventRow | undefined
  let thenWhen = ''
  if (upcoming[0]) {
    focus = upcoming[0]
    focusWhen = focus.all_day ? t.board.allDay : formatTime(focus.start_at, lang)
    if (upcoming[1]) {
      then = upcoming[1]
      thenWhen = formatTime(then.start_at, lang)
    } else if (tomorrow[0]) {
      then = tomorrow[0]
      thenWhen = t.board.tomorrow
    }
  } else if (tomorrow[0]) {
    focus = tomorrow[0]
    focusWhen = t.board.tomorrow
    if (tomorrow[1]) {
      then = tomorrow[1]
      thenWhen = t.board.tomorrow
    }
  }

  const focusColor = focus ? colorOf(data.members, focus.member_id) : undefined
  const focusWho = focus ? nameOf(data.members, focus.member_id) : null
  const focusMine = !!focus && !!profileId && focus.member_id === profileId

  return (
    <div className="nownext">
      {focus ? (
        <div
          className={'nownext__focus' + (focusMine ? ' act--mine' : '')}
          style={{ borderColor: (focusColor ?? CATS.event.color) + '55' }}
        >
          <div className="nownext__when mono">{focusWhen}</div>
          <div className="nownext__title" style={{ color: tintInk(focusColor ?? CATS.event.color) }}>
            {focus.title}
          </div>
          {focusWho && (
            <div className="nownext__who">
              {focusWho}
              {focusMine ? ' ★' : ''}
            </div>
          )}
        </div>
      ) : data.tonight ? (
        <div className="nownext__focus" style={{ borderColor: CATS.meal.color + '55' }}>
          <div className="nownext__when mono">{t.board.tonight}</div>
          <div className="nownext__title" style={{ color: CATS.meal.deep }}>
            {data.tonight.title}
          </div>
        </div>
      ) : (
        <div className="nownext__focus nownext__focus--empty">
          <div className="nownext__title">{t.boardView.nothingNext}</div>
        </div>
      )}

      {then && (
        <div className="nownext__then">
          <span className="nownext__then-label mono">{t.boardView.then}</span>
          <span className="nownext__then-when mono">{thenWhen}</span>
          <span className="nownext__then-title">{then.title}</span>
        </div>
      )}

      {allDay.length > 0 && (
        <div className="nownext__allday mono">
          {t.board.allDay} · {allDay.map((e) => e.title).join(' · ')}
        </div>
      )}
    </div>
  )
}

// Per-person "lanes": one column per family member (their today events + the chore
// currently their turn). A leading "Maisonnée" lane carries tonight's supper and
// any unassigned events — the common case, since quick-capture doesn't set a
// member — so nothing vanishes. The device's own member lane is gently accented.
function Lanes({ data, lang, t, profileId }: { data: BoardData; lang: Lang; t: Dict; profileId: string | null }) {
  const choresFor = (memberId: string) =>
    data.chores.filter((c) => {
      try {
        const rot = JSON.parse(c.rotation_json) as string[]
        return rot[c.current_idx] === memberId
      } catch {
        return false
      }
    })
  const memberIds = new Set(data.members.map((m) => m.id))
  const unassigned = data.today.filter((e) => !e.member_id || !memberIds.has(e.member_id))
  const cook = data.tonight ? nameOf(data.members, data.tonight.cook_member_id) : null

  return (
    <div className="lanes">
      {(unassigned.length > 0 || data.tonight) && (
        <div className="lane bento">
          <div className="lane__head lane__head--shared">
            <span className="lane__dot" style={{ background: 'var(--ink-faint)' }} aria-hidden="true" />
            {t.profile.household}
          </div>
          {data.tonight && (
            <Act cat="meal" title={data.tonight.title} who={cook ? `${cook} ${t.board.cooks}` : undefined} />
          )}
          {unassigned.map((e) => (
            <Act
              key={e.id}
              cat="event"
              title={e.title}
              when={e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
            />
          ))}
        </div>
      )}
      {data.members.map((m) => {
        const events = data.today.filter((e) => e.member_id === m.id)
        const chores = choresFor(m.id)
        const empty = events.length === 0 && chores.length === 0
        const mine = m.id === profileId
        return (
          <div key={m.id} className={'lane bento' + (mine ? ' lane--mine' : '')}>
            <div className="lane__head" style={{ color: tintInk(m.colour) }}>
              <span className="lane__dot" style={{ background: m.colour }} aria-hidden="true" />
              {m.display_name}
              {mine ? ' ★' : ''}
            </div>
            {empty ? (
              <p className="feed-empty">—</p>
            ) : (
              <>
                {events.map((e) => (
                  <Act
                    key={e.id}
                    cat="event"
                    title={e.title}
                    when={e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
                    color={m.colour}
                  />
                ))}
                {chores.map((c) => (
                  <Act key={c.id} cat="chore" title={c.title} color={c.color ?? m.colour} />
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

