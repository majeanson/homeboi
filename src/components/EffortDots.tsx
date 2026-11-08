import type { KeyboardEvent } from 'react'
import { useT } from '../i18n'
import { Disclosure } from './Disclosure'
import { Segmented } from './Segmented'

// THE EFFORT OF A TASK (0149, plans/2026-11-06-TACHE-UNIFIEE.md phase 3b): five dots, one is
// tout simple, five is gros effort. Optional: null = « pas dit », the normal state. It rates a
// TASK, never a person, and it is never summed, counted or ranked anywhere (NFR-CALM-1).
//
// ONE control, two faces, in this one file (`effort-rule.test.ts`):
//   · EffortDots, the picker. It IS a Segmented (role=radiogroup, one tab stop, arrows move
//     and pick), so it inherits the keyboard contract instead of copying it. Tap a dot to set,
//     tap the same dot again to clear; Delete or Backspace clears too, the keyboard's mirror of
//     that second tap. Every dot up to the pick is filled: it reads as « this much ».
//   · EffortMark, the read-only form: the same five dots, small, on a task row, and only when
//     set. It names itself to a screen reader (« Effort : Moyen »).
//
// The finder in the Tâches view uses the picker too, with « au plus » as its label: the same
// dots answer « how much do I have? ».
type Key = '1' | '2' | '3' | '4' | '5'
const KEYS: readonly Key[] = ['1', '2', '3', '4', '5']

/** The word for a dot, in the reader's language; null for « pas dit ». The words live here only. */
export function useEffortName(): (n: number | null | undefined) => string | null {
  const t = useT()
  return (n) => (n != null ? (t.effort.levels[n - 1] ?? null) : null)
}

function Dot({ filled }: { filled: boolean }) {
  return <span className={'effort-dots__dot' + (filled ? ' is-filled' : '')} aria-hidden="true" />
}

export function EffortDots({
  value,
  onChange,
  ariaLabel,
  size,
}: {
  value: number | null
  onChange: (next: number | null) => void
  /** The group's name; defaults to « Effort ». The finder says « Effort, au plus ». */
  ariaLabel?: string | undefined
  size?: 'sm' | undefined
}) {
  const t = useT()
  const current: Key | null = value != null && value >= 1 && value <= 5 ? (String(value) as Key) : null
  // Delete/Backspace is the keyboard's « tap the same dot again ». Everything else goes on to
  // Segmented, which owns the arrows; this wrapper has no role and takes no focus.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && current != null) {
      e.preventDefault()
      onChange(null)
    }
  }
  return (
    <div onKeyDown={onKeyDown}>
      <Segmented<Key>
        className={'effort-dots' + (size === 'sm' ? ' effort-dots--sm' : '')}
        ariaLabel={ariaLabel ?? t.effort.label}
        value={current}
        onChange={(k) => onChange(k === current ? null : Number(k))}
        options={KEYS.map((k, i) => ({
          key: k,
          label: <Dot filled={value != null && i < value} />,
          ariaLabel: t.effort.dot(i + 1, t.effort.levels[i] ?? k),
        }))}
      />
    </div>
  )
}

// The form's face: the picker behind one tap, so adding a task stays one field. The fold says
// the level while closed (LEAN invariant 1), and opens itself on a task that already has one.
export function EffortField({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
  const t = useT()
  const name = value != null ? (t.effort.levels[value - 1] ?? null) : null
  return (
    <Disclosure label={t.effort.label} {...(name ? { note: name } : {})} defaultOpen={value != null} className="effort-field">
      <EffortDots value={value} onChange={onChange} />
    </Disclosure>
  )
}

// The read-only face, for a row. Nothing at all when the effort was not said: an empty row of
// dots would read as « zero », and zero is not a value here.
export function EffortMark({ value }: { value: number | null | undefined }) {
  const t = useT()
  if (value == null || value < 1 || value > 5) return null
  const name = t.effort.levels[value - 1] ?? String(value)
  return (
    <span className="effort-mark" role="img" aria-label={t.effort.mark(name)} title={t.effort.mark(name)}>
      {KEYS.map((k, i) => (
        <Dot key={k} filled={i < value} />
      ))}
    </span>
  )
}
