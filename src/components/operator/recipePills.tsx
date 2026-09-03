import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { RECIPE_TAGS_KEY, type RecipeTagsData, tagOptions } from '../../lib/recipes'
import {
  type Pill,
  type CustomPill,
  type Criterion,
  type CriterionField,
  type BuiltinKey,
  DEFAULT_PILLS,
  NUM_FIELDS,
  isBuiltinPill,
  isNumCriterion,
  critTags,
  pillKey,
} from '../../lib/recipePills'
import { wash, tintInk, edge } from '../../lib/colors'
import { useConfirm } from '../../lib/confirm'
import { useWrite } from '../../lib/write'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost } from '../../lib/dnd'
import { Icon, InlineIcon } from '../Icon'
import { ColorPicker } from '../ColorPicker'
import { DragPill } from '../DragPill'
import { RowActions } from '../RowActions'
import { Chip } from '../Chip'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ Recettes → the recipe-tab PILLS (migration 0045). One ordered list:
// built-in pills (shown/hidden + reorder) plus operator-defined CUSTOM pills (a
// label + colour + attribute rules). Drag the ⠿ grip to reorder; the eye toggles a
// pill on the recipe tab; custom pills also rename / recolour / drop. A custom pill
// is a calm one-tap filter — its rules (AND-ed) test recipe attributes (time,
// ingredient count, servings, a tag, favourite, photo). Saved whole via setPills.
const CRITERION_FIELDS: CriterionField[] = [...NUM_FIELDS, 'tag', 'favorite', 'photo']
const MINUTE_FIELDS = new Set(['totalMin', 'prepMin', 'cookMin'])

// A whole-number field that keeps a local draft string so it can be transiently
// empty or half-typed. A number-coerced controlled input snaps back to 0 the
// instant it empties (`Number('') || 0`), forcing a backspace-first dance when
// you just want to retype the value. We commit a clamped number on blur and sync
// the draft down when the parent value changes.
function NumField({
  value,
  onChange,
  min = 0,
  className,
  ariaLabel,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  className?: string
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      aria-label={ariaLabel}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        setDraft(digits)
        if (digits) onChange(Math.max(min, Math.round(Number(digits))))
      }}
      onBlur={() => {
        const n = Math.max(min, Math.round(Number(draft) || min))
        setDraft(String(n))
        onChange(n)
      }}
    />
  )
}

