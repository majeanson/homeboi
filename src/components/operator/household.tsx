import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useUndoableRemove } from '../../lib/undoRemove'
import { PALETTE } from '../../lib/colors'
import { resizeImage, AVATAR_MAX } from '../../lib/image'
import { Avatar } from '../Avatar'
import { ColorPicker } from '../ColorPicker'
import { type Member } from './types'

export function MembersSection({ members, onChange }: { members: Member[]; onChange: () => void }) {
  const t = useT()
  const undoableRemove = useUndoableRemove()
  const [name, setName] = useState('')
  const [isChild, setIsChild] = useState(false)
  // Default each new person to the next unused palette colour, so a household
  // fills out colour-distinct without anyone having to think about it.
  const [color, setColor] = useState(PALETTE[members.length % PALETTE.length])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await api('members', { method: 'POST', body: { name: name.trim(), isChild, color } }).catch(() => {})
    setName('')
    setIsChild(false)
    setColor(PALETTE[(members.length + 1) % PALETTE.length])
    onChange()
  }
  function remove(m: Member) {
    undoableRemove({
      queryKey: ['members'],
      listProp: 'members',
      id: m.id,
      label: m.display_name,
      commit: () => api('members', { method: 'DELETE', body: { id: m.id } }),
      after: onChange,
    })
  }
  // Set a face from the phone (camera or gallery): resize small, upload, refresh.
  async function setPhoto(id: string, file: File) {
    const blob = await resizeImage(file, AVATAR_MAX)
    await api(`members/avatar?id=${id}`, { method: 'POST', body: blob }).catch(() => {})
    onChange()
  }
  async function clearPhoto(id: string) {
    await api('members', { method: 'PATCH', body: { id, clearPhoto: true } }).catch(() => {})
    onChange()
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.members}</h2>
      {/* A brand-new household (fresh signup) lands here with nobody in it yet —
          three calm steps instead of a bare empty list. Disappears with the
          first member; never comes back. */}
      {members.length === 0 && (
        <div className="welcome-steps">
          <p className="welcome-steps__title">{t.operator.welcomeTitle}</p>
          <ol className="welcome-steps__list">
            <li>{t.operator.welcomeStep1}</li>
            <li>
              {t.operator.welcomeStep2}{' '}
              <Link to="/settings#devices" className="mono">
                {t.operator.devices}
              </Link>
            </li>
            <li>
              {t.operator.welcomeStep3}{' '}
              <Link to="/board" className="mono">
                {t.operator.welcomeBoard}
              </Link>
            </li>
          </ol>
        </div>
      )}
      <ul className="member-cards">
        {members.map((m) => (
          <li key={m.id} className="member-card surface">
            <Avatar kind={m.avatar_kind} photo={m.avatar_ref} colour={m.colour} name={m.display_name} size={64} />
            <span className="member-card__name">{m.display_name}</span>
            {m.is_child ? <span className="tag mono">{t.operator.isChild}</span> : null}
            <div className="member-card__actions">
              <label className="btn btn--ghost mono operator__photo" title={t.operator.photo}>
                📷
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label={t.operator.photo}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setPhoto(m.id, f)
                    e.target.value = ''
                  }}
                />
              </label>
              {m.avatar_kind === 'photo' && (
                <button
                  type="button"
                  className="btn btn--ghost mono"
                  onClick={() => clearPhoto(m.id)}
                  aria-label={t.operator.removePhoto}
                >
                  ✕
                </button>
              )}
              <button type="button" className="btn btn--ghost mono" onClick={() => remove(m)}>
                {t.operator.delete}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="operator__inline-form" onSubmit={add}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.operator.name}
        />
        <label className="operator__check mono">
          <input type="checkbox" checked={isChild} onChange={(e) => setIsChild(e.target.checked)} />
          {t.operator.isChild}
        </label>
        <ColorPicker value={color} onChange={setColor} label={t.operator.colorLabel} />
        <button type="submit" className="btn" disabled={!name.trim()}>
          {t.operator.addMember}
        </button>
      </form>
    </section>
  )
}
