import { useMemo, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { CERCLE_KEY } from '../../lib/queryKeys'
import {
  type Person,
  type RelationshipType,
  parsePersonKey,
  groupedRelationshipTypes,
  relLabel,
  genderedRelLabel,
} from '../../lib/cercle'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'

// Connect two families (or any two people) at a SINGLE junction: "X est [lien] de Y".
// One link is enough — the relationship closure (lib/cercle closedLinks) then
// propagates it through each side (siblings share parents/grandparents, etc.), so you
// don't re-link every pair. Both ends are searchable across the WHOLE circle (by first
// OR last name, via EntityCombobox), so this reaches people in different family groups.
// Writes one offline-safe /api/cercle-links row; the server derives the inverse.
export function ConnectPeople({
  people,
  seedAKey,
  onConnected,
  onCancel,
}: {
  people: Person[]
  /** Pre-fill side A with this person (e.g. opened from their detail peek). */
  seedAKey?: string
  onConnected?: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()

  const seedA = seedAKey ? people.find((p) => p.key === seedAKey) ?? null : null
  const [aText, setAText] = useState(seedA?.name ?? '')
  const [aKey, setAKey] = useState<string | null>(seedA?.key ?? null)
  const [bText, setBText] = useState('')
  const [bKey, setBKey] = useState<string | null>(null)
  const [type, setType] = useState<RelationshipType | ''>('')
  const [saving, setSaving] = useState(false)

  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])
  const a = aKey ? byKey.get(aKey) ?? null : null
  const b = bKey ? byKey.get(bKey) ?? null : null
  const relGroups = useMemo(() => groupedRelationshipTypes(), [])

  // keywords fold first + last name into the match (so a nickname-labelled person
  // still surfaces by their real name); exclude the already-picked other end.
  const optionsExcept = (excludeKey: string | null): ComboOption<Person>[] =>
    people
      .filter((p) => p.key !== excludeKey)
      .map((p) => ({
        id: p.key,
        label: p.name,
        data: p,
        icon: p.kind === 'member' ? 'users-three-bold' : 'user-bold',
        keywords: [p.firstName, p.lastName].filter(Boolean) as string[],
      }))

  const canSave = !!a && !!b && !!type && a.key !== b.key

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const A = parsePersonKey(a!.key)
      const B = parsePersonKey(b!.key)
      await write('cercle-links', {
        method: 'POST',
        body: { aId: A.id, aKind: A.kind, bId: B.id, bKind: B.kind, type },
        affectedKeys: [CERCLE_KEY],
      }).catch(() => {})
      setAText('')
      setAKey(null)
      setBText('')
      setBKey(null)
      setType('')
      onConnected?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cercle-connect">
      <p className="cercle-fam__hint mono">{t.cercle.connectHint}</p>

      <span className="cf__label">{t.cercle.connectPersonA}</span>
      <EntityCombobox<Person>
        value={aText}
        onChange={(v) => {
          setAText(v)
          setAKey(null)
        }}
        options={optionsExcept(bKey)}
        onPick={(opt) => {
          setAText(opt.label)
          setAKey(opt.id)
        }}
        placeholder={t.cercle.connectPick}
        submitIcon={null}
      />

      {/* "est [le/la] …" — the relationship, gendered live by person A in the preview. */}
      <label className="cf__field">
        <span className="cf__label">{t.cercle.connectRelation}</span>
        <select className="cf__input" value={type} onChange={(e) => setType(e.target.value as RelationshipType | '')}>
          <option value="">—</option>
          {relGroups.map((g) => (
            <optgroup key={g.group} label={g.label[lang]}>
              {g.types.map((ty) => (
                <option key={ty} value={ty}>
                  {relLabel(ty, lang)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <span className="cf__label">{t.cercle.connectPersonB}</span>
      <EntityCombobox<Person>
        value={bText}
        onChange={(v) => {
          setBText(v)
          setBKey(null)
        }}
        options={optionsExcept(aKey)}
        onPick={(opt) => {
          setBText(opt.label)
          setBKey(opt.id)
        }}
        placeholder={t.cercle.connectPick}
        submitIcon={null}
      />

      {/* Live, gendered preview, in the same "[rel] · [other]" shape the rows use. */}
      {a && b && type && (
        <div className="cercle-connect__preview">
          <Avatar kind={a.avatarKind} photo={a.avatarRef} colour={a.colour} name={a.firstName} size={28} />
          <span className="cercle-connect__sentence">
            <strong>{a.name}</strong> · {genderedRelLabel(type, a.gender, lang)} · <strong>{b.name}</strong>
          </span>
          <Avatar kind={b.avatarKind} photo={b.avatarRef} colour={b.colour} name={b.firstName} size={28} />
        </div>
      )}

      <div className="lc__actions">
        <button type="button" className="btn btn--primary" disabled={!canSave || saving} onClick={save}>
          <Icon name="users-three-bold" size={18} /> {t.cercle.connectSave}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            {t.common.cancel}
          </button>
        )}
      </div>
    </div>
  )
}
