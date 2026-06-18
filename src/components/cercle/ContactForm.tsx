import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { resizeImage, AVATAR_MAX } from '../../lib/image'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { CERCLE_KEY, BOARD_KEY } from '../../lib/queryKeys'
import {
  type Contact,
  type ContactLink,
  type RelationshipType,
  fullName,
  groupedRelationshipTypes,
  relLabel,
} from '../../lib/cercle'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { RowActions } from '../RowActions'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import type { FormMember } from '../FormScene'

// Add / edit one person in « Le cercle ». Plain labelled fields (a multi-field
// form, not a one-line add row, so EditField doesn't fit) styled by cercle.css.
// Relationship editing only appears once the contact EXISTS (you need an id to
// link), so a brand-new person saves first, then gets links on the edit pass.
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
  members: FormMember[]
  onSaved: () => void
}) {
  const t = useT()
  const write = useWrite()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState(value?.firstName ?? '')
  const [lastName, setLastName] = useState(value?.lastName ?? '')
  const [nickname, setNickname] = useState(value?.nickname ?? '')
  const [birthday, setBirthday] = useState(value?.birthday ?? '')
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
      email: email.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      tags,
      memberId: memberId || null,
      photoKey,
    }
    try {
      if (value) await write('cercle', { method: 'PATCH', body: { id: value.id, ...body }, affectedKeys: [CERCLE_KEY, BOARD_KEY] })
      else await write('cercle', { method: 'POST', body, affectedKeys: [CERCLE_KEY, BOARD_KEY] })
      onSaved()
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
        <label className="cf__field">
          <span className="cf__label">
            <Icon name="cake-bold" size={14} /> {t.cercle.birthday}
          </span>
          <input
            className="cf__input"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            placeholder={t.cercle.birthdayHint}
            inputMode="numeric"
          />
        </label>
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
                {m.display_name}
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

      <div className="cf__save">
        <button type="button" className="btn btn--primary" disabled={!firstName.trim() || saving || uploading} onClick={save}>
          <Icon name="check-bold" size={18} /> {t.cercle.save}
        </button>
      </div>

      {/* Relationships — only once the person exists (needs an id to link). */}
      {value && (
        <RelationshipEditor person={value} contacts={contacts} links={links} onChanged={() => qc.invalidateQueries({ queryKey: CERCLE_KEY })} />
      )}
    </div>
  )
}

// The relationship sub-editor: lists this person's existing links (resolved from
// THEIR perspective — "Grand-parent · Léa") and adds new ones (pick a relation +
// the other person). The server derives the inverse, so we only send A→B.
function RelationshipEditor({
  person,
  contacts,
  links,
  onChanged,
}: {
  person: Contact
  contacts: Contact[]
  links: ContactLink[]
  onChanged: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const confirm = useConfirm()
  const [type, setType] = useState<RelationshipType>('parent')
  const [otherText, setOtherText] = useState('')
  const [otherId, setOtherId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const byId = new Map(contacts.map((c) => [c.id, c]))
  const mine = links.filter((l) => l.personAId === person.id || l.personBId === person.id)

  // Everyone except this person, as combobox options.
  const options: ComboOption<Contact>[] = contacts
    .filter((c) => c.id !== person.id)
    .map((c) => ({ id: c.id, label: fullName(c), data: c, icon: 'user-bold' }))

  async function addLink() {
    if (!otherId || busy) return
    setBusy(true)
    try {
      await write('cercle-links', { method: 'POST', body: { personAId: person.id, personBId: otherId, type }, affectedKeys: [CERCLE_KEY] })
      setOtherId(null)
      setOtherText('')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function removeLink(id: string) {
    if (!(await confirm({ message: t.cercle.removeRelationship, tone: 'danger' }))) return
    await write('cercle-links', { method: 'DELETE', body: { id }, affectedKeys: [CERCLE_KEY] })
    onChanged()
  }

  const groups = groupedRelationshipTypes()

  return (
    <div className="cf__rels">
      <span className="cf__label">{t.cercle.relationships}</span>
      {mine.length === 0 ? (
        <p className="cf__rels-empty mono">{t.cercle.noRelationships}</p>
      ) : (
        <ul className="cf__rels-list">
          {mine.map((l) => {
            // From THIS person's side: if they're A they ARE `type` of B; if B,
            // they're `reverseType` of A.
            const isA = l.personAId === person.id
            const relType = (isA ? l.type : l.reverseType) as RelationshipType
            const other = byId.get(isA ? l.personBId : l.personAId)
            return (
              <li key={l.id} className="cf__rels-row">
                <span className="cf__rels-text">
                  <strong>{relLabel(relType, lang)}</strong> · {other ? fullName(other) : '—'}
                </span>
                <RowActions onDelete={() => removeLink(l.id)} deleteLabel={t.cercle.removeRelationship} />
              </li>
            )
          })}
        </ul>
      )}

      <div className="cf__rels-add">
        <select className="cf__input" value={type} onChange={(e) => setType(e.target.value as RelationshipType)}>
          {groups.map((g) => (
            <optgroup key={g.group} label={g.label[lang]}>
              {g.types.map((ty) => (
                <option key={ty} value={ty}>
                  {relLabel(ty, lang)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <EntityCombobox
          value={otherText}
          onChange={(v) => {
            setOtherText(v)
            setOtherId(null)
          }}
          options={options}
          onPick={(opt) => {
            setOtherId(opt.id)
            setOtherText(opt.label)
          }}
          placeholder={t.cercle.pickPerson}
          submitIcon={null}
          typeaheadOnly
        />
        <button type="button" className="btn btn--sm" disabled={!otherId || busy} onClick={addLink}>
          <Icon name="plus-bold" size={14} /> {t.cercle.addRelationship}
        </button>
      </div>
    </div>
  )
}
