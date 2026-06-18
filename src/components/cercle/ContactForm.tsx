import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { BirthdayPicker } from './BirthdayPicker'
import { LinkComposer } from './LinkComposer'
import { api } from '../../lib/api'
import { resizeImage, AVATAR_MAX } from '../../lib/image'
import { useWrite } from '../../lib/write'
import { CERCLE_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { type Contact, type ContactLink, type Member, buildPeople, personKey } from '../../lib/cercle'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'

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
  onSaved,
}: {
  value: Contact | null
  contacts: Contact[]
  links: ContactLink[]
  members: Member[]
  onSaved: () => void
}) {
  const t = useT()
  const nav = useNavigate()
  const write = useWrite()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  // The unified people set (contacts + members) for the relationship composer, and
  // this contact as a Person (the link subject) once it exists.
  const people = useMemo(() => buildPeople(contacts, members), [contacts, members])
  const subject = value ? people.find((p) => p.key === personKey('contact', value.id)) ?? null : null

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
  const [photoKey, setPhotoKey] = useState<string | null>(value?.photoKey ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

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

  async function save() {
    if (!firstName.trim() || saving) return
    setSaving(true)
    const body = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nickname: nickname.trim() || null,
      birthday: birthday.trim() || null,
      gender,
      email: email.trim() || null,
      phone: phone.trim() || null,
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
            address: null,
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

  return (
    <div className="cf">
      {/* Photo */}
      <div className="cf__photo">
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
        </div>
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

      {members.length > 0 && (
        <label className="cf__field">
          <span className="cf__label">{t.cercle.relationWith}</span>
          <select className="cf__input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
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
              <span key={tag} className="chip cf__tag">
                {tag}
                <button type="button" aria-label={t.common.delete} onClick={() => setTags(tags.filter((x) => x !== tag))}>
                  <Icon name="x-bold" size={12} />
                </button>
              </span>
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

      {/* Relationships sit ABOVE the save button so the form doesn't look like it
          ends mid-way. They need a saved person (an id) to link to: on EDIT the
          editor is here; on a NEW person we explain links come right after saving
          (and saving lands you on the edit view where they appear). */}
      {value && subject ? (
        <LinkComposer person={subject} people={people} links={links} onChanged={() => qc.invalidateQueries({ queryKey: CERCLE_KEY })} />
      ) : (
        <div className="cf__rels">
          <span className="cf__label">{t.cercle.relationships}</span>
          <p className="cf__rels-empty mono">{t.cercle.saveFirstForLinks}</p>
        </div>
      )}

      {/* Save is the VERY LAST thing in the form. */}
      <div className="cf__save">
        <button type="button" className="btn btn--primary" disabled={!firstName.trim() || saving || uploading} onClick={save}>
          <Icon name="check-bold" size={18} /> {t.cercle.save}
        </button>
      </div>
    </div>
  )
}
