import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { BirthdayPicker } from './BirthdayPicker'
import { LinkComposer } from './LinkComposer'
import { api } from '../../lib/api'
import { resizeImage, AVATAR_MAX } from '../../lib/image'
import { useConfirm } from '../../lib/confirm'
import { useWrite } from '../../lib/write'
import { CERCLE_KEY, BOARD_KEY } from '../../lib/queryKeys'
import {
  type Contact,
  type ContactLink,
  type ContactAddress,
  type ContactGroup,
  type ContactGroupRaw,
  type GroupKind,
  type Member,
  buildGroups,
  unifyCircle,
  fullName,
  personKey,
} from '../../lib/cercle'
import { ContactPhotos } from './ContactPhotos'
import { Avatar } from '../Avatar'
import { Icon, InlineIcon } from '../Icon'
import { Chip } from '../Chip'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'

// Add / edit one person in « Le cercle ». Plain labelled fields (a multi-field
// form, not a one-line add row, so EditField doesn't fit) styled by cercle.css.
// Relationship editing (the LinkComposer) only appears once the contact EXISTS
// (you need an id to link), so a brand-new person saves first, then lands on the
// edit pass where the links section is shown.
export function ContactForm({
  value,
  contacts,
  links,
  members,
  groups,
  onSaved,
}: {
  value: Contact | null
  contacts: Contact[]
  links: ContactLink[]
  members: Member[]
  groups: ContactGroupRaw[]
  onSaved: () => void
}) {
  const t = useT()
  const nav = useNavigate()
  const write = useWrite()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  // The unified people set (contacts + members, deduped) for the relationship
  // composer, plus this contact as a Person (the link subject) once it exists. A
  // contact hard-linked to a member IS that member (unifyCircle keeps the member as
  // the canonical node), so relationships attach to the single identity and existing
  // ties stored either way still resolve against it.
  const unified = useMemo(() => unifyCircle(contacts, members, links, groups), [contacts, members, links, groups])
  const people = unified.people
  const subjectKey = value
    ? value.memberId && members.some((m) => m.id === value.memberId)
      ? personKey('member', value.memberId)
      : personKey('contact', value.id)
    : null
  const subject = subjectKey ? people.find((p) => p.key === subjectKey) ?? null : null

  const [firstName, setFirstName] = useState(value?.firstName ?? '')
  const [lastName, setLastName] = useState(value?.lastName ?? '')
  const [nickname, setNickname] = useState(value?.nickname ?? '')
  const [birthday, setBirthday] = useState(value?.birthday ?? '')
  const [gender, setGender] = useState<'m' | 'f' | null>(value?.gender ?? null)
  const [email, setEmail] = useState(value?.email ?? '')
  const [phone, setPhone] = useState(value?.phone ?? '')
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [tags, setTags] = useState<string[]>(value?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [memberId, setMemberId] = useState(value?.memberId ?? '')
  const [memberText, setMemberText] = useState(() => members.find((m) => m.id === value?.memberId)?.displayName ?? '')
  const [photoKey, setPhotoKey] = useState<string | null>(value?.photoKey ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  // If this person is a Maisonnée member (hard-linked), their face is the member's
  // board avatar — the ONE photo, managed in Réglages ▸ Membres — not a separate
  // contact photo. Resolve it live off the picked member so it tracks an inline link
  // change. `memberPhoto` is the R2 key only when that avatar is an uploaded photo.
  const linkedMember = useMemo(() => members.find((m) => m.id === memberId) ?? null, [members, memberId])
  const memberPhoto = linkedMember?.avatarKind === 'photo' ? linkedMember.avatarRef : null

  const hasContactPicker = 'contacts' in navigator && 'ContactsManager' in window

  async function importFromContacts() {
    type CM = { select(p: string[], opts?: { multiple?: boolean }): Promise<Array<{ name?: string[]; email?: string[]; tel?: string[] }>> }
    const cm = (navigator as unknown as { contacts: CM }).contacts
    try {
      const results = await cm.select(['name', 'email', 'tel'], { multiple: false })
      const c = results?.[0]
      if (!c) return
      if (c.name?.[0]) {
        const parts = c.name[0].trim().split(/\s+/)
        setFirstName(parts[0] ?? '')
        setLastName(parts.slice(1).join(' '))
      }
      if (c.tel?.[0] && !phone) setPhone(c.tel[0])
      if (c.email?.[0] && !email) setEmail(c.email[0])
    } catch {
      // cancelled or permission denied
    }
  }

  // Address parts (the schema carries a structured address; the form edits the
  // parts a household actually fills in and uses for a Maps directions link).
  const [street, setStreet] = useState(value?.address?.street ?? '')
  const [city, setCity] = useState(value?.address?.city ?? '')
  const [province, setProvince] = useState(value?.address?.state ?? '')
  const [postal, setPostal] = useState(value?.address?.postalCode ?? '')

  // Named-group membership for this contact. Toggling assigns/removes the person
  // via the cercle-groups API (the backend was already complete). Edit-only — a
  // brand-new person has no id to attach yet. Seeded once from the loaded groups;
  // toggles update it optimistically so the chips feel instant (incl. offline).
  const groupList = useMemo(() => buildGroups(groups), [groups])
  const [memberOf, setMemberOf] = useState<Set<string>>(
    () => new Set(value ? groupList.filter((g) => g.memberKeys.has(personKey('contact', value.id))).map((g) => g.id) : []),
  )
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupKind, setNewGroupKind] = useState<GroupKind>('other')

  async function toggleGroup(g: ContactGroup) {
    if (!value) return
    const inIt = memberOf.has(g.id)
    setMemberOf((prev) => {
      const n = new Set(prev)
      if (inIt) n.delete(g.id)
      else n.add(g.id)
      return n
    })
    await write('cercle-groups', {
      method: inIt ? 'DELETE' : 'POST',
      body: { groupId: g.id, personId: value.id, personKind: 'contact' },
      affectedKeys: [CERCLE_KEY],
    })
  }

  // Create a group AND drop this person into it in one go (so the form is a
  // self-sufficient place to organize people, not just a chooser of existing groups).
  async function createGroupAndAdd() {
    const name = newGroupName.trim()
    if (!name || !value) return
    const res = await write<{ id: string }>('cercle-groups', {
      method: 'POST',
      body: { name, kind: newGroupKind },
      affectedKeys: [CERCLE_KEY],
    })
    const gid = res.queued ? null : res.data?.id ?? null
    if (gid) {
      await write('cercle-groups', {
        method: 'POST',
        body: { groupId: gid, personId: value.id, personKind: 'contact' },
        affectedKeys: [CERCLE_KEY],
      })
      setMemberOf((prev) => new Set(prev).add(gid))
    }
    setNewGroupName('')
    setCreatingGroup(false)
  }

  const addTag = () => {
    const v = tagDraft.trim()
    if (v && !tags.includes(v)) setTags([...tags, v])
    setTagDraft('')
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const blob = await resizeImage(file, AVATAR_MAX)
      const { key } = await api<{ key: string }>('cercle', { method: 'POST', body: blob })
      setPhotoKey(key)
    } catch {
      /* upload failed (offline / R2 unset) — keep the previous tile, no crash */
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Collapse the address parts into the stored object (or null when all empty).
  function buildAddress(): ContactAddress | null {
    const a: ContactAddress = {}
    if (street.trim()) a.street = street.trim()
    if (city.trim()) a.city = city.trim()
    if (province.trim()) a.state = province.trim()
    if (postal.trim()) a.postalCode = postal.trim()
    return Object.keys(a).length ? a : null
  }

  async function save() {
    if (!firstName.trim() || saving) return
    setSaving(true)
    const address = buildAddress()
    const body = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nickname: nickname.trim() || null,
      birthday: birthday.trim() || null,
      gender,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address,
      notes: notes.trim() || null,
      tags,
      memberId: memberId || null,
      photoKey,
    }
    try {
      if (value) {
        await write('cercle', { method: 'PATCH', body: { id: value.id, ...body }, affectedKeys: [CERCLE_KEY, BOARD_KEY] })
        onSaved()
        return
      }
      const res = await write<{ id: string }>('cercle', { method: 'POST', body, affectedKeys: [CERCLE_KEY, BOARD_KEY] })
      const newId = res.queued ? null : res.data?.id ?? null
      if (newId) {
        // Seed the cache so the edit page finds the new person at once (no refetch
        // race that would bounce back), then land on their EDIT view — where the
        // « Liens » section lives, so adding a relationship is the obvious next step.
        qc.setQueryData<{ contacts: Contact[]; links: ContactLink[] }>(CERCLE_KEY, (old) => {
          const fresh: Contact = {
            id: newId,
            firstName: body.firstName,
            lastName: body.lastName,
            nickname: body.nickname,
            photoKey,
            birthday: body.birthday,
            gender,
            email: body.email,
            phone: body.phone,
            address,
            notes: body.notes,
            tags,
            memberId: body.memberId,
            customFields: [],
          }
          return old ? { contacts: [...old.contacts, fresh], links: old.links } : { contacts: [fresh], links: [] }
        })
        nav(`/cercle/person/${newId}`, { replace: true })
      } else {
        onSaved() // offline: the create is queued with no id yet — just close
      }
    } finally {
      setSaving(false)
    }
  }

  // HEAVY delete (the person + their relationship edges + group memberships, all
  // cascaded server-side), so it asks first via the confirm dialog rather than the
  // forgiving undo toast lighter rows use. Edit-only — a brand-new person has no id.
  async function remove() {
    if (!value || saving) return
    const okay = await confirm({
      message: t.cercle.deleteConfirm(fullName(value)),
      confirmLabel: t.cercle.deletePerson,
      tone: 'danger',
    })
    if (!okay) return
    setSaving(true)
    try {
      await write('cercle', { method: 'DELETE', body: { id: value.id }, affectedKeys: [CERCLE_KEY, BOARD_KEY] })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cf">
      {/* Photo. A member's face comes from the Maisonnée (their board avatar) and is
          edited there, so for a linked member we SHOW that face read-only; otherwise
          this is the contact's own editable photo. */}
      <div className="cf__photo">
        {linkedMember ? (
          <>
            <Avatar kind={linkedMember.avatarKind} photo={linkedMember.avatarRef} colour={linkedMember.colour} name={firstName} size={84} />
            <div className="cf__photo-actions">
              <p className="cf-photos__hint mono">{t.cercle.photoFromMaisonnee}</p>
            </div>
          </>
        ) : (
          <>
            <Avatar kind={photoKey ? 'photo' : null} photo={photoKey} colour="#C45E86" name={firstName} size={84} />
            <div className="cf__photo-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
              <button type="button" className="btn btn--sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Icon name="camera-bold" size={16} /> {photoKey ? t.cercle.changePhoto : t.cercle.addPhoto}
              </button>
              {photoKey && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPhotoKey(null)}>
                  {t.cercle.removePhoto}
                </button>
              )}
              {hasContactPicker && !value && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={importFromContacts}>
                  <Icon name="book-open-bold" size={15} /> {t.cercle.importContact}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="cf__grid">
        <label className="cf__field">
          <span className="cf__label">{t.cercle.firstName}</span>
          <input className="cf__input" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        </label>
        <label className="cf__field">
          <span className="cf__label">{t.cercle.lastName}</span>
          <input className="cf__input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="cf__field">
          <span className="cf__label">{t.cercle.nickname}</span>
          <input className="cf__input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <div className="cf__field cf__field--bday">
          <span className="cf__label">
            <Icon name="cake-bold" size={14} /> {t.cercle.birthday}
          </span>
          <BirthdayPicker value={birthday || null} onChange={(v) => setBirthday(v ?? '')} />
        </div>
        <div className="cf__field cf__gender">
          <span className="cf__label">{t.cercle.gender}</span>
          <div className="cf__gender-chips">
            {(['m', 'f', null] as const).map((g) => (
              <Chip key={String(g)} selected={gender === g} onClick={() => setGender(g)}>
                {g === 'm' ? t.cercle.genderM : g === 'f' ? t.cercle.genderF : t.cercle.genderN}
              </Chip>
            ))}
          </div>
        </div>
        <label className="cf__field">
          <span className="cf__label">
            <Icon name="phone-bold" size={14} /> {t.cercle.phone}
          </span>
          <input className="cf__input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="cf__field">
          <span className="cf__label">
            <Icon name="envelope-bold" size={14} /> {t.cercle.email}
          </span>
          <input className="cf__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>

      {/* Address — a structured address the schema always carried but the form never
          edited. Drives the « Itinéraire » (Google Maps directions) action in the peek. */}
      <div className="cf__field">
        <span className="cf__label">
          <Icon name="map-pin-bold" size={14} /> {t.cercle.address}
        </span>
        <input
          className="cf__input"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder={t.cercle.addressStreet}
          autoComplete="address-line1"
        />
        <div className="cf__addr-row">
          <input
            className="cf__input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t.cercle.addressCity}
            autoComplete="address-level2"
          />
          <input
            className="cf__input cf__addr-prov"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            placeholder={t.cercle.addressProvince}
            autoComplete="address-level1"
          />
          <input
            className="cf__input cf__addr-postal"
            value={postal}
            onChange={(e) => setPostal(e.target.value)}
            placeholder={t.cercle.addressPostal}
            autoComplete="postal-code"
          />
        </div>
      </div>

      {members.length > 0 && (
        <div className="cf__field">
          <span className="cf__label">{t.cercle.relationWith}</span>
          <EntityCombobox<Member>
            value={memberText}
            onChange={(v) => {
              setMemberText(v)
              if (!v.trim()) setMemberId('')
            }}
            options={members.map((m): ComboOption<Member> => ({ id: m.id, label: m.displayName, data: m, icon: 'users-three-bold' }))}
            onPick={(opt) => { setMemberId(opt.id); setMemberText(opt.label) }}
            placeholder="—"
            submitIcon={null}
            typeaheadOnly
          />
        </div>
      )}

      <label className="cf__field">
        <span className="cf__label">{t.cercle.notes}</span>
        <textarea className="cf__input cf__textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </label>

      {/* Tags */}
      <div className="cf__field">
        <span className="cf__label">{t.cercle.tags}</span>
        {tags.length > 0 && (
          <div className="cf__tags">
            {tags.map((tag) => (
              <Chip
                key={tag}
                className="cf__tag"
                onRemove={() => setTags(tags.filter((x) => x !== tag))}
                removeLabel={t.common.delete}
              >
                {tag}
              </Chip>
            ))}
          </div>
        )}
        <div className="cf__tagadd">
          <input
            className="cf__input"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder={t.cercle.tags}
          />
          <button type="button" className="btn btn--sm" onClick={addTag}>
            <Icon name="plus-bold" size={14} />
          </button>
        </div>
      </div>

      {/* Named groups — toggle this person in/out of an explicit group (Famille
          Tremblay, Collègues…). Edit-only (needs an id to attach). The backend was
          already complete; this finally exposes it. */}
      {value && (
        <div className="cf__field cf__groups">
          <span className="cf__label">
            <Icon name="users-three-bold" size={14} /> {t.cercle.groups}
          </span>
          <div className="cf__groups-chips">
            {groupList.map((g) => (
              <Chip key={g.id} selected={memberOf.has(g.id)} onClick={() => toggleGroup(g)}>
                <span className="cercle-group__dot" style={{ background: g.colour ?? '#C45E86' }} />
                {g.name}
              </Chip>
            ))}
            {!creatingGroup && (
              <Chip className="cf__group-add" onClick={() => setCreatingGroup(true)}>
                <InlineIcon name="plus-bold" size={12} /> {t.cercle.addGroup}
              </Chip>
            )}
          </div>
          {creatingGroup && (
            <div className="cercle-new-group">
              <input
                className="cf__input"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t.cercle.groupName}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createGroupAndAdd()}
              />
              <select className="cf__input" value={newGroupKind} onChange={(e) => setNewGroupKind(e.target.value as GroupKind)}>
                {(['family', 'friends', 'work', 'other'] as GroupKind[]).map((k) => (
                  <option key={k} value={k}>
                    {t.cercle.groupKinds[k]}
                  </option>
                ))}
              </select>
              <div className="lc__actions">
                <button type="button" className="btn btn--primary btn--sm" disabled={!newGroupName.trim()} onClick={createGroupAndAdd}>
                  <InlineIcon name="check-bold" size={13} /> {t.cercle.addGroup}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCreatingGroup(false)}>
                  {t.common.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-person photo gallery (ID card, screenshot, snapshot together). Edit-only —
          attachments hang off a saved contact id. */}
      {value && <ContactPhotos contactId={value.id} memberPhoto={memberPhoto} />}

      {/* Relationships sit ABOVE the save button so the form doesn't look like it
          ends mid-way. They need a saved person (an id) to link to: on EDIT the
          editor is here; on a NEW person we explain links come right after saving
          (and saving lands you on the edit view where they appear). */}
      {value && subject ? (
        <LinkComposer person={subject} people={people} links={unified.links} onChanged={() => qc.invalidateQueries({ queryKey: CERCLE_KEY })} />
      ) : (
        <div className="cf__rels">
          <span className="cf__label">{t.cercle.relationships}</span>
          <p className="cf__rels-empty mono">{t.cercle.saveFirstForLinks}</p>
        </div>
      )}

      {/* Save is the VERY LAST thing in the form; a saved person can also be removed
          (cascades their links + group memberships). */}
      <div className="cf__save">
        <button type="button" className="btn btn--primary" disabled={!firstName.trim() || saving || uploading} onClick={save}>
          <Icon name="check-bold" size={18} /> {t.cercle.save}
        </button>
        {value && (
          <button type="button" className="btn btn--ghost btn--danger" disabled={saving} onClick={remove}>
            <Icon name="trash-bold" size={16} /> {t.cercle.deletePerson}
          </button>
        )}
      </div>
    </div>
  )
}