export function RecipePillsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const write = useWrite()
  const ro = isGuest()
  const tagsQ = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') })
  // Tags an operator can target with a "tag" rule (saved presets + ones in use).
  const tagList = tagOptions(tagsQ.data?.presets ?? [], (tagsQ.data?.used ?? []).map((u) => u.tag), t.recipes.tagPresets)

  // Local working copy, seeded from the server and saved whole on each change.
  const [local, setLocal] = useState<Pill[] | null>(null)
  const list = local ?? tagsQ.data?.pills ?? DEFAULT_PILLS

  const patch = useMutation({
    // Through useWrite so the pill layout survives a save made offline (it is an
    // ordinary household preference — no blob, nothing to read back synchronously).
    mutationFn: (next: Pill[]) =>
      write('recipe-tags', { method: 'PATCH', body: { setPills: next }, affectedKeys: [RECIPE_TAGS_KEY] }),
    onSettled: () => qc.invalidateQueries({ queryKey: RECIPE_TAGS_KEY }),
  })
  const save = (next: Pill[]) => {
    setLocal(next)
    patch.mutate(next)
  }

  // Localized name for a built-in pill (mirrors the recipe-tab labels).
  const BUILTIN_LABEL: Record<BuiltinKey, string> = {
    cookable: t.recipes.cookable,
    useSoon: t.recipes.useItUp,
    fast: t.recipes.fast30,
    neglected: t.recipes.neglected,
    favorites: t.recipes.favorites,
    recent: t.recipes.recentlyAdded,
  }
  const pillLabel = (p: Pill) => (isBuiltinPill(p) ? BUILTIN_LABEL[p.k] : p.label)

  // --- reorder (drag the grip onto another row) ---
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    save(next)
  }
  const dnd = usePointerDnd({
    onDrop: (from, to) => move(Number(from), Number(to)),
    canDrop: (from, to) => from !== to,
  })

  const toggleHide = (i: number) => save(list.map((p, j) => (j === i ? ({ ...p, off: !p.off } as Pill) : p)))
  const removeCustom = (i: number) => save(list.filter((_, j) => j !== i))

  // --- custom pill editor (add / edit) ---
  const [draft, setDraft] = useState<CustomPill | null>(null)
  const startAdd = () => setDraft({ id: crypto.randomUUID(), label: '', rules: [{ field: 'totalMin', op: 'lte', n: 30 }] })
  const startEdit = (p: CustomPill) => setDraft({ ...p, rules: p.rules.map((r) => ({ ...r })) })
  // A tag rule needs ≥1 tag; numeric/flag rules are always shaped-valid.
  const ruleValid = (c: Criterion) => c.field !== 'tag' || critTags(c).length > 0
  const draftValid =
    !!draft && draft.label.trim().length > 0 && draft.rules.length > 0 && draft.rules.every(ruleValid)
  function commitDraft() {
    if (!draft || !draftValid) return
    const clean: CustomPill = { ...draft, label: draft.label.trim() }
    const exists = list.some((p) => !isBuiltinPill(p) && p.id === clean.id)
    save(exists ? list.map((p) => (!isBuiltinPill(p) && p.id === clean.id ? clean : p)) : [...list, clean])
    setDraft(null)
  }

  // Build a criterion of the right shape when the field changes.
  const blankFor = (field: CriterionField): Criterion =>
    field === 'tag'
      ? { field: 'tag', tags: tagList[0] ? [tagList[0]] : [] }
      : field === 'favorite' || field === 'photo'
        ? { field }
        : { field, op: 'lte', n: MINUTE_FIELDS.has(field) ? 30 : 5 }
  const setRule = (i: number, c: Criterion) => setDraft((d) => (d ? { ...d, rules: d.rules.map((r, j) => (j === i ? c : r)) } : d))
  const addRule = () => setDraft((d) => (d ? { ...d, rules: [...d.rules, blankFor('totalMin')] } : d))
  const removeRule = (i: number) => setDraft((d) => (d ? { ...d, rules: d.rules.filter((_, j) => j !== i) } : d))

  const fieldLabel = (f: string) => t.operator.pillFieldName(f)
  const ruleText = (c: Criterion): string => {
    if (c.field === 'tag') {
      const tags = critTags(c)
      // OR within the rule reads as "Végé ou Végan".
      return `${fieldLabel('tag')}: ${tags.length ? tags.join(` ${t.operator.pillRuleOr} `) : '—'}`
    }
    if (c.field === 'favorite' || c.field === 'photo') return fieldLabel(c.field)
    const unit = MINUTE_FIELDS.has(c.field) ? ' min' : ''
    return `${fieldLabel(c.field)} ${c.op === 'gte' ? '≥' : '≤'} ${c.n}${unit}`
  }

  return (
    <OperatorSection title={t.operator.pillsTitle} help={help} helpKey="recipePills">
      <ul className="operator__list pill-admin__list">
        {list.map((p, i) => {
          const custom = !isBuiltinPill(p)
          const hidden = !!p.off
          const hex = custom ? p.color : undefined
          const chipStyle = hex ? { background: wash(hex), color: tintInk(hex), borderColor: edge(hex) } : undefined
          return (
            <DragPill
              key={pillKey(p)}
              as="li"
              dnd={dnd}
              index={i}
              label={pillLabel(p)}
              className={'pill-admin__row' + (hidden ? ' is-hidden' : '')}
              gripClassName="pill-admin__grip"
              showGrip={!ro}
              onMove={ro ? undefined : (dir) => move(i, dir === 'up' ? i - 1 : i + 1)}
            >
              <Chip className="pill-admin__chip" style={chipStyle}>
                {pillLabel(p)}
              </Chip>
              {custom && <span className="pill-admin__rules mono">{p.rules.map(ruleText).join(' · ')}</span>}
              {!ro && (
                <button
                  type="button"
                  className={'pill-admin__eye' + (hidden ? '' : ' is-on')}
                  onClick={() => toggleHide(i)}
                  aria-pressed={!hidden}
                  aria-label={hidden ? t.operator.pillShow : t.operator.pillHide}
                  title={hidden ? t.operator.pillShow : t.operator.pillHide}
                >
                  <Icon name={hidden ? 'x-bold' : 'check-bold'} size={16} />
                </button>
              )}
              {!ro && custom && (
                <RowActions
                  editLabel={t.operator.pillEdit}
                  deleteLabel={t.operator.pillRemove}
                  onEdit={() => startEdit(p)}
                  onDelete={async () => {
                    if (await confirm({ message: t.operator.pillRemoveConfirm(p.label), confirmLabel: t.operator.pillRemove, tone: 'danger' }))
                      removeCustom(i)
                  }}
                />
              )}
            </DragPill>
          )
        })}
      </ul>

      {!ro && !draft && (
        <button type="button" className="btn" onClick={startAdd}>
          <InlineIcon name="plus-bold" size={14} /> {t.operator.pillAdd}
        </button>
      )}

      {!ro && draft && (
        <div className="pill-admin__editor surface">
          <input
            className="input"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder={t.operator.pillNamePlaceholder}
            aria-label={t.operator.pillNamePlaceholder}
            maxLength={24}
            autoFocus
          />
          <ColorPicker value={draft.color ?? ''} onChange={(c) => setDraft({ ...draft, color: c })} label={t.operator.pillColor} />

          <div className="pill-admin__rules-edit">
            {draft.rules.map((c, i) => (
              <div key={i} className="pill-admin__rule">
                <select
                  className="input"
                  value={c.field}
                  onChange={(e) => setRule(i, blankFor(e.target.value as CriterionField))}
                  aria-label={t.operator.pillRuleField}
                >
                  {CRITERION_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {fieldLabel(f)}
                    </option>
                  ))}
                </select>
                {isNumCriterion(c) ? (
                  <>
                    <select
                      className="input pill-admin__op"
                      value={c.op}
                      onChange={(e) => setRule(i, { ...c, op: e.target.value === 'gte' ? 'gte' : 'lte' })}
                      aria-label={t.operator.pillRuleOp}
                    >
                      <option value="lte">≤</option>
                      <option value="gte">≥</option>
                    </select>
                    <NumField
                      className="input pill-admin__num"
                      min={0}
                      value={c.n}
                      onChange={(n) => setRule(i, { ...c, n })}
                      ariaLabel={t.operator.pillRuleValue}
                    />
                    {MINUTE_FIELDS.has(c.field) && <span className="pill-admin__unit mono">min</span>}
                  </>
                ) : c.field === 'tag' ? (
                  // Multi-select: tap each tag to include it (OR within this rule).
                  // "Souper végé" without timing = two tags here; add a time rule to
                  // narrow further (rules AND).
                  <div className="pill-admin__tagpick" role="group" aria-label={fieldLabel('tag')}>
                    {tagList.map((tg) => {
                      const sel = critTags(c).some((x) => x.toLowerCase() === tg.toLowerCase())
                      return (
                        <Chip
                          key={tg}
                          className="pill-admin__tagopt"
                          selected={sel}
                          onClick={() => {
                            const cur = critTags(c)
                            const next = sel
                              ? cur.filter((x) => x.toLowerCase() !== tg.toLowerCase())
                              : [...cur, tg]
                            setRule(i, { field: 'tag', tags: next })
                          }}
                        >
                          {tg}
                        </Chip>
                      )
                    })}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="pill-admin__rule-x"
                  onClick={() => removeRule(i)}
                  aria-label={t.operator.pillRuleRemove}
                >
                  <InlineIcon name="x-bold" size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn--ghost mono pill-admin__addrule" onClick={addRule}>
              <InlineIcon name="plus-bold" size={12} /> {t.operator.pillRuleAdd}
            </button>
          </div>

          <div className="pill-admin__editor-actions">
            <button type="button" className="btn" disabled={!draftValid} onClick={commitDraft}>
              {t.operator.pillSave}
            </button>
            <button type="button" className="btn btn--ghost mono" onClick={() => setDraft(null)}>
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}
      <DragGhost ghost={dnd.ghost} />
    </OperatorSection>
  )
}
