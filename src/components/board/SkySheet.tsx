import { useQueries } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { type Weather, type DayOutlook, type HourOutlook, weatherIcon, weatherTint, weatherTip } from '../../lib/weather'
import { WonderBand, WONDER_SOURCES, type Wonder, type WonderSource } from './ApodFrame'
import { Sheet } from '../Sheet'
import { Icon } from '../Icon'

// « Dehors aujourd'hui » — tap the board's weather/wonder hero for the story behind
// the glance: the wonder picture in full (title, blurb, read-aloud — the same
// WonderBand the toddler board renders), a small gallery of ALL of today's wonder
// sources to pick the wall's backdrop from, and the day's weather told calmly (now,
// the next few hours, tomorrow, the one dressing tip). Read-only end to end — every
// fetch is a GET the board already makes — so a guest may open it too.
const SIX_HOURS = 6 * 60 * 60 * 1000

export function SkySheet({
  open,
  onClose,
  weather,
  hours,
  tomorrow,
  wonder,
  onShuffle,
  onPick,
}: {
  open: boolean
  onClose: () => void
  weather: Weather | null
  hours: HourOutlook[] | null
  tomorrow: DayOutlook | null
  wonder: Wonder | null
  onShuffle: () => void
  onPick: (s: WonderSource) => void
}) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} className="sky-sheet" ariaLabel={t.board.sky.title}>
      <h3>{t.board.sky.title}</h3>
      {/* Body only while open (TodayChangesSheet's idiom) so the gallery's five
          source fetches don't run for a sheet nobody opened. */}
      {open && (
        <SkyBody weather={weather} hours={hours} tomorrow={tomorrow} wonder={wonder} onShuffle={onShuffle} onPick={onPick} />
      )}
    </Sheet>
  )
}

function SkyBody({
  weather,
  hours,
  tomorrow,
  wonder,
  onShuffle,
  onPick,
}: {
  weather: Weather | null
  hours: HourOutlook[] | null
  tomorrow: DayOutlook | null
  wonder: Wonder | null
  onShuffle: () => void
  onPick: (s: WonderSource) => void
}) {
  const t = useT()
  const tip = weatherTip(weather)
  return (
    <div className="sky-body">
      {weather && (
        <section className="sky-wx" aria-label={t.board.sky.now}>
          <div className="sky-wx__now">
            <Icon name={weatherIcon(weather)} size={44} color={weatherTint(weather)} />
            <div className="sky-wx__read">
              <b className="sky-wx__temp">{weather.tempC}°</b>
              <span className="sky-wx__cond">{t.weather[weather.bucket]}</span>
            </div>
          </div>
          {tip && <p className="sky-wx__tip">{t.weather.tip[tip]}</p>}
          {((hours && hours.length > 0) || tomorrow) && (
            <div className="sky-wx__ahead">
              {(hours ?? []).map((h) => (
                <span className="sky-wx__chip" key={h.hour}>
                  <span className="sky-wx__when mono">{h.hour} h</span>
                  <Icon
                    name={weatherIcon({ bucket: h.bucket, isDay: h.hour >= 7 && h.hour < 20, tempC: h.tempC })}
                    size={20}
                    color={weatherTint({ bucket: h.bucket, isDay: h.hour >= 7 && h.hour < 20, tempC: h.tempC })}
                  />
                  <b>{h.tempC}°</b>
                </span>
              ))}
              {tomorrow && (
                <span className="sky-wx__chip sky-wx__chip--tomorrow">
                  <span className="sky-wx__when mono">{t.board.sky.tomorrow}</span>
                  <Icon
                    name={weatherIcon({ bucket: tomorrow.bucket, isDay: true, tempC: tomorrow.highC })}
                    size={20}
                    color={weatherTint({ bucket: tomorrow.bucket, isDay: true, tempC: tomorrow.highC })}
                  />
                  <b>
                    {tomorrow.highC}° / {tomorrow.lowC}°
                  </b>
                </span>
              )}
            </div>
          )}
        </section>
      )}
      {wonder && (
        <>
          {/* The full band the toddler board already renders: image (tap-to-zoom),
              source kicker, title, expandable blurb, credit, ⟳ shuffle. */}
          <WonderBand wonder={wonder} onShuffle={onShuffle} />
          <WonderGallery current={wonder} onPick={onPick} />
        </>
      )}
    </div>
  )
}

// All of today's wonder pictures at once — one thumbnail per source, tap to make it
// the board's backdrop. Each source is the SAME cached query the shuffle rotates
// through (['wonder', source]), so a source the board already showed costs nothing.
// The endpoint falls back to a reliable feed when one is down, so two requests can
// answer with the same picture — dedupe by image URL, and mark the showing one.
function WonderGallery({ current, onPick }: { current: Wonder; onPick: (s: WonderSource) => void }) {
  const t = useT()
  const results = useQueries({
    queries: WONDER_SOURCES.map((source) => ({
      queryKey: ['wonder', source],
      queryFn: () => api<{ wonder: Wonder | null }>(`wonder?source=${source}`),
      staleTime: SIX_HOURS,
      retry: false,
    })),
  })
  const seen = new Set<string>()
  const tiles = WONDER_SOURCES.flatMap((source, i) => {
    const w = results[i].data?.wonder
    if (!w || seen.has(w.imgUrl)) return []
    seen.add(w.imgUrl)
    return [{ source, w }]
  })
  if (tiles.length < 2) return null
  return (
    <section className="sky-gallery" aria-label={t.board.sky.gallery}>
      <h4 className="sky-gallery__label">{t.board.sky.gallery}</h4>
      <div className="sky-gallery__grid">
        {tiles.map(({ source, w }) => {
          const active = w.imgUrl === current.imgUrl
          return (
            <button
              key={source}
              type="button"
              className={'sky-thumb' + (active ? ' is-active' : '')}
              style={{ backgroundImage: `url("${w.imgUrl}")` }}
              onClick={() => onPick(source)}
              aria-pressed={active}
              aria-label={t.board.sky.pickImage(t.board.wonderKicker[w.source])}
            >
              <span className="sky-thumb__kicker mono">{t.board.wonderKicker[w.source]}</span>
              {active && (
                <span className="sky-thumb__check" aria-hidden="true">
                  <Icon name="check-bold" size={14} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
