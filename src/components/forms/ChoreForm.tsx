import { useState } from 'react'
import { api } from '../../lib/api'
import { useLang, useT } from '../../i18n'
import { ColorPicker } from '../ColorPicker'
import { choreTemplates } from '../../lib/routineTemplates'

// The complete chore (corvée) form — title (with common presets), a round-robin
// rotation of members, and a colour. Shared by Settings ▸ Chores and the Add
// sheet. Owns its POST; calls onSaved() when done.
interface FormMember {
  id: string
  display_name: string
}

export function ChoreForm({ members, onSaved }: { members: FormMember[]; onSaved: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const presets = choreTemplates(lang)
  const [title, setTitle] = useState('')
  const [rotation, setRotation] = useState<string[]>([])
  const [color, setColor] = useState('#88A36F')
  const [busy, setBusy] = useState(false)

  function toggleRot(id: string) {
    setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))
  }
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    await api('chores', { method: 'POST', body: { title: title.trim(), rotation, color } }).catch(() => {})
    setBusy(false)
    setTitle('')
    setRotation([])
    setColor('#88A36F')
    onSaved()
  }

  return (
    <form className="operator__inline-form operator__chore-form" onSubmit={add}>
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
      <button type="submit" className="btn" disabled={!title.trim() || busy}>
        {t.operator.addChore}
      </button>
    </form>
  )
}
