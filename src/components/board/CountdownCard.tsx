import { useEffect, useMemo } from 'react'
import { useLang, useT } from '../../i18n'
import { BoardCard } from './BoardCard'
import { Cluster } from '../Layout'
import { InlineIcon } from '../Icon'
import { isGuest } from '../../lib/device'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { daysUntilLocal, todayLocalDay } from '../../lib/localDay'
import {
  nextMajorFete,
  useCountdown,
  setCountdown,
  useSkippedCountdowns,
  skipCountdown,
  type Countdown,
} from '../../lib/year'
import type { EventRow } from './types'

// A-5+6 (bmad/09) — « Le décompte », Marc's design: SUGGESTION-driven. One
// calm countdown tile, never a stack of deadlines. With nothing pinned, the
// house OFFERS the next natural thing to count the dodos toward — an upcoming
// derived birthday (the board already computes those) or the next major fête
// (lib/year, long range: Noël is offerable in July). One tap pins it; « Passer »
// waves that one off until its date passes and the next candidate is offered.
// When the counted day arrives then passes, the tile clears itself and the
// next suggestion appears — Marc: « when they're done, suggest a new one. »
// Calm: an offer, never auto-pinned; days count DOWN to a real day the family
// chose — no streaks, no score. Guests see the pinned countdown but never the
// offer (a babysitter doesn't set the house's clock). Grid placement/show-hide
// rides lib/boardCards ('countdown') like every card.
export function CountdownCard({ upcoming }: { upcoming: EventRow[] }) {
  const t = useT()
  const { lang } = useLang()
  const ro = isGuest()
  const pinned = useCountdown()
  const skipped = useSkippedCountdowns()
  const todaySec = todayLocalDay()

  // The counted day has passed → the countdown finished; clear so the next
  // suggestion can be offered. (On the day itself the tile celebrates instead.)
  useEffect(() => {
    if (pinned && pinned.at < todaySec) setCountdown(null)
  }, [pinned, todaySec])

  // The soonest un-skipped candidate, if we'd be offering one. Hoisted above the pinned
  // branch (and memoised) so the card can answer "am I empty?" with ONE value before any
  // early return — a hook can't hide behind one. A guest is never offered a suggestion
  // (they don't set the house's clock), so for them "no pin" means empty.
  const suggestion = useMemo(() => {
    if (ro) return undefined
    const fete = nextMajorFete(todaySec)
    const candidates: Countdown[] = [
      ...upcoming
        .filter((e) => e.birthday)
        .map((e) => ({ id: `bday-${e.id}`, label: e.title, emoji: '🎂', at: e.start_at })),
      ...(fete
        ? [{ id: `fete-${fete.holiday.id}-${fete.at}`, label: fete.holiday.label[lang], emoji: fete.holiday.emoji, at: fete.at }]
        : []),
    ]
      .filter((c) => c.at >= todaySec && skipped[c.id] !== c.at)
      .sort((a, b) => a.at - b.at)
    return candidates[0]
  }, [ro, upcoming, skipped, todaySec, lang])

  const hasPinned = !!pinned && pinned.at >= todaySec
  useReportEmpty(!hasPinned && !suggestion)

  // Spelled out rather than `if (hasPinned)` so TS narrows `pinned` to non-null below.
  if (pinned && pinned.at >= todaySec) {
    const n = daysUntilLocal(pinned.at)
    return (
      <BoardCard
        className="bento countdown-card"
        label={t.countdown.title}
        icon="hourglass-high-bold"
        compactHint={`${pinned.emoji} ${t.countdown.dodosN(n)}`}
      >
        <div className="countdown-card__tile">
          <span className="countdown-card__emoji" aria-hidden="true">
            {pinned.emoji}
          </span>
          <span className="countdown-card__what">{pinned.label}</span>
          <span className="countdown-card__n mono">{t.countdown.dodosN(n)}</span>
        </div>
        {!ro && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCountdown(null)}>
            <InlineIcon name="x-bold" size={14} /> {t.countdown.stop}
          </button>
        )}
      </BoardCard>
    )
  }

  // Nothing pinned → offer the soonest un-skipped candidate (computed above), or nothing.
  if (!suggestion) return null

  return (
    <BoardCard
      className="bento countdown-card"
      label={t.countdown.title}
      icon="hourglass-high-bold"
      // The offered day, named + counted (« 🎂 Fête de Léa · 5 dodos ») — the two-line
      // hint fits the whole phrase now, so the mini says what AND how far.
      compactHint={`${suggestion.emoji} ${suggestion.label} · ${t.countdown.dodosN(daysUntilLocal(suggestion.at))}`}
    >
      <p className="countdown-card__ask">
        <span aria-hidden="true">{suggestion.emoji}</span> {t.countdown.suggest(suggestion.label)}
      </p>
      <Cluster>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setCountdown(suggestion)}>
          <InlineIcon name="check-bold" size={14} /> {t.countdown.yes}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => skipCountdown(suggestion.id, suggestion.at)}>
          {t.countdown.skip}
        </button>
      </Cluster>
    </BoardCard>
  )
}
