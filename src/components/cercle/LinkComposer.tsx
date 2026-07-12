import { useEffect, useMemo, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { CERCLE_KEY } from '../../lib/queryKeys'
import {
  type Person,
  type ContactLink,
  type RelationshipType,
  type InferredLink,
  personKey,
  relationshipPickerGroups,
  relLabel,
  genderedRelLabel,
  inferLinks,
} from '../../lib/cercle'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { RowActions } from '../RowActions'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'

// The intuitive relationship editor — a SENTENCE BUILDER. Instead of an ambiguous
// "person + type" row, it reads as a sentence: "{this person} est [ lien ] de
// [ qui ]" with a live plain-language preview, so the DIRECTION is never unclear.
// Works for any subject (a contact OR a household member) over the unified people
// set; the server derives + stores the inverse. Reused by the contact form and the
// Réglages ▸ Membres relationships affordance.
//
// Also shows inference suggestions: transitive links inferred from the existing
// graph (co-parents → spouse, shared parent → siblings, spouse's parent → in-law).
// These are dismissable; accepting them creates the link immediately.
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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])

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

  // Inference suggestions for this person
  const allSuggestions = useMemo(() => inferLinks(people, links), [people, links])
  const mySuggestions = useMemo(
    () =>
      allSuggestions.filter(
        (s) => (s.aKey === person.key || s.bKey === person.key) && !dismissed.has(`${s.aKey}||${s.bKey}`),
      ),
    [allSuggestions, person.key, dismissed],
  )

  // Everyone except this person, as combobox options.
  const options: ComboOption<Person>[] = people
    .filter((p) => p.key !== person.key)
    .map((p) => ({ id: p.key, label: p.name, data: p, icon: p.kind === 'pet' ? 'smiley-bold' : p.kind === 'member' ? 'users-three-bold' : 'user-bold' }))

  const otherPerson = otherKey ? byKey.get(otherKey) : null
  // When the subject or the picked other is a pet, the picker offers the « Animaux »
  // ties (Propriétaire / Animal) instead of human rungs; otherwise that group is hidden.
  const petInvolved = person.kind === 'pet' || otherPerson?.kind === 'pet'
  const groups = relationshipPickerGroups(petInvolved)
  // Keep the selected type valid as the pet-context flips (default 'parent' is invalid
  // once a pet is the other end → fall to 'owner', and vice-versa).
  useEffect(() => {
    setType((cur) => (groups.some((g) => g.types.includes(cur)) ? cur : petInvolved ? 'owner' : 'parent'))
    // Only react to the pet-context flip; groups is recomputed every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petInvolved])
  // The sentence reads "{person} est [type] de {other}", so the relation describes the
  // SUBJECT (`person`) and is gendered by THEIR gender — not the other person's.
  const preview = otherPerson ? `${person.name} · ${genderedRelLabel(type, person.gender, lang)} · ${otherPerson.name}` : null

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

  async function acceptSuggestion(s: InferredLink) {
    const firstColon = s.aKey.indexOf(':')
    const aKind = s.aKey.slice(0, firstColon)
    const aId = s.aKey.slice(firstColon + 1)
    const firstColonB = s.bKey.indexOf(':')
    const bKind = s.bKey.slice(0, firstColonB)
    const bId = s.bKey.slice(firstColonB + 1)
    setBusy(true)
    try {
      await write('cercle-links', {
        method: 'POST',
        body: { aId, aKind, bId, bKind, type: s.type },
        affectedKeys: [CERCLE_KEY],
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  function dismissSuggestion(s: InferredLink) {
    setDismissed((prev) => new Set([...prev, `${s.aKey}||${s.bKey}`]))
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
                  <strong>{genderedRelLabel(m.relType, person.gender, lang)}</strong> · {other ? other.name : '—'}
                </span>
                <RowActions onDelete={() => removeLink(m.id)} deleteLabel={t.cercle.removeRelationship} />
              </li>
            )
          })}
        </ul>
      )}

      {/* Inference suggestions — dismissable transitive link proposals */}
      {mySuggestions.length > 0 && (
        <div className="lc__suggestions">
          <span className="cf__label">{t.cercle.suggestedLinks}</span>
          {mySuggestions.map((s, i) => {
            const otherSugKey = s.aKey === person.key ? s.bKey : s.aKey
            const relType = s.aKey === person.key ? s.type : s.reverseType
            const other = byKey.get(otherSugKey)
            if (!other) return null
            return (
              <div key={i} className="lc__suggestion">
                <span className="lc__suggestion-text mono">
                  {person.name} · <strong>{genderedRelLabel(relType, person.gender, lang)}</strong> · {other.name}
                </span>
                <div className="lc__suggestion-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={busy}
                    onClick={() => acceptSuggestion(s)}
                  >
                    <Icon name="check-bold" size={13} /> {t.cercle.acceptSuggestion}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => dismissSuggestion(s)}
                  >
                    <Icon name="x-bold" size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button type="button" className="btn btn--sm lc__add" onClick={() => setAdding(true)}>
        <Icon name="plus-bold" size={14} /> {t.cercle.addRelationship}
      </button>

      {/* The composer is a Modal, not a panel unfolded under the links + suggestions —
          it used to open at the very bottom of both lists, i.e. off-screen on anyone with
          a few relatives. Short form, so an overlay (not a scene) per the convention. */}
      <Modal open={adding} onClose={() => setAdding(false)} title={t.cercle.addRelationship}>
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
      </Modal>
    </div>
  )
}
