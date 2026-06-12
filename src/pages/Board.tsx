import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BigTiles, Sayable, type Tile } from '../components/BigTiles'
import { PairPrompt } from '../components/Fallback'
import { Icon } from '../components/Icon'
import { CATS, TOD_ICON } from '../lib/cats'
import { useLang, useT } from '../i18n'
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
import { formatClock, formatDay, formatTime } from '../lib/format'
import { pictoFor } from '../lib/picto'
import { Act, Section } from '../components/board/Act'
import { PhotoFrame } from '../components/board/PhotoFrame'
import { Notes } from '../components/board/Notes'
import { BoardViewToggle, MemberSwitcher } from '../components/board/chrome'
import { NowNext, Lanes } from '../components/board/views'
import { type BoardData, type ChoreInstance, type EventRow, type MealRow } from '../components/board/types'

// The wall board. Polls the whole board in one read on an interval. ZERO AI on
// this path. Tolerates wifi loss: a failed poll keeps the last good frame and
// flips a "showing cache" stamp instead of blanking. The day's list empties
// and stays empty — no counters, no score for clearing it. The alternate views
// (Now & Next, per-person lanes) and the card/section atoms live in
// src/components/board/*.
import { BOARD_KEY } from '../lib/queryKeys'

export function Board() {
  const t = useT()
  const qc = useQueryClient()
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

  // (The kiosk's idle drift back to Maisonnée lives in HubLayout — shell-level,
  // so wandering to Réglages or the kitchen doesn't pin a picked face forever.)

  // A member deleted in Réglages can linger as this device's picked profile —
  // clear it so the greeting/"my day" accents never point at a ghost.
  useEffect(() => {
    if (profileId && data?.members && !data.members.some((m) => m.id === profileId)) setMemberId(null)
  }, [data?.members, profileId, setMemberId])

  const memberName = (id: string | null) => data?.members.find((m) => m.id === id)?.display_name ?? null
  const memberColor = (id: string | null) => data?.members.find((m) => m.id === id)?.colour

  if (unauth) return <PairPrompt />

  // The picked member on this device (greeting + "your day" emphasis, both
  // lenses). Null on a shared kiosk with nobody picked.
  const me = data?.members.find((m) => m.id === profileId) ?? null

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
          {/* A picture hint beside the word, so "tonight vs tomorrow" doesn't
              hang on reading alone (NFR-KID-2 soft-reading). */}
          <span className="today-hero__sub mono">
            <span aria-hidden="true">{key === 'tonight' ? '🌙 ' : '🌅 '}</span>
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
        <span className="today-hero__icon" aria-hidden="true">{weatherEmoji(weather)}</span>
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

    const greet = me ? `${t.today[tod]}, ${me.display_name}` : t.today[tod]
    return (
      <main className="kid__main today-kid">
        {/* Greet the picked child by name — same personal touch the parent
            board gets. Generic when nobody's picked (shared wall). Tap to hear. */}
        <Sayable className="today-kid__greet" text={greet} />
        {!data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : (
          <>
            <div className="today-kid__heroes">
              {mealHero(data.tonight, 'tonight')}
              {mealHero(data.tomorrowMeal, 'tomorrow')}
              {weatherHero}
            </div>
            <Notes notes={data.notes ?? []} members={data.members} toddler />
            {kidSection(t.board.today, eventTiles(data.today))}
            {/* Chores due today, as read-aloud tiles — whose turn rides in the sub. */}
            {kidSection(
              t.board.chores,
              (data.choresToday ?? []).map((c) => ({
                key: c.id,
                icon: pictoFor(c.title, '🧹'),
                label: c.title,
                sub: c.who ?? undefined,
                narration: c.who ? `${c.title}. ${c.who}` : c.title,
                color: c.color ?? undefined,
              })),
            )}
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
      mine={!!profileId && e.member_id === profileId}
    />
  )
  const cookLine = (m: MealRow) =>
    memberName(m.cook_member_id) ? `${memberName(m.cook_member_id)} ${t.board.cooks}` : undefined

  // A due recurring chore, surfaced on the board. Tapping marks it done (advances
  // the rotation server-side); optimistically drop it so the tap feels instant.
  const markChoreDone = (c: ChoreInstance) => {
    qc.setQueryData<BoardData>(BOARD_KEY, (d) =>
      d ? { ...d, choresToday: (d.choresToday ?? []).filter((x) => x.id !== c.id) } : d,
    )
    api('chores', { method: 'PATCH', body: { id: c.id, complete: true } })
      .catch(() => {})
      .finally(() => qc.invalidateQueries({ queryKey: BOARD_KEY }))
  }
  const choreAct = (c: ChoreInstance, withDay?: boolean) => (
    <Act
      key={c.id}
      cat="chore"
      title={c.title}
      when={withDay ? formatDay(c.at, lang) : undefined}
      who={c.who ?? undefined}
      color={c.color ?? undefined}
      onCheck={withDay ? undefined : () => markChoreDone(c)}
    />
  )

  return (
    <main className="board-wall">
      {surface === 'mobile' && (
        // A typical add button (the AI capture sheet hosts type + voice) — calm
        // and standard so the greeting + tonight's meal lead the glance, not a
        // full-width search-style bar. (Subject to further enhancement later.)
        <button type="button" className="btn board-add" onClick={() => openAdd()}>
          <Icon name="plus-bold" size={18} />
          {t.capture.add}
        </button>
      )}
      <div className="app-head">
        <div>
          <div className="hand-tag">{t.board.today}</div>
          <h1 className="greet">{me ? `${t.today[tod]}, ${me.display_name}` : t.today[tod]}</h1>
          <div className="subgreet">
            {formatDay(Math.floor(Date.now() / 1000), lang)} · {clock}
          </div>
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

      {/* A fresh household (nobody added yet): one gentle pointer to the next
          step instead of a wall of empty "—" sections. */}
      {data && data.members.length === 0 && (
        <p className="board-welcome mono">
          {t.board.welcomeHint}{' '}
          <Link to="/settings#household">{t.board.welcomeCta}</Link>
        </p>
      )}

      {/* Fridge notes ride above the day in every parent view — tap one to clear. */}
      {data && <Notes notes={data.notes ?? []} members={data.members} />}

      {!data ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : view === 'next' ? (
        <NowNext data={data} lang={lang} t={t} profileId={profileId} />
      ) : view === 'lanes' ? (
        <Lanes data={data} lang={lang} t={t} profileId={profileId} />
      ) : (
        <>
          {/* The "today" zone: tonight's supper and today's weather as equal hero
              cards (mirrors the toddler heroes row), so weather has a real bubble
              instead of hiding in the timestamp line. The dressing tip rides under
              the temperature where it's actionable. */}
          {(data.tonight || weather) && (
            <div className="board-heroes">
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
              {weather && (
                <div className="now-card now-card--wx" style={{ background: CATS.event.wash, color: CATS.event.deep }}>
                  <div className="blob" style={{ background: CATS.event.color }} />
                  <div className="label">{t.weather[weather.bucket]}</div>
                  <div className="what">{weather.tempC}°</div>
                  {tip && <div className="who">{t.weather.tip[tip]}</div>}
                  <div className="icn icn--emoji" aria-hidden="true">
                    {weatherEmoji(weather)}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="board-grid">
            <Section label={t.board.today} count={data.today.length + (data.choresToday ?? []).length}>
            {data.today.length === 0 && (data.choresToday ?? []).length === 0 ? (
              <p className="feed-empty">—</p>
            ) : (
              <>
                {data.today.map(eventAct)}
                {/* Recurring chores due today — tap to check off (advances the turn). */}
                {(data.choresToday ?? []).map((c) => choreAct(c))}
              </>
            )}
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

          {(data.upcoming.length > 0 || (data.choresUpcoming ?? []).length > 0) && (
            <Section label={t.board.upcoming} count={data.upcoming.length + (data.choresUpcoming ?? []).length}>
              {data.upcoming.map((e) => (
                <Act key={e.id} cat="event" title={e.title} when={formatTime(e.start_at, lang)} />
              ))}
              {/* Recurring chores coming up later this week, with their day. */}
              {(data.choresUpcoming ?? []).map((c) => choreAct(c, true))}
            </Section>
          )}

            <PhotoFrame />
          </div>
        </>
      )}

      <p className="board__synced mono">{stale ? t.board.offline : `${t.board.synced} ${clock}`}</p>
      {surface === 'mobile' && <ProfilePicker open={profileOpen} onClose={() => setProfileOpen(false)} />}
    </main>
  )
}
