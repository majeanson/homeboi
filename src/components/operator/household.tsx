import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { isGuest } from '../../lib/device'
import { PALETTE } from '../../lib/colors'
import { resizeImage, AVATAR_MAX } from '../../lib/image'
import { CERCLE_KEY } from '../../lib/queryKeys'
import { Avatar } from '../Avatar'
import { ColorPicker } from '../ColorPicker'
import { Icon } from '../Icon'
import { RowActions } from '../RowActions'
import { BirthdayPicker } from '../cercle/BirthdayPicker'
import { LinkComposer } from '../cercle/LinkComposer'
import { buildPeople, personKey, type Person, type ContactLink, type Contact, type Member as CercleMember } from '../../lib/cercle'
import { type Member } from './types'

// « Le cercle » data, so a household member's own relationships can be set right
// here in Réglages ▸ Membres (members are people in the circle, phase 2).
interface CercleData {
  contacts: Contact[]
  members: CercleMember[]
  links: ContactLink[]
}

export function MembersSection({ members, onChange }: { members: Member[]; onChange: () => void }) {
  const t = useT()
  const confirm = useConfirm()
  const qc = useQueryClient()
  // The circle's people + edges, so each member card can edit that member's own
  // family links inline. Refetched (live) and invalidated when a link changes.
  const { data: cercle } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })
  const people = useMemo(() => buildPeople(cercle?.contacts ?? [], cercle?.members ?? []), [cercle])
  const links = cercle?.links ?? []
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
          <MemberCard
            key={m.id}
            member={m}
            onChange={onChange}
            onRemove={() => remove(m)}
            person={people.find((p) => p.key === personKey('member', m.id)) ?? null}
            people={people}
            links={links}
            onLinksChanged={() => qc.invalidateQueries({ queryKey: CERCLE_KEY })}
          />
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
    </section>
  )
}

// One person card. ✏️ flips it to an inline editor (rename, child toggle,
// recolour — the same fields the add form has); 🗑️ removes (confirmed). The photo
// camera (and "clear photo") stay as their own affordance — a face is set from
// the phone's camera/gallery, separate from the text fields.
function MemberCard({
  member,
  onChange,
  onRemove,
  person,
  people,
  links,
  onLinksChanged,
}: {
  member: Member
  onChange: () => void
  onRemove: () => void
  person: Person | null
  people: Person[]
  links: ContactLink[]
  onLinksChanged: () => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(member.display_name)
  const [isChild, setIsChild] = useState(!!member.is_child)
  const [color, setColor] = useState(member.colour)
  const [email, setEmail] = useState(member.email ?? '')
  const [phone, setPhone] = useState(member.phone ?? '')
  const [birthday, setBirthday] = useState<string | null>(member.birthday ?? null)
  const [notes, setNotes] = useState(member.notes ?? '')
  const [gender, setGender] = useState<'m' | 'f' | null>((member.gender as 'm' | 'f' | null) ?? null)
  const [busy, setBusy] = useState(false)
  const write = useWrite()

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
      body: {
        id: member.id,
        name: name.trim(),
        isChild,
        colour: color,
        email: email.trim() || null,
        phone: phone.trim() || null,
        birthday,
        notes: notes.trim() || null,
        gender,
      },
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
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.operator.memberEmail}
            aria-label={t.operator.memberEmail}
          />
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t.operator.memberPhone}
            aria-label={t.operator.memberPhone}
          />
          <div className="cf__field cf__field--bday">
            <label className="cf__label">{t.operator.memberBirthday}</label>
            <BirthdayPicker value={birthday} onChange={setBirthday} />
          </div>
          <div className="cf__field cf__gender">
            <span className="cf__label">{t.cercle.gender}</span>
            <div className="cf__gender-chips">
              {(['m', 'f', null] as const).map((g) => (
                <button
                  key={String(g)}
                  type="button"
                  className={'chip' + (gender === g ? ' chip--active' : '')}
                  onClick={() => setGender(g)}
                >
                  {g === 'm' ? t.cercle.genderM : g === 'f' ? t.cercle.genderF : t.cercle.genderN}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.operator.memberNotes}
            aria-label={t.operator.memberNotes}
            rows={2}
          />
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
              setEmail(member.email ?? '')
              setPhone(member.phone ?? '')
              setBirthday(member.birthday ?? null)
              setNotes(member.notes ?? '')
              setGender((member.gender as 'm' | 'f' | null) ?? null)
              setEditing(false)
            }}
          >
            {t.common.cancel}
          </button>
        </form>
        {/* This member's own family links — "Maman est la mère de Léa" — set right
            where the family is managed. Members are people in the circle (phase 2). */}
        {person && <LinkComposer person={person} people={people} links={links} onChanged={onLinksChanged} />}
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
