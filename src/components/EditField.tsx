import { useRef, type ReactNode } from 'react'
import { useT } from '../i18n'
import { isGuest } from '../lib/device'
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
  /** A quiet glyph INSIDE the box, left of the text (what `.sheet__field` used to
   *  draw by hand). Decorative — the field's aria-label carries the meaning. */
  leadingIcon?: IconName
  /** Extra affordances INSIDE the box, after the mic — a peer of the clear ✕ and
   *  the mic, not a row action. The attach 📎 (useMemoAttach) rides here. Style
   *  them with `edit-field__icon-btn` so all three read as one field. */
  boxActions?: ReactNode
  /** Commit even when the text is empty — for a field whose payload can come from
   *  somewhere else (an attached memo). The HOST must then reject a truly empty
   *  submit; EditField only stops guarding on `value`. */
  allowEmpty?: boolean
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
  /** Hide the whole field. Defaults to the read-only guest session, so a guest
   *  never sees an add/edit box. Pass `false` to force-show in a guest context. */
  readOnly?: boolean
  /** Render as a `<form>` (default; owns native submit) or a plain `<div>` to
   *  embed inside a larger composite `<form>` — nesting `<form>` is invalid HTML.
   *  In 'div' mode Enter commits via onKeyDown and the submit buttons become
   *  `type="button"`, so the host form keeps its single bottom submit. */
  as?: 'form' | 'div'
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
  leadingIcon,
  boxActions,
  allowEmpty = false,
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
  readOnly,
  as = 'form',
}: EditFieldProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  // After the hooks (rules-of-hooks): a guest sees no add/edit box at all.
  const hidden = readOnly ?? isGuest()
  const isForm = as === 'form'

  const commit = () => {
    if (!onSubmit || disabled || busy) return
    if (!value.trim() && !allowEmpty) return
    onSubmit(value)
  }

  // Enter (or the submit button) commits via the native form. In a textarea Enter
  // makes a newline instead — the browser never fires submit — which is what a
  // multi-line note wants.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    commit()
  }

  // In div mode there is no native form submit; route Enter → commit ourselves.
  // preventDefault() also cancels the host composite <form>'s implicit submit (which
  // would otherwise fire on the FIRST Enter). Multiline keeps Enter = newline.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Mid-IME-composition Enter confirms the composition, not the field — commit
    // only on the real keystroke (keyCode 229 = the legacy IME signal).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (isForm || multiline) return
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }

  // Commit on focus-out only when the focus is actually leaving the field — not
  // when it hops to the cancel button or a secondary action in the SAME field
  // (which would commit-then-cancel). relatedTarget is the element gaining focus.
  // Scope on `.edit-field` (the root in BOTH modes), never `form`: in div mode
  // `closest('form')` resolves to the OUTER composite form, so a blur to any
  // sibling host field would wrongly suppress the commit.
  // `allowEmpty` deliberately does NOT relax this: a blur is an ambient event, and
  // auto-committing an empty field on focus-out would fire on every stray tap.
  // Only an explicit Enter / submit press may commit an empty (attachment-only) value.
  const handleBlur = (e: React.FocusEvent) => {
    if (!commitOnBlur || !value.trim()) return
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.closest('.edit-field')?.contains(next)) return
    commit()
  }

  const clear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  const showIconSubmit = !submitLabel && submitIcon != null && !!onSubmit
  const submitDisabled = disabled || busy || (!value.trim() && !allowEmpty)

  if (hidden) return null

  const rootClass = 'edit-field' + (className ? ` ${className}` : '')
  const body = (
    <>
      <div className="edit-field__row">
        {leading}
        <div className="edit-field__box">
          {leadingIcon && (
            <span className="edit-field__lead" aria-hidden="true">
              <Icon name={leadingIcon} size={20} />
            </span>
          )}
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
              onKeyDown={handleKeyDown}
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
          {boxActions}
        </div>

        {submitLabel && (
          <button
            type={isForm ? 'submit' : 'button'}
            onClick={isForm ? undefined : commit}
            className={`btn btn--${submitVariant} edit-field__submit`}
            disabled={submitDisabled}
          >
            {submitLeadingIcon && <Icon name={submitLeadingIcon} size={18} />}
            {submitLabel}
          </button>
        )}
        {showIconSubmit && (
          <button
            type={isForm ? 'submit' : 'button'}
            onClick={isForm ? undefined : commit}
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
    </>
  )

  // <form> owns native submit (Enter/button); <div> embeds inside a host form
  // and commits via onKeyDown / button onClick instead (no nested <form>).
  return isForm ? (
    <form className={rootClass} onSubmit={handleSubmit}>
      {body}
    </form>
  ) : (
    <div className={rootClass}>{body}</div>
  )
}
