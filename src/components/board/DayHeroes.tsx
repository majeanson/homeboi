import { useT } from '../../i18n'
import { wash, tintInk } from '../../lib/colors'
import { CATS } from '../../lib/cats'
import { SLOT_ICON_NAME, heroCardLabel, type MealSlot } from '../../lib/mealSlots'
import { type Weather, type HourOutlook, weatherIcon, weatherTint, weatherTip } from '../../lib/weather'
import { type DayMealRow } from './types'
import { type Wonder } from './ApodFrame'
import { Icon, InlineIcon } from '../Icon'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { useCardLens } from './CardLens'
import { CardMini } from './BoardCard'

// The board's two "today" hero cards, extracted so Grille AND « La journée » render
// the SAME polished visuals instead of one re-rolling a thinner version: the « Ce
// soir » supper card (every supper as a tappable row) and the weather card with the
// daily-wonder photo as its backdrop. The meal tap is a caller callback (`onOpenMeal`)
// so each view keeps its own detail actions; the wonder/shuffle is passed in too.
export function DayHeroes({
  suppers,
  supperColor,
  onOpenMeal,
  cookLine,
  weather,
  hours,
  wonder,
  onShuffleWonder,
  supperNow,
  heroSlot,
}: {
  suppers: DayMealRow[]
  supperColor: string
  onOpenMeal: (m: DayMealRow) => void
  cookLine: (m: DayMealRow) => string | undefined
  weather: Weather | null
  hours?: HourOutlook[] | null
  wonder: Wonder | null
  onShuffleWonder: () => void
  // Time-aware emphasis (lib/momentFocus): a gentle accent on « Ce soir » as dinner nears.
  supperNow?: boolean
  /** The slot `suppers` belongs to, as the board model resolved it — its icon is drawn
   *  from this, so a household whose headline is the dîner gets the fork, not the bowl.
   *  Passed in rather than re-read from `useMealPrefs()`: the rows were filtered
   *  server-side, and the two can disagree for one poll after a hero change. */
  heroSlot: MealSlot
}) {
  const t = useT()
  const lens = useCardLens()
  const tip = weatherTip(weather)
  const empty = suppers.length === 0 && !weather
  useReportEmpty(empty)
  if (empty) return null
  // The compact lens (see CardLens.tsx): `null` outside a CardSlot. A halved heroes
  // card is a MEDIA mini — the wonder picture with just the temperature riding on it,
  // barebones by design (everything else waits for the tap-to-grow). No weather →
  // the generic mini, with today's first supper as its quiet hint.
  if (lens && lens.compact && !lens.expanded) {
    return weather ? (
      <CardMini
        className="cardmini--media"
        label={t.boardCard.heroes}
        onExpand={lens.expand}
        body={
          <>
            <span
              className="cardmini__wonder"
              style={wonder ? { backgroundImage: `url("${wonder.imgUrl}")` } : { background: CATS.event.wash }}
              aria-hidden="true"
            />
            <span className="cardmini__temp">
              <Icon name={weatherIcon(weather)} size={16} /> {weather.tempC}°
            </span>
          </>
        }
      />
    ) : (
      <CardMini label={t.boardCard.heroes} icon="sun-bold" hint={suppers[0]?.title} onExpand={lens.expand} />
    )
  }
  return (
    <div className="board-heroes">
      {/* The way back once grown to full width — mirrors `SecLabel`'s reduce chip for
          the cards that use the shared header; the heroes pair has no `.sec-label`, so
          it grows its own on the wrapper (offset left of the wx card's ⟳ shuffle). */}
      {lens?.expanded && (
        <button
          type="button"
          className="sec-label__reduce board-heroes__reduce"
          onClick={(e) => {
            e.stopPropagation()
            lens.collapse()
          }}
          aria-expanded="true"
          aria-label={t.board.collapseCard(t.boardCard.heroes)}
          title={t.board.collapseCard(t.boardCard.heroes)}
        >
          <Icon name="caret-up-bold" size={14} />
        </button>
      )}
      {suppers.length > 0 && (
        // « Ce soir » — every supper planned today agglomerates into ONE hero card, a
        // tappable row each.
        <div className={'now-card now-card--supper' + (supperNow ? ' now-card--now' : '')} style={{ background: wash(supperColor), color: tintInk(supperColor) }}>
          <div className="blob" style={{ background: supperColor }} />
          <div className="label">{heroCardLabel(heroSlot, t)}</div>
          <div className="now-card__meals">
            {suppers.map((m) => (
              <div
                key={m.id}
                className="now-card__meal now-card--tap"
                role="button"
                tabIndex={0}
                onClick={() => onOpenMeal(m)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenMeal(m)
                  }
                }}
              >
                <div className="what">{m.title}</div>
                {m.is_leftover ? (
                  <div className="who">
                    <InlineIcon name="arrow-counter-clockwise-bold" size={13} /> {t.kitchen.leftoversTag}
                  </div>
                ) : null}
                {cookLine(m) && <div className="who">{cookLine(m)}</div>}
              </div>
            ))}
          </div>
          <div className="icn">
            <Icon name={SLOT_ICON_NAME[heroSlot]} size={40} color={supperColor} />
          </div>
        </div>
      )}
      {weather && (
        // The wonder picture is the card's BACKDROP; the weather sits on top in
        // frosted chips so the temperature is legible over any image.
        <div
          className={`now-card now-card--wx${wonder ? ' now-card--wx-photo' : ''}`}
          style={wonder ? { backgroundImage: `url("${wonder.imgUrl}")` } : { background: CATS.event.wash, color: CATS.event.deep }}
        >
          {wonder ? (
            <>
              <span className="now-card__scrim" aria-hidden="true" />
              <button
                type="button"
                className="photo-frame__shuffle now-card__shuffle"
                onClick={onShuffleWonder}
                aria-label={t.board.shuffleWonder}
                title={t.board.shuffleWonder}
              >
                <Icon name="repeat-bold" size={16} />
              </button>
              <span className="now-card__wonder-hear mono">{t.board.wonderKicker[wonder.source]}</span>
            </>
          ) : (
            <div className="blob" style={{ background: CATS.event.color }} />
          )}
          <div className="label">{t.weather[weather.bucket]}</div>
          <div className="what">{weather.tempC}°</div>
          {tip && <div className="who">{t.weather.tip[tip]}</div>}
          {/* A calm few-hours-ahead glance: 3 frosted chips (icon + temp), legible over
              the wonder photo. No hourly table — just the shape of the afternoon. */}
          {hours && hours.length > 0 && (
            <div className="now-card__hours" aria-hidden="true">
              {hours.map((h) => (
                <span className="now-card__hour" key={h.hour}>
                  <span className="now-card__hour-when mono">{h.hour}h</span>
                  <Icon name={weatherIcon({ bucket: h.bucket, isDay: h.hour >= 7 && h.hour < 20, tempC: h.tempC })} size={18} color={wonder ? '#fff' : weatherTint({ bucket: h.bucket, isDay: true, tempC: h.tempC })} />
                  <b>{h.tempC}°</b>
                </span>
              ))}
            </div>
          )}
          <div className="icn" aria-hidden="true">
            <Icon name={weatherIcon(weather)} size={38} color={wonder ? '#fff' : weatherTint(weather)} />
          </div>
        </div>
      )}
    </div>
  )
}
