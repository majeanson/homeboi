import { useMemo, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { CERCLE_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import {
  type Person,
  type ContactLink,
  type ContactGroupRaw,
  type RelationshipType,
  type FamilyBand,
  FAMILY_BANDS,
  personKey,
  parsePersonKey,
  relationshipPickerGroups,
  relLabel,
  familyLinksFromBands,
  familyLinksFromMatrix,
  bandsFromLinks,
  dedupeNewLinks,
} from '../../lib/cercle'
import { Avatar } from '../Avatar'
import { Icon, InlineIcon } from '../Icon'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'

const ACCENT = '#2A8F85' // cercle turquoise
const PET_COLOUR = '#C7873F' // the pet amber (mirrors PetForm / PET_ACCENT)
type Mode = 'bands' | 'matrix'
type Slot = FamilyBand | 'tray'

// Build a whole family's relationships in one place instead of one link at a time.
// Two interchangeable modes over ONE engine (lib/cercle): drag faces into generation
// BANDS (parents↔children, siblings, spouses are inferred), or set each person's
// relation to a single ANCHOR in a list. Both produce directed links that ride the
// normal /api/cercle-links write (offline-safe via useWrite; the server derives the
// inverse and rejects duplicates). People are the UNIFIED set (a member and its
// linked contact are one face — see unifyCircle), so nobody appears twice.
export function FamilyBuilder({
  people,
  links,
  group,
  seedKeys,
  linksOnly,
  onSaved,
}: {
  people: Person[]
  links: ContactLink[]
  group: ContactGroupRaw | null
  /** Build a NEW family pre-seeded with these person keys (e.g. from a person's
   *  detail peek — "build their family"). Ignored when editing an existing group. */
  seedKeys?: string[]
  /** Relationships-only mode (from the Maisonnée card): wire up who's whose
   *  parent/sibling/spouse WITHOUT creating a named group — no name field, save
   *  writes links only. Keeps the household from spawning a redundant group. */
  linksOnly?: boolean
  onSaved: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()

  // People created right here (so a missing grandparent can be added without leaving)
  // live alongside the loaded set until the next refetch folds them in.
  const [extra, setExtra] = useState<Person[]>([])
  const allPeople = useMemo(() => [...people, ...extra], [people, extra])
  const byKey = useMemo(() => new Map(allPeople.map((p) => [p.key, p])), [allPeople])

  // Roster = everyone in this family — people AND the family's pets (one list so the
  // existing group-save loop adds each with its own kind). Seeded from the group being
  // edited or the "build their family" person, PLUS any pet OWNED by a seeded human so
  // the « Animaux de la famille » section opens up to date with the family's animals.
  // (owner: human→pet, pet: pet→human — read both directions off the existing links.)
  const [roster, setRoster] = useState<string[]>(() => {
    const base = group ? group.memberKeys.map((m) => personKey(m.personKind, m.personId)) : seedKeys ?? []
    const set = new Set(base)
    for (const l of links) {
      if (l.type === 'owner' && l.personBKind === 'pet' && set.has(personKey(l.personAKind, l.personAId)))
        set.add(personKey('pet', l.personBId))
      else if (l.type === 'pet' && l.personAKind === 'pet' && set.has(personKey(l.personBKind, l.personBId)))
        set.add(personKey('pet', l.personAId))
    }
    return [...set]
  })
  // Seed the generation bands from the family's EXISTING links so an already-built
  // family opens with its faces in place (grands-parents / parents / enfants) instead
  // of all stranded in « À placer ». People with no generational tie stay un-placed.
  const [band, setBand] = useState<Record<string, FamilyBand>>(() => {
    const petKeys = new Set(people.filter((p) => p.kind === 'pet').map((p) => p.key))
    return bandsFromLinks(
      roster.filter((k) => !petKeys.has(k)),
      links,
    )
  })
  const [pick, setPick] = useState<Record<string, RelationshipType>>({})
  const [anchor, setAnchor] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('bands')
  const [name, setName] = useState(group?.name ?? '')
  const [addText, setAddText] = useState('')
  const [newName, setNewName] = useState('')
  const [petText, setPetText] = useState('')
  const [newPet, setNewPet] = useState('')
  const [saving, setSaving] = useState(false)

  // Suggested family name: the most common last name among the roster → "Famille X".
  const suggestedName = useMemo(() => {
    const counts = new Map<string, number>()
    for (const key of roster) {
      const last = byKey.get(key)?.lastName?.trim()
      if (last) counts.set(last, (counts.get(last) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return top ? t.cercle.familyOf(top) : ''
  }, [roster, byKey, t])

  const rosterSet = useMemo(() => new Set(roster), [roster])
  // Pets ride in the same roster but are wired through their own section, never the
  // generational bands/matrix (a pet can't carry a human rung). Split the two.
  const humanRoster = useMemo(() => roster.filter((k) => byKey.get(k)?.kind !== 'pet'), [roster, byKey])
  const petRoster = useMemo(() => roster.filter((k) => byKey.get(k)?.kind === 'pet'), [roster, byKey])
  const addOptions: ComboOption<Person>[] = allPeople
    .filter((p) => p.kind !== 'pet' && !rosterSet.has(p.key))
    // keywords fold first name AND last name into the type-to-filter match, so a
    // search hits either — even when the label is a nickname (fullName prefers it).
    .map((p) => ({
      id: p.key,
      label: p.name,
      data: p,
      icon: p.kind === 'member' ? 'users-three-bold' : 'user-bold',
      keywords: [p.firstName, p.lastName].filter(Boolean) as string[],
    }))
  // The family's pets to pick from (existing animals not already in the family).
  const addPetOptions: ComboOption<Person>[] = allPeople
    .filter((p) => p.kind === 'pet' && !rosterSet.has(p.key))
    .map((p) => ({ id: p.key, label: p.name, data: p, icon: 'smiley-bold', keywords: [p.firstName].filter(Boolean) as string[] }))

  // The links the current mode would create (before de-duping against what exists).
  const generated = useMemo(() => {
    if (mode === 'bands') {
      return familyLinksFromBands({
        grandparents: humanRoster.filter((k) => band[k] === 'grandparents'),
        parents: humanRoster.filter((k) => band[k] === 'parents'),
        children: humanRoster.filter((k) => band[k] === 'children'),
      })
    }
    return anchor
      ? familyLinksFromMatrix(
          anchor,
          humanRoster.filter((k) => k !== anchor).map((k) => ({ key: k, type: pick[k] ?? null })),
        )
      : []
  }, [mode, humanRoster, band, pick, anchor])
  const freshCount = useMemo(() => dedupeNewLinks(generated, links).length, [generated, links])

  const dnd = usePointerDnd({ onDrop: (key, zone) => moveTo(key, zone as Slot), holdMs: DND_HOLD_MS })

  function moveTo(key: string, slot: Slot) {
    setBand((prev) => {
      const next = { ...prev }
      if (slot === 'tray') delete next[key]
      else next[key] = slot
      return next
    })
  }

  function addToRoster(key: string) {
    setRoster((r) => (r.includes(key) ? r : [...r, key]))
  }
  function removeFromRoster(key: string) {
    setRoster((r) => r.filter((k) => k !== key))
    setBand(({ [key]: _drop, ...rest }) => rest)
    setPick(({ [key]: _drop, ...rest }) => rest)
    if (anchor === key) setAnchor(null)
  }

  async function addNewPerson() {
    const nm = newName.trim()
    if (!nm) return
    const parts = nm.split(/\s+/)
    const firstName = parts[0]
    const lastName = parts.slice(1).join(' ')
    const res = await write<{ id: string }>('cercle', {
      method: 'POST',
      body: { firstName, lastName },
      affectedKeys: [CERCLE_KEY, BOARD_KEY],
    })
    const id = res.queued ? null : res.data?.id ?? null
    setNewName('')
    if (!id) return // offline create is queued without an id — can't link it yet
    const p: Person = {
      kind: 'contact',
      id,
      key: personKey('contact', id),
      name: nm,
      firstName,
      lastName,
      avatarKind: null,
      avatarRef: null,
      colour: ACCENT,
      birthday: null,
      isChild: false,
      email: null,
      phone: null,
      gender: null,
    }
    setExtra((prev) => [...prev, p])
    addToRoster(p.key)
  }

  // Quick-create a pet by name (the full care fields live in the pet editor). POSTs
  // /api/pets, then drops it into the roster so save adds it to the family group.
  async function addNewPet() {
    const nm = newPet.trim()
    if (!nm) return
    const res = await write<{ id: string }>('pets', {
      method: 'POST',
      body: {
        name: nm,
        species: null,
        breed: null,
        birthday: null,
        microchip: null,
        feeding: null,
        sitterNotes: null,
        vetBusinessId: null,
        weights: [],
        colour: PET_COLOUR,
        photoKey: null,
        notes: null,
      },
      affectedKeys: [CERCLE_KEY, BOARD_KEY],
    })
    const id = res.queued ? null : res.data?.id ?? null
    setNewPet('')
    if (!id) return // offline create is queued without an id — can't link it yet
    const p: Person = {
      kind: 'pet',
      id,
      key: personKey('pet', id),
      name: nm,
      firstName: nm,
      lastName: '',
      avatarKind: null,
      avatarRef: null,
      colour: PET_COLOUR,
      birthday: null,
      isChild: false,
      email: null,
      phone: null,
      gender: null,
    }
    setExtra((prev) => [...prev, p])
    addToRoster(p.key)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      // Relationships-only (Maisonnée card): skip the group entirely, write links.
      if (linksOnly) {
        for (const g of dedupeNewLinks(generated, links)) {
          const a = parsePersonKey(g.aKey)
          const b = parsePersonKey(g.bKey)
          await write('cercle-links', {
            method: 'POST',
            body: { aId: a.id, aKind: a.kind, bId: b.id, bKind: b.kind, type: g.type },
            affectedKeys: [CERCLE_KEY],
          }).catch(() => {})
        }
        onSaved()
        return
      }
      const trimmed = name.trim() || suggestedName
      // 1. The family group: create it, or rename an existing one.
      let groupId = group?.id ?? null
      if (!groupId && trimmed) {
        const res = await write<{ id: string }>('cercle-groups', {
          method: 'POST',
          body: { name: trimmed, kind: 'family' },
          affectedKeys: [CERCLE_KEY],
        })
        groupId = res.queued ? null : res.data?.id ?? null
      } else if (groupId && trimmed && trimmed !== group?.name) {
        await write('cercle-groups', { method: 'PATCH', body: { id: groupId, name: trimmed }, affectedKeys: [CERCLE_KEY] }).catch(() => {})
      }
      // 2. Drop everyone into the group (best-effort; needs the id, INSERT OR IGNORE-safe).
      if (groupId) {
        for (const key of roster) {
          const { kind, id } = parsePersonKey(key)
          await write('cercle-groups', {
            method: 'POST',
            body: { groupId, personId: id, personKind: kind },
            affectedKeys: [CERCLE_KEY],
          }).catch(() => {})
        }
      }
      // 3. The relationships — only the ones not already present. A server-side dup
      // (race / already linked) 409s; we swallow it so one clash never aborts the batch.
      for (const g of dedupeNewLinks(generated, links)) {
        const a = parsePersonKey(g.aKey)
        const b = parsePersonKey(g.bKey)
        await write('cercle-links', {
          method: 'POST',
          body: { aId: a.id, aKind: a.kind, bId: b.id, bKind: b.kind, type: g.type },
          affectedKeys: [CERCLE_KEY],
        }).catch(() => {})
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  // The generational builder is human-only; never offer the « Animaux » group here.
  const relGroups = useMemo(() => relationshipPickerGroups(false), [])

  // One draggable face chip (bands mode) — the whole chip is the drag handle
  // (touch-action:none via the class); the ✕ removes from the family.
  const Chip = ({ p }: { p: Person }) => (
    <span
      className={'cercle-fam__chip' + (dnd.activeId === p.key ? ' is-dragging' : '')}
      onPointerDown={(e) => dnd.start(p.key, p.name, e)}
    >
      <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={p.colour} name={p.firstName} size={32} />
      <span className="cercle-fam__chip-name">{p.firstName}</span>
      <button
        type="button"
        className="cercle-fam__chip-x"
        aria-label={t.common.delete}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => removeFromRoster(p.key)}
      >
        <Icon name="x-bold" size={11} />
      </button>
    </span>
  )

  // A pet chip — like a face chip but never draggable (pets stay out of the bands);
  // the ✕ takes it back out of the family.
  const PetChip = ({ p }: { p: Person }) => (
    <span className="cercle-fam__chip">
      <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={p.colour} name={p.firstName} size={32} />
      <span className="cercle-fam__chip-name">{p.firstName}</span>
      <button type="button" className="cercle-fam__chip-x" aria-label={t.common.delete} onClick={() => removeFromRoster(p.key)}>
        <Icon name="x-bold" size={11} />
      </button>
    </span>
  )

  const tray = humanRoster.filter((k) => !band[k])

  return (
    <div className="cercle-fam">
      {/* Name — hidden in relationships-only mode (no group is created). */}
      {linksOnly ? (
        <p className="cercle-fam__hint mono">{t.cercle.familyLinksOnlyHint}</p>
      ) : (
        <label className="cf__field">
          <span className="cf__label">
            <Icon name="users-three-bold" size={14} /> {t.cercle.familyName}
          </span>
          <input
            className="cf__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggestedName || t.cercle.familyName}
          />
        </label>
      )}

      {/* Add people to the family */}
      <div className="cf__field">
        <span className="cf__label">{t.cercle.familyMembers}</span>
        <EntityCombobox<Person>
          value={addText}
          onChange={setAddText}
          options={addOptions}
          onPick={(opt) => {
            addToRoster(opt.id)
            setAddText('')
          }}
          placeholder={t.cercle.familyAddPerson}
          submitIcon={null}
          typeaheadOnly
        />
        <div className="cercle-fam__newrow">
          <input
            className="cf__input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.cercle.familyNewPerson}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addNewPerson()
              }
            }}
          />
          <button type="button" className="btn btn--sm" disabled={!newName.trim()} onClick={addNewPerson}>
            <Icon name="plus-bold" size={14} />
          </button>
        </div>
      </div>

      {humanRoster.length === 0 ? (
        <p className="cf__rels-empty mono">{t.cercle.familyEmpty}</p>
      ) : (
        <>
          {/* Mode toggle */}
          <div className="cercle-viewswitch" role="tablist" aria-label={t.cercle.familyMode}>
            {(['bands', 'matrix'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={'cercle-viewswitch__btn' + (mode === m ? ' is-active' : '')}
                onClick={() => setMode(m)}
              >
                <InlineIcon name={m === 'bands' ? 'tree-bold' : 'file-text-bold'} size={15} />{' '}
                {m === 'bands' ? t.cercle.familyModeBands : t.cercle.familyModeMatrix}
              </button>
            ))}
          </div>

          {mode === 'bands' ? (
            <div className="cercle-fam__bands">
              <p className="cercle-fam__hint mono">{t.cercle.familyBandsHint}</p>
              {/* Tray: people not yet placed */}
              <div
                className={'cercle-fam__zone cercle-fam__tray' + (dnd.over === 'tray' ? ' dnd-over' : '')}
                data-dnd-zone="tray"
              >
                <span className="cercle-fam__zone-label mono">{t.cercle.familyTray}</span>
                <div className="cercle-fam__chips">
                  {tray.map((k) => byKey.get(k)).map((p) => p && <Chip key={p.key} p={p} />)}
                  {tray.length === 0 && <span className="cercle-fam__zone-empty mono">—</span>}
                </div>
              </div>
              {/* Generation bands */}
              {FAMILY_BANDS.map((b) => {
                const here = humanRoster.filter((k) => band[k] === b)
                return (
                  <div
                    key={b}
                    className={'cercle-fam__zone' + (dnd.over === b ? ' dnd-over' : '')}
                    data-dnd-zone={b}
                  >
                    <span className="cercle-fam__zone-label mono">{t.cercle.familyBand[b]}</span>
                    <div className="cercle-fam__chips">
                      {here.map((k) => byKey.get(k)).map((p) => p && <Chip key={p.key} p={p} />)}
                      {here.length === 0 && <span className="cercle-fam__zone-empty mono">{t.cercle.familyDropHere}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="cercle-fam__matrix">
              <label className="cf__field">
                <span className="cf__label">{t.cercle.familyAnchor}</span>
                <select className="cf__input" value={anchor ?? ''} onChange={(e) => setAnchor(e.target.value || null)}>
                  <option value="">—</option>
                  {humanRoster.map((k) => byKey.get(k)).map((p) => p && <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
              </label>
              {anchor &&
                humanRoster
                  .filter((k) => k !== anchor)
                  .map((k) => byKey.get(k))
                  .map(
                    (p) =>
                      p && (
                        <div key={p.key} className="cercle-fam__mrow">
                          <Avatar kind={p.avatarKind} photo={p.avatarRef} colour={p.colour} name={p.firstName} size={32} />
                          <span className="cercle-fam__mrow-name">{p.firstName}</span>
                          <span className="cercle-fam__mrow-is mono">{t.cercle.isThe}</span>
                          <select
                            className="cf__input cercle-fam__mrow-sel"
                            value={pick[p.key] ?? ''}
                            onChange={(e) =>
                              setPick((prev) => {
                                const v = e.target.value as RelationshipType | ''
                                if (!v) {
                                  const { [p.key]: _drop, ...rest } = prev
                                  return rest
                                }
                                return { ...prev, [p.key]: v }
                              })
                            }
                          >
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
                          <button
                            type="button"
                            className="cercle-fam__chip-x"
                            aria-label={t.common.delete}
                            onClick={() => removeFromRoster(p.key)}
                          >
                            <Icon name="x-bold" size={11} />
                          </button>
                        </div>
                      ),
                  )}
            </div>
          )}
        </>
      )}

      {/* Animaux de la famille — add an existing pet or a new one. Pets join the family
          group on save (kind 'pet') and never enter the human bands. Hidden in the
          links-only Maisonnée flow (no group to attach them to). */}
      {!linksOnly && (
        <div className="cf__field">
          <span className="cf__label">
            <Icon name="smiley-bold" size={14} /> {t.cercle.familyPets}
          </span>
          <EntityCombobox<Person>
            value={petText}
            onChange={setPetText}
            options={addPetOptions}
            onPick={(opt) => {
              addToRoster(opt.id)
              setPetText('')
            }}
            placeholder={t.cercle.familyAddPet}
            submitIcon={null}
            typeaheadOnly
          />
          <div className="cercle-fam__newrow">
            <input
              className="cf__input"
              value={newPet}
              onChange={(e) => setNewPet(e.target.value)}
              placeholder={t.cercle.familyNewPet}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addNewPet()
                }
              }}
            />
            <button type="button" className="btn btn--sm" disabled={!newPet.trim()} onClick={addNewPet}>
              <Icon name="plus-bold" size={14} />
            </button>
          </div>
          {petRoster.length > 0 && (
            <div className="cercle-fam__chips">
              {petRoster.map((k) => byKey.get(k)).map((p) => p && <PetChip key={p.key} p={p} />)}
            </div>
          )}
          <p className="cercle-fam__hint mono">{t.cercle.familyPetsHint}</p>
        </div>
      )}

      {/* Save */}
      <div className="cf__save">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || (linksOnly ? freshCount === 0 : !name.trim() && !suggestedName && !group)}
          onClick={save}
        >
          <Icon name="check-bold" size={18} />{' '}
          {linksOnly ? t.cercle.familySaveLinks : group ? t.cercle.familySaveEdit : t.cercle.familySave}
          {freshCount > 0 && <span className="cercle-fam__count">{t.cercle.familyLinkCount(freshCount)}</span>}
        </button>
      </div>

      <DragGhost ghost={dnd.ghost} />
    </div>
  )
}
