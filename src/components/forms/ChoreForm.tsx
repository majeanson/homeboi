import { useState } from 'react'
import { api } from '../../lib/api'
import { useLang, useT } from '../../i18n'
import { ColorPicker } from '../ColorPicker'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { anchorSecToDate, dateToAnchorSec, recurOf, todayAnchorDate } from '../../lib/recurLabel'
import { choreTemplates } from '../../lib/routineTemplates'

// The complete chore (corvée) form — title (with common presets), a round-robin
// rotation of members, a colour, and an optional schedule. Shared by Settings ▸
// Chores and the Add sheet. Owns its POST (create) / PATCH (edit); calls
// onSaved() when done. Pass `value` to edit an existing chore in place (and a
// `key` so it re-inits when the target changes), mirroring EventForm.
interface FormMember {
  id: string
  display_name: string
}
export interface ChoreInit {
  id: string
  title: string
  color?: string
  rotation_json?: string | null
  recur_json?: string | null
  recur_start?: number | null
}

function parseRotation(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function ChoreForm({
  members,
  value,
  onSaved,
  onCancel,
}: {
  members: FormMember[]
  value?: ChoreInit | null
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const presets = choreTemplates(lang)
  const [title, setTitle] = useState(value?.title ?? '')
  const [rotation, setRotation] = useState<string[]>(parseRotation(value?.rotation_json))
  const [color, setColor] = useState(value?.color ?? '#88A36F')
  // Optional schedule — "tous les jeudis". null = a standing chore (no schedule).
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(value?.recur_json))
  // The recurrence anchor (which date "every 2 weeks" counts from). Defaults to
  // today; only sent when there's a recurrence — a standing chore has no anchor.
  const [start, setStart] = useState(anchorSecToDate(value?.recur_start) || todayAnchorDate())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  function toggleRot(id: string) {
    setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setErr(false)
    const fields = { title: title.trim(), rotation, color, recur, start: recur ? dateToAnchorSec(start) : null }
    try {
      await api('chores', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...fields } : fields,
      })
      if (!value) {
        // Create: clear for the next one. Edit: leave the fields (the section
        // closes the inline form via onSaved).
        setTitle('')
        setRotation([])
        setColor('#88A36F')
        setRecur(null)
        setStart(todayAnchorDate())
      }
      onSaved()
    } catch {
      // Keep the filled form — resetting on a failed write loses the chore.
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="operator__inline-form operator__chore-form" onSubmit={submit}>
      <div className="picker-chips mono">
        <span className="picker-chips__label">{t.operator.choreCommon}</span>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className="chip"
            onClick={() => setTitle(p.icon ? `${p.icon} ${p.label}` : p.label)}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.operator.addChore} />
      <div className="operator__rotation mono">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`btn btn--ghost${rotation.includes(m.id) ? ' is-active' : ''}`}
            onClick={() => toggleRot(m.id)}
          >
            {rotation.includes(m.id) ? `${rotation.indexOf(m.id) + 1}. ` : ''}
            {m.display_name}
          </button>
        ))}
      </div>
      <ColorPicker value={color} onChange={setColor} label={t.operator.colorLabel} />
      <RecurPicker value={recur} onChange={setRecur} />
      {recur && (
        <label className="recur__row mono">
          <span>{t.operator.choreStart}</span>
          <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
      )}
      {err && <p className="error mono">{t.common.saveFailed}</p>}
      <button type="submit" className="btn" disabled={!title.trim() || busy}>
        {value ? t.common.save : t.operator.addChore}
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </form>
  )
}
