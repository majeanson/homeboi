import type { ReactNode } from 'react'
import { StatusMessage } from './StatusMessage'

// THE labelled form field (solidify 3.1, 2026-11-05). A control with its label above
// (or beside) it was spelled six ways — `<label className="field">` + `.field__label`,
// `cf__field` + `cf__label` in the cercle forms, `li-edit__field` + `li-edit__label` in the
// list editor, `operator__field` in Réglages, a bare `voyage-form__label` followed by its
// sibling input, and the inline `recur__row mono` (label beside a select / date) in
// every recurrence row — each with its own gap, weight and colour. One shape:
//
//   <Field label={t.x.when}><input className="input" type="date" … /></Field>
//   <Field inline className="mono" label={t.x.lead}><select className="input">…</select></Field>
//   <Field as="div" label={t.x.photo}><PhotoField … /></Field>
//
// · `as`: `label` (the default — a NATIVE control inside, so tapping the words focuses
//   it) or `div` (a composed control — a chip group, an emoji trigger, a picker — where
//   a <label> would wrap buttons: nested-interactive).
// · `inline`: label beside the control on one line (`.field--inline`, the old
//   `recur__row`): the label keeps its width, the control flexes and may shrink; a
//   native date input keeps its intrinsic minimum (misc.css carries the why).
// · `hint` sits under the control (`.field__hint`), `error` is a StatusMessage line.
// Raw date/time/number/file/select controls STAY raw `.input` / `.select` inside it —
// EditField is a TEXT box with its own furniture and is not extended to them.
// `field-rule.test.ts` fails a `<label>`/`<div>` that still carries a retired class.
export function Field({
  label,
  hint,
  error,
  htmlFor,
  inline = false,
  as: As = 'label',
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** For `as="div"`: the id of the control the label names. */
  htmlFor?: string
  inline?: boolean
  as?: 'label' | 'div'
  className?: string
  children: ReactNode
}) {
  const cls = 'field' + (inline ? ' field--inline' : '') + (className ? ' ' + className : '')
  const labelNode =
    As === 'div' && htmlFor ? (
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
    ) : (
      <span className="field__label">{label}</span>
    )
  return (
    <As className={cls}>
      {labelNode}
      {children}
      {hint != null && hint !== false && <span className="field__hint">{hint}</span>}
      {error != null && error !== false && (
        <StatusMessage tone="error" as="span" className="field__error">
          {error}
        </StatusMessage>
      )}
    </As>
  )
}
