import { useMemo } from 'react'
import { useT } from '../../i18n'
import { useSpeak } from '../../lib/speak'
import { useBoardData } from '../../lib/queryHooks'
import { useMealPrefs } from '../../lib/mealPrefs'
import { Icon } from '../Icon'
import { bucketDay, type DayPartData, type DayPartKey } from '../../lib/playContent'

// « Notre journée » — the our-day timeline. The four parts of a day (matin → midi →
// soir → dodo) shown as a sequence, each a big tile that reads aloud what happens then
// (today's meals + events, woven into a calm sentence). Teaches SEQUENCE and time, not
// a schedule to obey — empty parts still show, because the order IS the lesson. Tap a
// part to hear it. No alarms, no "it's bedtime now" nudges (NFR-CALM).
const EMOJI: Record<DayPartKey, string> = { matin: '🌅', midi: '☀️', soir: '🌆', dodo: '🌙' }

export function DayTimeline() {
  const t = useT()
  const speak = useSpeak()
  const p = t.play.day
  const { data } = useBoardData()
  // A meal lands in the part of the day it's SERVED in (Réglages ▸ Repas) — a household
  // that soupes at 20 h hears it in « soir », not « midi ».
  const { hours } = useMealPrefs()

  const parts = useMemo(
    () =>
      data
        ? bucketDay(
            data.todayMeals.map((m) => ({ slot: m.slot, title: m.title })),
            data.today.map((e) => ({ title: e.title, start_at: e.start_at, all_day: e.all_day })),
            hours,
          )
        : [],
    [data, hours],
  )

  const label = (k: DayPartKey) => p.parts[k]
  const generic = (k: DayPartKey) => p.generic[k]
  const narrate = (part: DayPartData): string => {
    const bits = [label(part.key), generic(part.key)]
    if (part.mealTitles.length) bits.push(p.weEat(part.mealTitles.join(', ')))
    for (const e of part.eventTitles) bits.push(e)
    return bits.join('. ')
  }
  const sub = (part: DayPartData): string | null => [...part.mealTitles, ...part.eventTitles][0] ?? null

  if (!data) return <p className="loading mono">{t.common.loading}</p>

  return (
    <div className="daytl">
      <button type="button" className="sayable daytl__intro" onClick={() => speak(p.intro)}>
        {p.intro}
      </button>
      <ol className="daytl__list">
        {parts.map((part) => (
          <li key={part.key} className={'daytl__item daytl__item--' + part.key}>
            <button type="button" className="daytl__tile" onClick={() => speak(narrate(part))} aria-label={narrate(part)}>
              <span className="daytl__emoji" aria-hidden="true">{EMOJI[part.key]}</span>
              <span className="daytl__main">
                <span className="daytl__label">{label(part.key)}</span>
                {sub(part) && <span className="daytl__sub mono">{sub(part)}</span>}
              </span>
              <Icon name="speaker-high-bold" size={18} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
