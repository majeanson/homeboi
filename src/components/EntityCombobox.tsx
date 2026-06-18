import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
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
  /** Right-aligned badge (cookability "Prêt" / "il manque 2", a date…). */
  badge?: ReactNode
  /** Extra strings folded into the type-to-filter match (e.g. recipe ingredients). */
  keywords?: string[]
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
  className?: string
  /** Hide the whole control. Defaults to the read-only guest session. */
  readOnly?: boolean
}

// Accent-insensitive, case-insensitive needle (Québécois: souper vs soupér…).
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

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

  // Filter on the typed value; keep the caller's order (recipes arrive ranked).
  const shown = useMemo(() => {
    const needle = fold(value.trim())
    if (!needle) return options
    return options.filter(
      (o) => fold(o.label).includes(needle) || (o.keywords ?? []).some((k) => fold(k).includes(needle)),
    )
  }, [options, value])

  const commit = () => {
    if (!onSubmit || disabled || busy) return
    if (!value.trim()) return
    onSubmit(value)
  }

  const pick = (opt: ComboOption<T>) => {
    setOpen(false)
    setActive(-1)
    onPick(opt)
  }

  const clear = () => {
    onChange('')
    setActive(-1)
    inputRef.current?.focus()
    setOpen(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      if (open && active >= 0 && active < shown.length) pick(shown[active])
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
    setOpen(false)
    setActive(-1)
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
            aria-activedescendant={active >= 0 && shown[active] ? `${listId}-${shown[active].id}` : undefined}
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
              onClick={() => {
                setOpen((o) => !o)
                inputRef.current?.focus()
              }}
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
                return (
                  <li key={o.id} role="presentation">
                    {heading && <p className="combobox__group mono">{heading}</p>}
                    <button
                      type="button"
                      id={`${listId}-${o.id}`}
                      role="option"
                      aria-selected={i === active}
                      className={'combobox__row' + (i === active ? ' is-active' : '')}
                      onPointerEnter={() => setActive(i)}
                      // Keep the input focused on press so the wrapper's onBlur
                      // never fires (relatedTarget is null on touch / Safari when a
                      // button isn't focused), which would unmount the menu before
                      // this click lands — the pick would silently no-op.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o)}
                    >
                      <span className="combobox__row-title">
                        {o.icon && (
                          <>
                            <InlineIcon name={o.icon} size={14} color={o.iconColor} />{' '}
                          </>
                        )}
                        {o.label}
                      </span>
                      {o.badge}
                    </button>
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
