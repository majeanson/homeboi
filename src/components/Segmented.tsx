import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { InlineIcon, type IconName } from './Icon'

// THE value picker (solidify 3.3, 2026-11-05): one choice among a few, shown in place.
// `SubTabs` switches PANELS (role=tablist); this sets a VALUE (role=radiogroup) — a
// theme, a text size, a board view. Eight hand-rolled copies existed, each announcing
// itself as a row of independent pressed buttons; no radiogroup existed anywhere, so a
// screen reader never said « one of four ». One tab stop, arrows move and select.
//
//   <Segmented ariaLabel={…} value={v} onChange={setV}
//     options={[{ key: 'a', label: 'Un', icon: 'sun-bold' }, { key: 'b', icon: 'moon-stars-bold', ariaLabel: 'Deux' }]} />
//
// · an icon-only option MUST pass `ariaLabel` (it is also the hover title);
// · `collapse`: on a phone only the selected option keeps its word; `'icons'`: on a phone
//   every option is its glyph, the selected one too (the board view, whose row shares ONE
//   line with the clock, the date and the face — the owner, 2026-11-11). The pill's fill
//   says which; each word stays the option's accessible name and hover title;
// · `pick` / `armed`: the help-mode wrapper, same contract as SubTabs;
// · it wraps rather than overflows — a segmented control never runs off the edge.
// `MemberSwitcher` stays its own thing: a face picker, not a mode.
export interface SegmentedOption<K extends string> {
  key: K
  label?: ReactNode
  icon?: IconName
  ariaLabel?: string
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size,
  collapse = false,
  className,
  tour,
  pick,
  armed = false,
}: {
  options: ReadonlyArray<SegmentedOption<K>>
  /** null = nothing picked yet (EffortDots: « pas dit »). No option is checked. */
  value: K | null
  onChange: (key: K) => void
  ariaLabel: string
  size?: 'sm'
  collapse?: boolean | 'icons'
  className?: string
  tour?: string
  pick?: ((key: K, run: () => void) => () => void) | undefined
  armed?: boolean | undefined
}) {
  const ref = useRef<HTMLDivElement>(null)
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = options.findIndex((o) => o.key === value)
    let next = idx
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length
    // From nothing picked (idx -1), back goes to the last option, not the next-to-last.
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = idx < 0 ? options.length - 1 : (idx - 1 + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    else return
    e.preventDefault()
    const target = options[next]
    if (target && next !== idx) onChange(target.key)
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus({ preventScroll: true })
  }
  // No option selected (a value outside the list): the first takes the tab stop, so the
  // group is never unreachable by keyboard.
  const stop = options.some((o) => o.key === value) ? value : options[0]?.key
  return (
    <div
      ref={ref}
      className={
        'segmented' +
        (size === 'sm' ? ' segmented--sm' : '') +
        (collapse ? ' segmented--collapse' : '') +
        (collapse === 'icons' ? ' segmented--icons' : '') +
        (armed ? ' help-armed' : '') +
        (className ? ' ' + className : '')
      }
      role="radiogroup"
      aria-label={ariaLabel}
      data-tour={tour}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const run = () => onChange(o.key)
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            tabIndex={stop === o.key ? 0 : -1}
            className={'segmented__opt' + (value === o.key ? ' is-on' : '')}
            aria-label={o.ariaLabel}
            title={o.ariaLabel}
            onClick={pick ? pick(o.key, run) : run}
          >
            {o.icon && <InlineIcon name={o.icon} size={16} />}
            {o.label != null && <span className="segmented__label">{o.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
