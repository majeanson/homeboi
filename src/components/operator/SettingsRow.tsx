import type { ReactNode } from 'react'

// THE Réglages setting row (solidify 3.2, 2026-11-05): a label on the left, the control
// on the right, an optional hint line under the row. `.operator__seg` was spelled by
// hand 42 times across 13 files (and its label 42 more, its hint 39), with no component
// behind it — this is it. The classes stay the same (no visual change); what changes is
// that they are now spelled in ONE file (`kit-class-rule.test.ts` owns `operator__seg`
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
  return (
    <>
      <As className={'operator__seg' + (className ? ' ' + className : '')}>
        {label != null && label !== false && <span className="operator__seg-label mono">{label}</span>}
        {children}
      </As>
      {hint != null && hint !== false && <p className="operator__seg-hint mono">{hint}</p>}
    </>
  )
}
