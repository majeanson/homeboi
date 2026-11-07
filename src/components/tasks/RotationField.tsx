import { useState } from 'react'
import { useOperatorT } from '../../i18n.operator'
import { MemberPicker } from '../MemberPicker'
import { type MemberFace } from '../MemberSwitcher'

// « Qui ? », for any task: nobody, one person, or, on a recurring task, « chacun son tour ».
// Rotation is a checkbox on the schedule, not a type of task (plan de la tâche unifiée): tick
// it and the faces take turns, in the order they were tapped, and the ordinal shows who
// starts. Untick it and the first face keeps the task. The chore form and the home-project
// form share this, because they write the same `rotation` to the same code path.
export function RotationField({
  faces,
  value,
  onChange,
  recurring,
}: {
  faces: readonly MemberFace[]
  value: readonly string[]
  onChange: (next: string[]) => void
  recurring: boolean
}) {
  const o18n = useOperatorT()
  const [turns, setTurns] = useState(value.length > 1)
  const rotating = recurring && turns

  function toggle(id: string) {
    if (rotating) onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
    else onChange(value.includes(id) ? [] : [id])
  }

  return (
    <>
      <MemberPicker faces={[...faces]} values={[...value]} onToggle={toggle} ariaLabel={o18n.forWho} ordinals={rotating} />
      {recurring && (
        <>
          <label className="operator__check mono">
            <input
              type="checkbox"
              checked={turns}
              onChange={(e) => {
                setTurns(e.target.checked)
                if (!e.target.checked) onChange(value.slice(0, 1))
              }}
            />
            {o18n.rotationLabel}
          </label>
          <p className="operator__seg-hint mono">{o18n.rotationHint}</p>
        </>
      )}
    </>
  )
}
