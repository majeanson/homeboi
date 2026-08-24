import { useDeferredValue, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { fold } from '../lib/normalize'
import { bumpFrequent, frequentScores } from '../lib/frequents'
import { isGuest } from '../lib/device'
import type { VoiceInput } from '../lib/useVoiceInput'
import { Icon, InlineIcon, type IconName } from './Icon'
import { VoiceButton, VoiceStatus } from './VoiceButton'

// The ONE "choose an existing thing, OR just type a new one" control. Across the
// kitchen we used to split that flow in two: a free-text box on one side, and a
// separate toggle that unfolded a search-list on the other ("Choisir une
// recette" / "Choisir un reste" / the recent-meals chip strip). You couldn't tell
// the box would also *search*, and picking vs typing felt like two different
// features. EntityCombobox folds them into a single field: as you type it filters
// a dropdown of options (recipes, leftovers, recent meals…), you can tap one to
// link it, OR press Enter / the submit button to keep your free text. Clearable ✕,
// optional mic, a caret that opens the full list like a selectbox — searchable,
// clearable, free-text, all in one box.
//
// Visually it reuses the EditField box shell (`.edit-field*`) so a combobox reads
// as the same field as every other add/edit row; the dropdown reuses the picker
// row look. It is NOT a <form> (Enter is handled here) so it can nest inside one
// (e.g. the ＋ sheet) without an invalid nested form, and so arrow-key navigation
// works.

export interface ComboOption<T = unknown> {
  /** Stable id — list keys + active-row tracking. */
  id: string
  /** Visible text; also what `onPick` hands back as the label. */
  label: string
  /** The underlying entity (a Recipe, Leftover, MealRow…) handed to `onPick`. */
  data: T
  /** Optional group heading — consecutive options sharing one render under it. */
  group?: string
  /** Leading picto inside the row. */
  icon?: IconName
  iconColor?: string
  /** Route for the picto: it leaves the row and becomes its own small icon-only
   *  link to the entity's page (a recipe row → `/kitchen/recipe/:id`). Deliberately
   *  a tight hit area so tapping anywhere else on the row still picks the option. */
  iconTo?: string
  /** Accessible label for that link. Defaults to the option's `label`. */
  iconToLabel?: string
  /** Right-aligned badge (cookability "Prêt" / "il manque 2", a date…). */
  badge?: ReactNode
  /** Faint second line under the label: what this option CONTAINS, so you can read
   *  before you commit (a todo template's items, "Clés · Portefeuille · +2").
   *  Clamped to two lines — keep the authoritative total in `badge`, since a long
   *  hint is truncated. Always visible: a hover-only preview would be unreachable
   *  on the wall tablet, where a tap on the row picks it outright. */
  hint?: ReactNode
  /** Extra strings folded into the type-to-filter match (e.g. recipe ingredients). */
  keywords?: string[]
}

// Type-to-filter with a two-tier rank: a needle found in the option's NAME beats
// one found only in its keywords — searching « poulet » in the meal slot must lead
// with the recipes *called* poulet, and let the ones that merely contain chicken
// trail. Each tier keeps the caller's order (recipes arrive cookable-ranked), and
// the partition runs within each contiguous group block so headings stay whole.
// Pure + exported for the unit test.
export function filterComboOptions<T>(options: ComboOption<T>[], rawNeedle: string): ComboOption<T>[] {
  const needle = fold(rawNeedle.trim())
  if (!needle) return options
  const out: ComboOption<T>[] = []
  let byName: ComboOption<T>[] = []
  let byKeyword: ComboOption<T>[] = []
  let group: string | undefined
  const flush = () => {
    out.push(...byName, ...byKeyword)
    byName = []
    byKeyword = []
  }
  options.forEach((o, i) => {
    if (i > 0 && o.group !== group) flush()
    group = o.group
    if (fold(o.label).includes(needle)) byName.push(o)
    else if ((o.keywords ?? []).some((k) => fold(k).includes(needle))) byKeyword.push(o)
  })
  flush()
  return out
}

export interface EntityComboboxProps<T> {
  value: string
  onChange: (v: string) => void
  options: ComboOption<T>[]
  /** Picked an existing option from the dropdown. */
  onPick: (opt: ComboOption<T>) => void
  /** Committed the free text (Enter, the submit button, or commitOnBlur). */
  onSubmit?: (text: string) => void
  /** Provide → a labelled submit button. Omit → an icon-only ✓ (unless submitIcon null). */
  submitLabel?: string
  /** Icon for the icon-only submit. Pass null to hide the submit entirely (Enter only). */
  submitIcon?: IconName | null
  submitLeadingIcon?: IconName
  submitVariant?: 'sm' | 'primary'
  /** A SECOND commit button beside the primary submit — same free text, a different
   *  destination (e.g. the board todo card's « Pour ajd » pins to today, not global).
   *  Requires `secondaryLabel`; disabled/gated exactly like the primary submit. */
  secondaryLabel?: ReactNode
  onSecondary?: (text: string) => void
  secondaryLeadingIcon?: IconName
  /** Compact ✕ cancel at the row end (closes an inline editor). */
  onCancel?: () => void
  placeholder?: string
  ariaLabel?: string
  /** Shown in the dropdown when nothing matches (free text still commits). */
  noMatchLabel?: string
  voice?: VoiceInput
  voiceLabel?: string
  autoFocus?: boolean
  /** Disables only the submit (e.g. an in-flight save); the input stays live. */
  busy?: boolean
  disabled?: boolean
  maxLength?: number
  /** A control rendered above the option list (e.g. the supper "+ ingrédients" opt-in). */
  listHeader?: ReactNode
  /** Pure type-ahead: the dropdown ONLY appears while there's typed text that
   *  matches — no caret, no open-on-focus. For fields whose existing values are
   *  already shown elsewhere (e.g. tag chips) and the list is just a "did you mean
   *  this existing one?" guard against near-duplicates. */
  typeaheadOnly?: boolean
  /** Frequents-first (C-20, bmad/08): a scope name ('meal', 'event-who'…) turns on
   *  per-device pick-ranking — often-picked options rise to the top of the RESTING
   *  list (no typed filter), each group block reordered within itself so headings
   *  stay honest. Typing keeps the caller's order untouched. Opt-in per call site
   *  so unrelated domains never share a counter; option ids must be stable. */
  frequentsKey?: string
  className?: string
  /** Hide the whole control. Defaults to the read-only guest session. */
  readOnly?: boolean
}

export function EntityCombobox<T>({
  value,
  onChange,
  options,
  onPick,
  onSubmit,
  submitLabel,
  submitIcon = 'check-bold',
  submitLeadingIcon,
  submitVariant = 'sm',
  secondaryLabel,
  onSecondary,
  secondaryLeadingIcon,
  onCancel,
  placeholder,
  ariaLabel,
  noMatchLabel,
  voice,
  voiceLabel,
  autoFocus,
  busy,
  disabled,
  maxLength,
  listHeader,
  typeaheadOnly,
  frequentsKey,
  className,
  readOnly,
}: EntityComboboxProps<T>) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // After the hooks (rules-of-hooks): a guest never sees an add/edit control.
  const hidden = readOnly ?? isGuest()

  // Frequents-first (C-20): with a frequentsKey, the RESTING list leads with what
  // this device actually picks. Each contiguous group block is reordered within
  // itself (stable sort, unscored options keep their relative order), so group
  // headings stay contiguous and the caller's block order is untouched.
  const ranked = useMemo(() => {
    if (!frequentsKey || options.length < 2) return options
    const scores = frequentScores(frequentsKey)
    if (Object.keys(scores).length === 0) return options
    const out: ComboOption<T>[] = []
    let block: { opt: ComboOption<T>; i: number }[] = []
    let group: string | undefined
    const flush = () => {
      block.sort((a, b) => (scores[b.opt.id] ?? 0) - (scores[a.opt.id] ?? 0) || a.i - b.i)
      out.push(...block.map((b) => b.opt))
      block = []
    }
    options.forEach((opt, i) => {
      if (opt.group !== group) {
        flush()
        group = opt.group
      }
      block.push({ opt, i })
    })
    flush()
    return out
  }, [options, frequentsKey])

  // Filter on the typed value: name matches lead, keyword-only matches trail
  // (filterComboOptions above) — frequents only shape the resting list, never
  // the search results. The needle is DEFERRED so a keystroke paints the input
  // immediately and the (possibly large) list re-filter rides a lower-priority
  // render — the dropdown lags a frame behind fast typing instead of the caret
  // lagging.
  const deferredValue = useDeferredValue(value)
  const shown = useMemo(() => {
    if (!deferredValue.trim()) return ranked
    return filterComboOptions(options, deferredValue)
  }, [options, ranked, deferredValue])
  // The active highlight indexes into a list that can lag the input — clamp so
  // Enter can never pick past the end of the freshly-shrunk list.
  const activeIdx = active < shown.length ? active : -1

  const commit = () => {
    if (!onSubmit || disabled || busy) return
    if (!value.trim()) return
    onSubmit(value)
  }

  const commitSecondary = () => {
    if (!onSecondary || disabled || busy) return
    if (!value.trim()) return
    onSecondary(value)
  }

  const pick = (opt: ComboOption<T>) => {
    setOpen(false)
    setActive(-1)
    if (frequentsKey) bumpFrequent(frequentsKey, opt.id)
    onPick(opt)
  }

  const clear = () => {
    onChange('')
    setActive(-1)
    inputRef.current?.focus()
    setOpen(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Mid-IME-composition keys steer the composition, not the dropdown — Enter
    // here confirms the composed text, never a pick/commit (keyCode 229 = the
    // legacy IME signal).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (shown.length) setActive((i) => (i + 1) % shown.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (open && shown.length) setActive((i) => (i <= 0 ? shown.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      // A highlighted option links it; otherwise Enter keeps the free text.
      e.preventDefault()
      if (open && activeIdx >= 0) pick(shown[activeIdx])
      else commit()
    } else if (e.key === 'Escape') {
      // First Esc closes the dropdown; if it's already closed, let the editor cancel.
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        setActive(-1)
      } else if (onCancel) {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
  }

  // Close when focus truly leaves the control (not when it hops to an option
  // button or the submit, which live inside the same wrapper).
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    // iOS can fire a spurious blur (relatedTarget null) when focusing a field at
    // the bottom of a page pops the keyboard and the page scroll-pins it. Defer
    // and re-check: if focus is still (or already back) inside the control, that
    // was the churn — keep the dropdown open instead of snapping it shut mid-tap.
    const wrap = e.currentTarget
    window.setTimeout(() => {
      if (wrap.isConnected && wrap.contains(document.activeElement)) return
      setOpen(false)
      setActive(-1)
    }, 0)
  }

  const showIconSubmit = !submitLabel && submitIcon != null && !!onSubmit
  const submitDisabled = disabled || busy || !value.trim()
  // In type-ahead mode the list only exists while there's text to match against,
  // so an empty/focused field stays quiet (the chips above already show what's set).
  const canOpen = typeaheadOnly ? !!value.trim() : true
  const listOpen = open && canOpen && !disabled && (shown.length > 0 || (!!value.trim() && !!noMatchLabel))

  if (hidden) return null

  return (
    <div
      className={'edit-field combobox' + (className ? ` ${className}` : '')}
      onBlur={handleBlur}
    >
      <div className="edit-field__row">
        <div className="edit-field__box">
          <input
            ref={inputRef}
            className="input edit-field__input"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIdx >= 0 && shown[activeIdx] ? `${listId}-${shown[activeIdx].id}` : undefined}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setActive(-1)
              setOpen(true)
            }}
            onFocus={() => !typeaheadOnly && setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel ?? placeholder}
            autoFocus={autoFocus}
            disabled={disabled}
            maxLength={maxLength}
          />
          {value && !disabled && (
            <button
              type="button"
              className="edit-field__icon-btn"
              onClick={clear}
              aria-label={t.kitchen.clearText}
              title={t.kitchen.clearText}
            >
              <Icon name="x-bold" size={15} />
            </button>
          )}
          {voice && <VoiceButton voice={voice} label={voiceLabel ?? t.capture.voice} />}
          {options.length > 0 && !typeaheadOnly && (
            <button
              type="button"
              className="edit-field__icon-btn combobox__caret"
              // Toggle the list WITHOUT focusing the input — focusing it would pop
              // the on-screen keyboard on a tablet/phone. The caret button itself
              // lives inside the wrapper, so it holds focus and the menu stays open
              // (the wrapper's onBlur only fires when focus leaves the control).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? t.combo.hide : t.combo.show}
              title={open ? t.combo.hide : t.combo.show}
              aria-expanded={listOpen}
              tabIndex={-1}
            >
              <Icon name={open ? 'caret-up-bold' : 'caret-down-bold'} size={15} />
            </button>
          )}
        </div>

        {submitLabel && (
          <button
            type="button"
            className={`btn btn--${submitVariant} edit-field__submit`}
            disabled={submitDisabled}
            onClick={commit}
          >
            {submitLeadingIcon && <Icon name={submitLeadingIcon} size={18} />}
            {submitLabel}
          </button>
        )}
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            className={`btn btn--${submitVariant} edit-field__submit`}
            disabled={submitDisabled}
            onClick={commitSecondary}
          >
            {secondaryLeadingIcon && <Icon name={secondaryLeadingIcon} size={18} />}
            {secondaryLabel}
          </button>
        )}
        {showIconSubmit && (
          <button
            type="button"
            className="edit-field__icon-btn edit-field__submit"
            disabled={submitDisabled}
            onClick={commit}
            aria-label={submitLabel ?? t.common.save}
          >
            <Icon name={submitIcon} size={17} />
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            className="edit-field__icon-btn"
            onClick={onCancel}
            aria-label={t.common.cancel}
            title={t.common.cancel}
          >
            <Icon name="x-bold" size={16} />
          </button>
        )}
      </div>

      {voice && <VoiceStatus voice={voice} />}

      {listOpen && (
        <div className="combobox__menu">
          {listHeader}
          {shown.length === 0 ? (
            <p className="combobox__empty mono">{noMatchLabel}</p>
          ) : (
            <ul className="combobox__list" id={listId} role="listbox">
              {shown.map((o, i) => {
                // A group heading prints once, when this option's group differs
                // from the previous shown option's (caller keeps groups contiguous).
                const heading = o.group && o.group !== shown[i - 1]?.group ? o.group : null
                const row = (
                  <button
                    type="button"
                    id={`${listId}-${o.id}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    className={'combobox__row' + (i === activeIdx ? ' is-active' : '')}
                    onPointerEnter={() => setActive(i)}
                    // Keep the input focused on press so the wrapper's onBlur
                    // never fires (relatedTarget is null on touch / Safari when a
                    // button isn't focused), which would unmount the menu before
                    // this click lands — the pick would silently no-op.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o)}
                  >
                    <span className="combobox__row-main">
                      <span className="combobox__row-title">
                        {o.icon && !o.iconTo && (
                          <>
                            <InlineIcon name={o.icon} size={14} color={o.iconColor} />{' '}
                          </>
                        )}
                        {o.label}
                      </span>
                      {o.hint && <span className="combobox__row-hint">{o.hint}</span>}
                    </span>
                    {o.badge}
                  </button>
                )
                return (
                  <li key={o.id} role="presentation">
                    {heading && <p className="combobox__group mono">{heading}</p>}
                    {o.icon && o.iconTo ? (
                      <div className="combobox__opt" role="presentation">
                        <Link
                          to={o.iconTo}
                          className="combobox__open"
                          aria-label={o.iconToLabel ?? o.label}
                          title={o.iconToLabel ?? o.label}
                          onMouseDown={(e) => e.preventDefault()}
                          style={o.iconColor ? { color: o.iconColor } : undefined}
                        >
                          <Icon name={o.icon} size={16} />
                        </Link>
                        {row}
                      </div>
                    ) : (
                      row
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
