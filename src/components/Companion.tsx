import { COMPANION_EMOJI, companionMood, type Companion as CompanionId } from '../lib/companions'
import { computeDayPart } from '../lib/timeofday'

// A member's chosen routine companion, drawn as its emoji. Its pose is bound ONLY
// to the time of day (companionMood over the daypart) — awake through the day,
// gently dozing at night — NEVER to routine progress. Decorative + aria-hidden:
// presence, never a grade or a reward. Reused by the routine player and the idle
// screensaver so the creature looks the same wherever it shows up.
export function Companion({
  companion,
  size = 48,
  at = Date.now(),
}: {
  companion: CompanionId
  size?: number
  at?: number
}) {
  const mood = companionMood(computeDayPart(at))
  return (
    <span
      className={'companion companion--' + mood}
      style={{ fontSize: size, lineHeight: 1 }}
      aria-hidden="true"
    >
      {COMPANION_EMOJI[companion]}
    </span>
  )
}
