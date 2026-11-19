import { createContext, useContext, useId, type ReactNode } from 'react'

// THE Réglages setting row (solidify 3.2, 2026-11-05): a label on the left, the control
// on the right, an optional hint line under the row. `.operator__seg` was spelled by
// hand 42 times across 13 files (and its label 42 more, its hint 39), with no component
// behind it — this is it. The classes stay the same (no visual change); what changes is
// that they are now spelled in ONE file (`babillard/class-owner` (lint) owns `operator__seg`
// and `operator__seg-label`).
//
//   <SettingsRow label={o18n.themeLabel} hint={o18n.themeHint}>
//     <Toggle … />
//   </SettingsRow>
//
// · `as="label"` when the control is NATIVE (a select, an input): the words focus it.
//   Default `div` — most rows hold a Toggle / a button group / a Chip row, and a <label>
//   around buttons forwards a tap on the words to the first one.
// · `hint` renders AFTER the row (a sibling `<p>`, the shape every site already had), so
//   the row's flex stays label + control.
// · no `label`: a bare row container (a status line that must align with the rows).
//
// WHAT a screen reader hears (review #32, 2026-11-18; Sam: « Activée, bouton bascule,
// enfoncé » — never WHAT is on). The label and hint carry ids: a `div` row is a group
// named by its label and described by its hint, and a control that knows the row (Toggle
// reads `useSettingsRow()`) is named « <label> <its state> ». A `label` row already
// names its native control by wrapping it.
interface RowIds {
  labelId?: string | undefined
  hintId?: string | undefined
}
const RowCtx = createContext<RowIds>({})
export const useSettingsRow = (): RowIds => useContext(RowCtx)

export function SettingsRow({
  label,
  hint,
  as: As = 'div',
  className,
  children,
}: {
  label?: ReactNode
  hint?: ReactNode
  as?: 'div' | 'label'
  className?: string
  children?: ReactNode
}) {
  const id = useId()
  const hasLabel = label != null && label !== false
  const hasHint = hint != null && hint !== false
  const ids: RowIds = { labelId: hasLabel ? `${id}-l` : undefined, hintId: hasHint ? `${id}-h` : undefined }
  const group = As === 'div' && hasLabel ? { role: 'group', 'aria-labelledby': ids.labelId, 'aria-describedby': ids.hintId } : {}
  return (
    <RowCtx.Provider value={ids}>
      <As className={'operator__seg' + (className ? ' ' + className : '')} {...group}>
        {hasLabel && (
          <span id={ids.labelId} className="operator__seg-label mono">
            {label}
          </span>
        )}
        {children}
      </As>
      {hasHint && (
        <p id={ids.hintId} className="operator__seg-hint mono">
          {hint}
        </p>
      )}
    </RowCtx.Provider>
  )
}
