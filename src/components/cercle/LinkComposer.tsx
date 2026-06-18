import { useMemo, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { CERCLE_KEY } from '../../lib/queryKeys'
import {
  type Person,
  type ContactLink,
  type RelationshipType,
  personKey,
  groupedRelationshipTypes,
  relLabel,
} from '../../lib/cercle'
import { Icon } from '../Icon'
import { RowActions } from '../RowActions'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'

// The intuitive relationship editor — a SENTENCE BUILDER. Instead of an ambiguous
// "person + type" row, it reads as a sentence: "{this person} est [ lien ] de
// [ qui ]" with a live plain-language preview, so the DIRECTION is never unclear.
// Works for any subject (a contact OR a household member) over the unified people
// set; the server derives + stores the inverse. Reused by the contact form and the
// Réglages ▸ Membres relationships affordance.
export function LinkComposer({
  person,
  people,
  links,
  onChanged,
}: {
  person: Person
  people: Person[]
  links: ContactLink[]
  onChanged: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const confirm = useConfirm()
  const [type, setType] = useState<RelationshipType>('parent')
  const [otherText, setOtherText] = useState('')
  const [otherKey, setOtherKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)

  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])
  const groups = useMemo(() => groupedRelationshipTypes(), [])

  // This person's existing links, resolved FROM THEIR perspective.
  const mine = links
    .map((l) => {
      const aKey = personKey(l.personAKind, l.personAId)
      const bKey = personKey(l.personBKind, l.personBId)
      if (aKey === person.key) return { id: l.id, relType: l.type, otherKey: bKey }
      if (bKey === person.key) return { id: l.id, relType: l.reverseType, otherKey: aKey }
      return null
    })
    .filter((x): x is { id: string; relType: RelationshipType; otherKey: string } => !!x)

  // Everyone except this person, as combobox options.
  const options: ComboOption<Person>[] = people
    .filter((p) => p.key !== person.key)
    .map((p) => ({ id: p.key, label: p.name, data: p, icon: p.kind === 'member' ? 'users-three-bold' : 'user-bold' }))

  const otherPerson = otherKey ? byKey.get(otherKey) : null
  const preview = otherPerson ? `${person.name} · ${relLabel(type, lang)} · ${otherPerson.name}` : null

  async function addLink() {
    if (!otherPerson || busy) return
    setBusy(true)
    try {
      await write('cercle-links', {
        method: 'POST',
        body: { aId: person.id, aKind: person.kind, bId: otherPerson.id, bKind: otherPerson.kind, type },
        affectedKeys: [CERCLE_KEY],
      })
      setOtherKey(null)
      setOtherText('')
      setAdding(false)
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

  return (
    <div className="lc">
      <span className="cf__label">{t.cercle.relationships}</span>

      {mine.length === 0 ? (
        <p className="cf__rels-empty mono">{t.cercle.noRelationships}</p>
      ) : (
        <ul className="cf__rels-list">
          {mine.map((m) => {
            const other = byKey.get(m.otherKey)
            return (
              <li key={m.id} className="cf__rels-row">
                <span className="cf__rels-text">
                  <strong>{relLabel(m.relType, lang)}</strong> · {other ? other.name : '—'}
                </span>
                <RowActions onDelete={() => removeLink(m.id)} deleteLabel={t.cercle.removeRelationship} />
              </li>
            )
          })}
        </ul>
      )}

      {adding ? (
        <div className="lc__compose">
          {/* The sentence: "{cette personne} est [ lien ] de [ qui ]". */}
          <p className="lc__sentence">
            <strong>{person.name}</strong> {t.cercle.isThe}
          </p>
          <select className="cf__input" aria-label={t.cercle.relationType} value={type} onChange={(e) => setType(e.target.value as RelationshipType)}>
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
          <p className="lc__sentence">{t.cercle.ofWhom}</p>
          <EntityCombobox
            value={otherText}
            onChange={(v) => {
              setOtherText(v)
              setOtherKey(null)
            }}
            options={options}
            onPick={(opt) => {
              setOtherKey(opt.id)
              setOtherText(opt.label)
            }}
            placeholder={t.cercle.pickPerson}
            submitIcon={null}
            typeaheadOnly
          />
          {preview && <p className="lc__preview mono">{preview}</p>}
          <div className="lc__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={!otherPerson || busy} onClick={addLink}>
              <Icon name="check-bold" size={14} /> {t.cercle.addRelationship}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(false)}>
              {t.common.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--sm lc__add" onClick={() => setAdding(true)}>
          <Icon name="plus-bold" size={14} /> {t.cercle.addRelationship}
        </button>
      )}
    </div>
  )
}
