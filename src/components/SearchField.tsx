import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Icon, InlineIcon } from './Icon'

// SearchField — THE in-page search box: a magnifier glyph, the field itself, and a
// trailing ✕. One component so the hand-rolled "magnifier + input + clear" rows
// (the cercle notes search, the recipe book) stop drifting apart.
//
// `collapsible` is the LEAN face: the row shows only a round magnifier button
// until it's tapped, then the field expands in place (autofocused) and takes the
// row's width. It collapses again when it loses focus while EMPTY — a narrowed
// list never silently loses its query, and an untouched page never spends a full
// line on an empty box. Escape clears + collapses.
//
// Desktop-reachable by construction: the collapsed state is a real <button>
// (tab + Enter), never a tap-only affordance.
export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  collapsible = false,
  autoFocus = false,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Accessible name for both the field and the collapsed magnifier button. */
  ariaLabel: string
  /** Start as an icon-only button and expand on tap (the lean, calm face). */
  collapsible?: boolean
  /** Focus the field on mount (an always-open field that IS the page's job). */
  autoFocus?: boolean
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  // A non-empty query always keeps the field visible — collapsing it would hide
  // WHY the list below is narrowed.
  const expanded = !collapsible || open || value !== ''

  // Focus the field the moment it expands (a tap on the magnifier should land the
  // caret — otherwise it costs two taps). Not on the first paint of an always-open
  // field, which would steal focus from the page.
  const wasExpanded = useRef(expanded)
  useEffect(() => {
    if (expanded && !wasExpanded.current) inputRef.current?.focus()
    wasExpanded.current = expanded
  }, [expanded])

  if (!expanded) {
    return (
      <button
        type="button"
        className={'searchfield__open' + (className ? ` ${className}` : '')}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        aria-expanded={false}
        aria-controls={id}
        title={ariaLabel}
      >
        <Icon name="magnifying-glass-bold" size={18} />
      </button>
    )
  }
  return (
    <div className={'searchfield' + (className ? ` ${className}` : '')} id={id}>
      <InlineIcon name="magnifying-glass-bold" size={16} />
      <input
        ref={inputRef}
        className="searchfield__input"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          onChange('')
          setOpen(false)
        }}
        // Collapse only when nothing was typed: an empty box that lost focus is
        // just clutter, a filled one is the reason the list looks the way it does.
        onBlur={() => {
          if (value === '') setOpen(false)
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {(value !== '' || collapsible) && (
        <button
          type="button"
          className="searchfield__clear"
          // The blur handler above would collapse the row out from under this
          // click; killing the mousedown default keeps focus (and the button) put.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('')
            setOpen(false)
          }}
          aria-label={t.common.close}
        >
          <Icon name="x-bold" size={13} />
        </button>
      )}
    </div>
  )
}
