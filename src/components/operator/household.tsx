import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useConfirm } from '../../lib/confirm'
import { PALETTE } from '../../lib/colors'
import { resizeImage, AVATAR_MAX } from '../../lib/image'
import { Avatar } from '../Avatar'
import { ColorPicker } from '../ColorPicker'
import { Icon } from '../Icon'
import { RowActions } from '../RowActions'
import { type Member } from './types'

export function MembersSection({ members, onChange }: { members: Member[]; onChange: () => void }) {
  const t = useT()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [isChild, setIsChild] = useState(false)
  const [busy, setBusy] = useState(false)
  // Default each new person to the next unused palette colour, so a household
  // fills out colour-distinct without anyone having to think about it.
  const [color, setColor] = useState(PALETTE[members.length % PALETTE.length])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await api('members', { method: 'POST', body: { name: name.trim(), isChild, color } })
      setName('')
      setIsChild(false)
      setColor(PALETTE[(members.length + 1) % PALETTE.length])
    } catch {
      // Keep the typed name — a double-Enter or flaky wifi shouldn't eat it
      // (and must not create the member twice).
    } finally {
      setBusy(false)
    }
    onChange()
  }
  // Deleting a member cascades (their routines go; events/chores detach) — a
  // HEAVY delete, so it asks first via the in-app confirm dialog rather than the
  // forgiving undo toast the lighter rows use.
  async function remove(m: Member) {
    const okay = await confirm({
      message: t.operator.deleteMemberConfirm(m.display_name),
      confirmLabel: t.operator.deleteMember,
      tone: 'danger',
    })
    if (!okay) return
    await api('members', { method: 'DELETE', body: { id: m.id } }).catch(() => {})
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
              <Link to="/settings?tab=devices" className="mono">
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
          <MemberCard key={m.id} member={m} onChange={onChange} onRemove={() => remove(m)} />
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
        <button type="submit" className="btn" disabled={!name.trim() || busy}>
          {t.operator.addMember}
        </button>
      </form>
    </section>
  )
}

// One person card. ✏️ flips it to an inline editor (rename, child toggle,
// recolour — the same fields the add form has); 🗑️ removes (confirmed). The photo
// camera (and "clear photo") stay as their own affordance — a face is set from
// the phone's camera/gallery, separate from the text fields.
function MemberCard({ member, onChange, onRemove }: { member: Member; onChange: () => void; onRemove: () => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(member.display_name)
  const [isChild, setIsChild] = useState(!!member.is_child)
  const [color, setColor] = useState(member.colour)
  const [busy, setBusy] = useState(false)

  async function setPhoto(file: File) {
    const blob = await resizeImage(file, AVATAR_MAX)
    await api(`members/avatar?id=${member.id}`, { method: 'POST', body: blob }).catch(() => {})
    onChange()
  }
  async function clearPhoto() {
    await api('members', { method: 'PATCH', body: { id: member.id, clearPhoto: true } }).catch(() => {})
    onChange()
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    await api('members', {
      method: 'PATCH',
      body: { id: member.id, name: name.trim(), isChild, colour: color },
    }).catch(() => {})
    setBusy(false)
    setEditing(false)
    onChange()
  }

  if (editing)
    return (
      <li className="member-card member-card--editing surface">
        <form className="operator__inline-form" onSubmit={save}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label={t.operator.name} autoFocus />
          <label className="operator__check mono">
            <input type="checkbox" checked={isChild} onChange={(e) => setIsChild(e.target.checked)} />
            {t.operator.isChild}
          </label>
          <ColorPicker value={color} onChange={setColor} label={t.operator.colorLabel} />
          <button type="submit" className="btn" disabled={!name.trim() || busy}>
            {t.common.save}
          </button>
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => {
              setName(member.display_name)
              setIsChild(!!member.is_child)
              setColor(member.colour)
              setEditing(false)
            }}
          >
            {t.common.cancel}
          </button>
        </form>
      </li>
    )

  return (
    <li className="member-card surface">
      <Avatar kind={member.avatar_kind} photo={member.avatar_ref} colour={member.colour} name={member.display_name} size={64} />
      <span className="member-card__name">{member.display_name}</span>
      {member.is_child ? <span className="tag mono">{t.operator.isChild}</span> : null}
      <div className="member-card__actions">
        <label className="btn btn--ghost mono operator__photo" title={t.operator.photo}>
          <Icon name="camera-bold" size={16} />
          <input
            type="file"
            accept="image/*"
            hidden
            aria-label={t.operator.photo}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setPhoto(f)
              e.target.value = ''
            }}
          />
        </label>
        {member.avatar_kind === 'photo' && (
          <button type="button" className="btn btn--ghost mono" onClick={clearPhoto} aria-label={t.operator.removePhoto}>
            <Icon name="x-bold" size={15} />
          </button>
        )}
        <RowActions
          onEdit={() => setEditing(true)}
          onDelete={onRemove}
          editLabel={t.operator.editMember}
          deleteLabel={t.operator.deleteMember}
        />
      </div>
    </li>
  )
}
