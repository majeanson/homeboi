import type { CSSProperties } from 'react'
import { InlineIcon } from './Icon'

// A calm "où on est rendu aujourd'hui" cue: a fixed-width ring filled to today's
// proportion of finished steps (a ring, not a row of dots — a 12-step deck would
// overflow a phone card). Deliberately NO number, NO percentage, NO streak — it
// reads today's run, which empties nightly (NFR-CALM-4), so it can only ever say
// "partway / done", never "how many days in a row". When every step is done it
// settles to a soft filled check; an untouched routine shows a bare track.
//
// Shared by the parent Routines overview card and the board « Prochaine routine »
// card so the two glance the same. Tinted via a `--tint` set on the wrapper.
export function RoutineRing({
  done,
  total,
  tint,
  label,
}: {
  done: number
  total: number
  tint: string
  label: string
}) {
  const R = 9
  const C = 2 * Math.PI * R
  const p = total > 0 ? Math.min(done / total, 1) : 0
  const complete = total > 0 && done >= total
  return (
    <span
      className={'routine-ring' + (complete ? ' routine-ring--done' : '')}
      style={{ '--tint': tint } as CSSProperties}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" focusable="false">
        <circle className="routine-ring__track" cx="12" cy="12" r={R} fill="none" strokeWidth="3" />
        <circle
          className="routine-ring__fill"
          cx="12"
          cy="12"
          r={R}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p)}
          transform="rotate(-90 12 12)"
        />
      </svg>
      {complete && <InlineIcon name="check-bold" size={11} />}
    </span>
  )
}
