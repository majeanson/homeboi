import { useRef, type ReactNode } from 'react'
import { useT } from '../i18n'
import type { VoiceInput } from '../lib/useVoiceInput'
import { Icon, type IconName } from './Icon'
import { VoiceButton, VoiceStatus } from './VoiceButton'

// The ONE add/edit text box. Every "type something, then act on it" spot in the
// app used to hand-roll an input + a clear ✕ + a mic + a submit + a cancel, each
// with its own wrapper class — and on a phone they stacked into a tall column of
// full-width buttons (the meal-slot add was four rows deep). EditField folds the
// clear and the mic INSIDE the field box and keeps the actions compact, then
// grows per case via props (voice, ordering, delete, a secondary chip row, a
// leading icon/emoji picker, picker menus as children).
//
// The explicit submit is optional. Enter always commits (native form submit); a
// field with no rival action can also commit on blur (commitOnBlur) and hide the
// button entirely (submitIcon={null}). A field that competes with another action
// — the meal "Mettre" vs "Choisir une recette" — keeps a small labeled button and
// leaves commitOnBlur off, so tabbing to the rival action never mis-commits.
//
// Reuses the shared primitives wholesale: Icon, VoiceButton/VoiceStatus, and the
// .btn / touch-target sizing. No new behaviour — just one calm, compact shell.

export interface EditFieldProps {
  value: string
  onChange: (v: string) => void
  /** Fired by Enter, the submit button, and (when commitOnBlur) focus-out. Gets the raw value. */
  onSubmit?: (v: string) => void
  /** Provide → a labeled submit button. Omit → an icon-only ✓ (unless submitIcon is null). */
  submitLabel?: string
  /** Icon for the icon-only submit. Pass null to hide the submit button entirely (Enter/blur only). */
  submitIcon?: IconName | null
  /** Optional leading icon on the LABELED submit button (e.g. ＋ on Liste's "Ajouter"). */
  submitLeadingIcon?: IconName
  /** Labeled submit weight: compact ghost (default) or the prominent primary CTA. */
  submitVariant?: 'sm' | 'primary'
  /** Commit when focus leaves the field (and the form). Default false. Skips empty/whitespace. */
  commitOnBlur?: boolean
  /** Renders a compact ✕ cancel at the row end. */
  onCancel?: () => void
  /** Inline ✕ inside the box while the value is non-empty. Default true. */
  clearable?: boolean
  /** From useVoiceInput → mic inside the box + a VoiceStatus line below. */
  voice?: VoiceInput
  voiceLabel?: string
  placeholder?: string
  ariaLabel?: string
  autoFocus?: boolean
  /** Disables the whole field (input + buttons). */
  disabled?: boolean
  /** Disables only the submit button (e.g. an in-flight save) — the input stays live. */
  busy?: boolean
  maxLength?: number
  /** Render a textarea instead of an input. Enter then inserts a newline (no submit). */
  multiline?: boolean
  /** Left of the field: an icon/emoji picker button or a drag handle. */
  leading?: ReactNode
  /** Standard ↑/↓ reorder pair after the field (row use). */
  reorder?: { onUp: () => void; onDown: () => void; upDisabled?: boolean; downDisabled?: boolean }
  /** Standard trash button after the field (row use). */
  onDelete?: () => void
  deleteLabel?: string
  /** A custom action rendered right after the submit (e.g. Liste's small
   *  "search the flyer" magnifier beside Ajouter). Keep it compact — style it
   *  with `edit-field__icon-btn` so it reads as a peer of the inline icons. */
  trailing?: ReactNode
  /** A thin wrapped row of secondary actions (small chips) under the field. */
  secondaryActions?: ReactNode
  /** Picker menus etc., rendered after the field block. */
  children?: ReactNode
  className?: string
}

export function EditField({
  value,
  onChange,
  onSubmit,
  submitLabel,
  submitIcon = 'check-bold',
  submitLeadingIcon,
  submitVariant = 'sm',
  commitOnBlur = false,
  onCancel,
  clearable = true,
  voice,
  voiceLabel,
  placeholder,
  ariaLabel,
  autoFocus,
  disabled,
  busy,
  maxLength,
  multiline,
  leading,
  reorder,
  onDelete,
  deleteLabel,
  trailing,
  secondaryActions,
  children,
  className,
}: EditFieldProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const commit = () => {
    if (!onSubmit || disabled || busy) return
    if (!value.trim()) return
    onSubmit(value)
  }

  // Enter (or the submit button) commits via the native form. In a textarea Enter
  // makes a newline instead — the browser never fires submit — which is what a
  // multi-line note wants.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    commit()
  }

  // Commit on focus-out only when the focus is actually leaving the field — not
  // when it hops to the cancel button or a secondary action in the SAME form
  // (which would commit-then-cancel). relatedTarget is the element gaining focus.
  const handleBlur = (e: React.FocusEvent) => {
    if (!commitOnBlur) return
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.closest('form')?.contains(next)) return
    commit()
  }

  const clear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  const showIconSubmit = !submitLabel && submitIcon != null && !!onSubmit
  const submitDisabled = disabled || busy || !value.trim()

  return (
    <form className={'edit-field' + (className ? ` ${className}` : '')} onSubmit={handleSubmit}>
      <div className="edit-field__row">
        {leading}
        <div className="edit-field__box">
          {multiline ? (
            <textarea
              ref={inputRef as React.Ref<HTMLTextAreaElement>}
              className="input edit-field__input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={handleBlur}
              placeholder={placeholder}
              aria-label={ariaLabel ?? placeholder}
              autoFocus={autoFocus}
              disabled={disabled}
              maxLength={maxLength}
            />
          ) : (
            <input
              ref={inputRef as React.Ref<HTMLInputElement>}
              className="input edit-field__input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={handleBlur}
              placeholder={placeholder}
              aria-label={ariaLabel ?? placeholder}
              autoFocus={autoFocus}
              disabled={disabled}
              maxLength={maxLength}
            />
          )}
          {clearable && value && !disabled && (
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
        </div>

        {submitLabel && (
          <button
            type="submit"
            className={`btn btn--${submitVariant} edit-field__submit`}
            disabled={submitDisabled}
          >
            {submitLeadingIcon && <Icon name={submitLeadingIcon} size={18} />}
            {submitLabel}
          </button>
        )}
        {showIconSubmit && (
          <button
            type="submit"
            className="edit-field__icon-btn edit-field__submit"
            disabled={submitDisabled}
            aria-label={submitLabel ?? t.common.save}
          >
            <Icon name={submitIcon} size={17} />
          </button>
        )}

        {trailing}

        {reorder && (
          <div className="edit-field__reorder">
            <button
              type="button"
              className="edit-field__mini"
              onClick={reorder.onUp}
              disabled={reorder.upDisabled}
              aria-label={t.operator.moveUp}
            >
              <Icon name="caret-up-bold" size={16} />
            </button>
            <button
              type="button"
              className="edit-field__mini"
              onClick={reorder.onDown}
              disabled={reorder.downDisabled}
              aria-label={t.operator.moveDown}
            >
              <Icon name="caret-down-bold" size={16} />
            </button>
          </div>
        )}

        {onDelete && (
          <button
            type="button"
            className="edit-field__icon-btn edit-field__icon-btn--danger"
            onClick={onDelete}
            aria-label={deleteLabel ?? t.common.delete}
          >
            <Icon name="trash-bold" size={17} />
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

      {secondaryActions && <div className="edit-field__secondary">{secondaryActions}</div>}
      {voice && <VoiceStatus voice={voice} />}
      {children}
    </form>
  )
}
