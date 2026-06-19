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
  groupedRelationshipTypes,
  relLabel,
  familyLinksFromBands,
  familyLinksFromMatrix,
  dedupeNewLinks,
} from '../../lib/cercle'
import { Avatar } from '../Avatar'
import { Icon, InlineIcon } from '../Icon'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'

const ACCENT = '#C45E86'
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
  onSaved,
}: {
  people: Person[]
  links: ContactLink[]
  group: ContactGroupRaw | null
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

  // Roster = everyone in this family. Seeded from the group being edited.
  const [roster, setRoster] = useState<string[]>(() =>
    group ? group.memberKeys.map((m) => personKey(m.personKind, m.personId)) : [],
  )
  const [band, setBand] = useState<Record<string, FamilyBand>>({})
  const [pick, setPick] = useState<Record<string, RelationshipType>>({})
  const [anchor, setAnchor] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('bands')
  const [name, setName] = useState(group?.name ?? '')
  const [addText, setAddText] = useState('')
  const [newName, setNewName] = useState('')
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
  const addOptions: ComboOption<Person>[] = allPeople
    .filter((p) => !rosterSet.has(p.key))
    .map((p) => ({ id: p.key, label: p.name, data: p, icon: p.kind === 'member' ? 'users-three-bold' : 'user-bold' }))

  // The links the current mode would create (before de-duping against what exists).
  const generated = useMemo(() => {
    if (mode === 'bands') {
      return familyLinksFromBands({
        grandparents: roster.filter((k) => band[k] === 'grandparents'),
        parents: roster.filter((k) => band[k] === 'parents'),
        children: roster.filter((k) => band[k] === 'children'),
      })
    }
    return anchor
      ? familyLinksFromMatrix(
          anchor,
          roster.filter((k) => k !== anchor).map((k) => ({ key: k, type: pick[k] ?? null })),
        )
      : []
  }, [mode, roster, band, pick, anchor])
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

  async function save() {
    if (saving) return
    setSaving(true)
    try {
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

  const relGroups = useMemo(() => groupedRelationshipTypes(), [])

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

  const tray = roster.filter((k) => !band[k])

  return (
    <div className="cercle-fam">
      {/* Name */}
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

      {roster.length === 0 ? (
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
                const here = roster.filter((k) => band[k] === b)
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
                  {roster.map((k) => byKey.get(k)).map((p) => p && <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
              </label>
              {anchor &&
                roster
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

      {/* Save */}
      <div className="cf__save">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || (!name.trim() && !suggestedName && !group)}
          onClick={save}
        >
          <Icon name="check-bold" size={18} />{' '}
          {group ? t.cercle.familySaveEdit : t.cercle.familySave}
          {freshCount > 0 && <span className="cercle-fam__count">{t.cercle.familyLinkCount(freshCount)}</span>}
        </button>
      </div>

      <DragGhost ghost={dnd.ghost} />
    </div>
  )
}
