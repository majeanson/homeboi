import { useState } from 'react'
import { useT } from '../../i18n'
import { ColorPicker } from '../ColorPicker'
import { FormFooter } from '../FormFooter'
import type { GroupKind } from '../../lib/cercle'

export interface GroupFormValue {
  name: string
  kind: GroupKind
  colour: string | null
}

// The name + kind + colour editor for a « Le cercle » named group, shared by the
// create flow (bottom of the directory) and the inline edit on a group header.
// Colour reuses the app-wide ColorPicker (PALETTE dots); an unpicked colour ('')
// means "default rose" — the backend stores null and the dot falls back to ACCENT.
export function GroupForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  initial?: Partial<GroupFormValue>
  submitLabel: string
  onSubmit: (v: GroupFormValue) => void
  onCancel: () => void
  /** Only where the form is revealed IN PLACE by a tap (the inline edit, the chip in the
   *  contact form). Never inside the ＋ chooser's dialog: a dialog opening does not summon
   *  the keyboard (autofocus.test.ts). */
  autoFocus?: boolean
}) {
  const t = useT()
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<GroupKind>(initial?.kind ?? 'other')
  const [colour, setColour] = useState<string>(initial?.colour ?? '')

  const submit = () => {
    const nm = name.trim()
    if (nm) onSubmit({ name: nm, kind, colour: colour || null })
  }

  return (
    <div className="cercle-new-group">
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.cercle.groupName}
        autoFocus={autoFocus}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <select className="cf__input" value={kind} onChange={(e) => setKind(e.target.value as GroupKind)}>
        {(['family', 'friends', 'work', 'other'] as GroupKind[]).map((k) => (
          <option key={k} value={k}>
            {t.cercle.groupKinds[k]}
          </option>
        ))}
      </select>
      <ColorPicker value={colour} onChange={setColour} label={t.cercle.groupColour} />
      <FormFooter saveType="button" onSave={submit} saveLabel={submitLabel} saveDisabled={!name.trim()} onCancel={onCancel} />
    </div>
  )
}
