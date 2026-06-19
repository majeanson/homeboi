import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { useOpenPersonSheet } from '../../lib/personSheet'
import { HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { isGuest } from '../../lib/device'
import { PALETTE } from '../../lib/colors'
import { resizeImage, AVATAR_MAX } from '../../lib/image'
import { Avatar } from '../Avatar'
import { ColorPicker } from '../ColorPicker'
import { Icon } from '../Icon'
import { RowActions } from '../RowActions'
import { OperatorSection } from './OperatorSection'
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
  const write = useWrite()

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await write('members', {
        method: 'POST',
        body: { name: name.trim(), isChild, color },
        affectedKeys: [['members'], ['board']],
      })
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
    await write('members', { method: 'DELETE', body: { id: m.id }, affectedKeys: [['members'], ['board']] }).catch(
      () => {},
    )
    onChange()
  }

  return (
    <OperatorSection title={t.operator.members}>
      {/* The household's own name (set at signup) — renamable here. Operator-only. */}
      {!isGuest() && <HouseholdNameField />}

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
      {/* Adding a member is operator-only — hidden for a read-only guest. */}
      {!isGuest() && (
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
      )}
    </OperatorSection>
  )
}

// Rename the household ("Famille Jeanson", "La maisonnée"…) — the name set at
// signup, editable here and persisted on /api/household. Saves on blur / Enter when
// it actually changed; a blank is ignored server-side (the column is NOT NULL).
function HouseholdNameField() {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  const { data } = useQuery({ queryKey: HOUSEHOLD_KEY, queryFn: () => api<{ name: string }>('household') })
  const [name, setName] = useState('')
  const [saved, setSaved] = useState('')
  // Seed once the GET lands; keep tracking the server value so it isn't clobbered.
  useEffect(() => {
    if (data?.name != null) {
      setName(data.name)
      setSaved(data.name)
    }
  }, [data?.name])

  async function save() {
    const v = name.trim()
    if (!v || v === saved) return
    setSaved(v)
    await write('household', { method: 'PATCH', body: { name: v }, affectedKeys: [HOUSEHOLD_KEY] }).catch(() => {})
    qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
  }

  return (
    <label className="operator__field operator__household-name">
      <span className="operator__field-label">{t.operator.householdName}</span>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        maxLength={60}
        placeholder={t.operator.householdName}
        aria-label={t.operator.householdName}
      />
      <span className="operator__field-hint mono">{t.operator.householdNameHint}</span>
    </label>
  )
}

// One person card. ✏️ flips it to an inline editor — and on purpose it stays LEAN:
// just the Maisonnée identity the board/routines/chores need (name, face, child,
// colour). The exhaustive "everything about this human" (coordonnées, anniversaire,
// genre, notes, liens familiaux, groupes…) lives in « Le cercle » on a linked
// contact, reached via "Fiche complète" → useOpenPersonSheet (find-or-create).
function MemberCard({
  member,
  onChange,
  onRemove,
}: {
  member: Member
  onChange: () => void
  onRemove: () => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(member.display_name)
  const [isChild, setIsChild] = useState(!!member.is_child)
  const [color, setColor] = useState(member.colour)
  const [busy, setBusy] = useState(false)
  const write = useWrite()
  const openSheet = useOpenPersonSheet()

  async function setPhoto(file: File) {
    const blob = await resizeImage(file, AVATAR_MAX)
    await api(`members/avatar?id=${member.id}`, { method: 'POST', body: blob }).catch(() => {})
    onChange()
  }
  async function clearPhoto() {
    await write('members', {
      method: 'PATCH',
      body: { id: member.id, clearPhoto: true },
      affectedKeys: [['members'], ['board']],
    }).catch(() => {})
    onChange()
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    await write('members', {
      method: 'PATCH',
      body: { id: member.id, name: name.trim(), isChild, colour: color },
      affectedKeys: [['members'], ['board']],
    }).catch(() => {})
    setBusy(false)
    setEditing(false)
    onChange()
  }

  if (editing)
    return (
      <li className="member-card member-card--editing surface">
        <form className="operator__inline-form" onSubmit={save}>
          {/* The photo lives WITH the other member fields now — set/replace + remove
              here, so the card itself keeps just the uniform ✏️/🗑️ pair. */}
          <div className="member-edit__photo">
            <Avatar kind={member.avatar_kind} photo={member.avatar_ref} colour={color} name={name || member.display_name} size={48} />
            <label className="row-actions__btn operator__photo" title={t.operator.photo}>
              <Icon name="camera-bold" size={18} />
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
              <button type="button" className="row-actions__btn" onClick={clearPhoto} aria-label={t.operator.removePhoto}>
                <Icon name="x-bold" size={18} />
              </button>
            )}
          </div>
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
        {/* Everything else about this person — coordonnées, anniversaire, genre,
            notes, liens familiaux — lives in « Le cercle ». One tap finds (or, the
            first time, creates) their linked contact sheet and opens it. */}
        <button type="button" className="btn btn--ghost member-card__detail" onClick={() => openSheet({ id: member.id, name: member.display_name })}>
          <Icon name="users-three-bold" size={16} /> {t.operator.detailInCercle}
        </button>
        <p className="member-card__detail-hint mono">{t.operator.detailInCercleHint}</p>
      </li>
    )

  return (
    <li className="member-card surface">
      <Avatar kind={member.avatar_kind} photo={member.avatar_ref} colour={member.colour} name={member.display_name} size={64} />
      <span className="member-card__name">{member.display_name}</span>
      {member.is_child ? <span className="tag mono">{t.operator.isChild}</span> : null}
      {/* Just the uniform ✏️/🗑️ pair, like every other row — edit opens the inline
          editor (name, child, colour, AND the photo). Two square buttons fit one
          row, so the cards stay even/square on a phone. */}
      <div className="member-card__actions">
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
