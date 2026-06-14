import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, isStatus } from '../lib/api'
import { resizeImage, PHOTO_MAX, MAX_UPLOAD_BYTES } from '../lib/image'
import {
  type Recipe,
  type RecipeOriginal,
  type RecipeTagsData,
  RECIPES_KEY,
  RECIPE_TAGS_KEY,
  recipeImg,
  tagOptions,
} from '../lib/recipes'
import { SECTION_PREFIX, dropDanglingHeadings } from '../lib/recipeSections'
import { Icon, InlineIcon } from './Icon'
import { useModal } from '../lib/useModal'

// In the EDITOR a row is a section row as soon as it carries the "## " marker —
// even with the title still empty ("## "), so typing the name doesn't flip the
// row back to a plain line. (The stricter isSectionHeading needs a non-empty
// title; empty section rows are dropped on save.)
const isHeadingRow = (v: string): boolean => /^##\s?/.test(v)
const headingTitle = (v: string): string => v.replace(/^##\s?/, '')

// Create / edit a recipe. Two ways to fill it fast, then free editing:
//   📷 read a photo (the vision model OCRs a cookbook page / handwritten card
//   into title+ingredients+steps) · 🔗 import from a URL or pasted text.
// Owns its own POST/PATCH + image upload; calls onSaved() when done. A modal
// overlay (opened from the Kitchen recipes section). The dish's display picture
// is a separate control at the top — distinct from "read a photo".
type LineKind = 'ingredients' | 'steps'

export function RecipeForm({
  value,
  onSaved,
  onCancel,
}: {
  value?: Recipe | null
  onSaved: () => void
  onCancel: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const modalRef = useRef<HTMLDivElement>(null)
  useModal(modalRef, onCancel)
  const [title, setTitle] = useState(value?.title ?? '')
  // Keep at least one empty row so there's always somewhere to type.
  const [ingredients, setIngredients] = useState<string[]>(value?.ingredients?.length ? value.ingredients : [''])
  const [steps, setSteps] = useState<string[]>(value?.steps?.length ? value.steps : [''])
  const [servings, setServings] = useState(value?.servings ? String(value.servings) : '')
  // Yield unit ("biscuits") + real time fields (minutes) — imports prefill,
  // freely editable by hand afterwards.
  const [servingsUnit, setServingsUnit] = useState(value?.servingsUnit ?? '')
  const [prepMin, setPrepMin] = useState(value?.prepMin ? String(value.prepMin) : '')
  const [cookMin, setCookMin] = useState(value?.cookMin ? String(value.cookMin) : '')
  const [totalMin, setTotalMin] = useState(value?.totalMin ? String(value.totalMin) : '')
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [tags, setTags] = useState<string[]>(value?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [source, setSource] = useState<string | null>(value?.source ?? null)
  const [image, setImage] = useState<string | null>(value?.image ?? null)
  // The as-imported snapshot, kept verbatim across edits; a fresh import
  // replaces it. Saved alongside the card so the sheet can show "the original".
  const [original, setOriginal] = useState<RecipeOriginal | null>(value?.original ?? null)

  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [readMsg, setReadMsg] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importText, setImportText] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  // Steps edit ONE at a time in a roomy memo (index being edited, or null). Avoids
  // a wall of always-open single-line boxes and gives space to format a step over
  // several lines.
  const [editStep, setEditStep] = useState<number | null>(null)

  // The pill offer: household presets (Réglages → Recettes) or the built-in
  // starters, plus every tag already used on a recipe — a tag typed once
  // ("Collation") is a one-tap pill from then on.
  const tagsQ = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') })
  const pills = tagOptions(
    tagsQ.data?.presets ?? [],
    (tagsQ.data?.used ?? []).map((u) => u.tag),
    t.recipes.tagPresets,
  )

  const hasTag = (tag: string) => tags.some((x) => x.toLowerCase() === tag.toLowerCase())
  const toggleTag = (tag: string) =>
    setTags((ts) => (hasTag(tag) ? ts.filter((x) => x.toLowerCase() !== tag.toLowerCase()) : [...ts, tag]))
  function addTag() {
    const s = tagInput.trim()
    if (s && !hasTag(s)) setTags((ts) => [...ts, s])
    setTagInput('')
  }

  const lines = (kind: LineKind) => (kind === 'ingredients' ? ingredients : steps)
  const setLines = (kind: LineKind) => (kind === 'ingredients' ? setIngredients : setSteps)
  const updateLine = (kind: LineKind, i: number, v: string) =>
    setLines(kind)(lines(kind).map((x, idx) => (idx === i ? v : x)))
  const addLine = (kind: LineKind, v = '') => setLines(kind)([...lines(kind), v])
  const removeLine = (kind: LineKind, i: number) => {
    const next = lines(kind).filter((_, idx) => idx !== i)
    setLines(kind)(next.length ? next : [''])
  }
  // ↑/↓ swap a row with its neighbour — reordering without drag-and-drop (which
  // fights the page scroll on a phone). The open step memo follows its step.
  const moveLine = (kind: LineKind, i: number, delta: -1 | 1) => {
    const arr = [...lines(kind)]
    const j = i + delta
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setLines(kind)(arr)
    if (kind === 'steps') setEditStep((es) => (es === i ? j : es === j ? i : es))
  }
  // Pasting a multi-line block into one row spreads it over rows (bullets,
  // leading step numbers AND "Étape 3 :" / "Step 2" labels stripped — the
  // editor numbers steps itself, same rules as the server's stripStepPrefix),
  // so fixing an import by copy-pasting a section never means typing line by
  // line. A short label line ending in ":" ("Glaçage :") becomes a section row.
  const pasteLines = (kind: LineKind, i: number, pasted: string): boolean => {
    const parts = pasted
      .split(/\r?\n/)
      .map((s) =>
        s
          .replace(/^[•·▪◦‣*–—-]+\s*/, '')
          .replace(/^(?:[ée]tapes?|steps?)\s*\d{1,2}\s*(?:[:.)\-–—]\s*)?/i, '')
          .replace(/^\d{1,2}\s*[.):\-–—]\s+/, '')
          .trim(),
      )
      .filter(Boolean)
      .map((s) => {
        if (isHeadingRow(s)) return s
        const sec = s.match(/^([^.!?:;,]{2,40}):$/)
        return sec && !/\d/.test(sec[1]) ? SECTION_PREFIX + sec[1].trim() : s
      })
    if (parts.length <= 1) return false
    const cur = lines(kind)
    setLines(kind)([...cur.slice(0, i), ...(cur[i].trim() ? [cur[i], ...parts] : parts), ...cur.slice(i + 1)])
    return true
  }

  // Drop the draft into the form. Replaces empty-only sections; never clobbers
  // lines the user already typed. Also stashes the untouched snapshot so the
  // saved recipe remembers exactly what the import produced.
  type Draft = {
    title?: string | null
    ingredients?: string[]
    steps?: string[]
    servings?: number | null
    servingsUnit?: string | null
    times?: { prep: number | null; cook: number | null; total: number | null }
    source?: string | null
  }
  function applyDraft(d: Draft) {
    if (d.title && !title.trim()) setTitle(d.title)
    if (d.ingredients?.length && ingredients.every((x) => !x.trim())) setIngredients(d.ingredients)
    if (d.steps?.length && steps.every((x) => !x.trim())) setSteps(d.steps)
    if (d.servings && !servings.trim()) setServings(String(d.servings))
    if (d.servingsUnit && !servingsUnit.trim()) setServingsUnit(d.servingsUnit)
    // Prep/cook/total land in their REAL fields now (editable like the rest).
    if (d.times) {
      if (d.times.prep && !prepMin.trim()) setPrepMin(String(d.times.prep))
      if (d.times.cook && !cookMin.trim()) setCookMin(String(d.times.cook))
      if (d.times.total && !totalMin.trim()) setTotalMin(String(d.times.total))
    }
    if (d.ingredients?.length || d.steps?.length) {
      setOriginal({
        title: d.title ?? null,
        ingredients: d.ingredients ?? [],
        steps: d.steps ?? [],
        servings: d.servings ?? null,
        source: d.source ?? null,
        importedAt: Math.floor(Date.now() / 1000),
      })
    }
  }

  // Read a recipe out of a photo (cookbook page, handwritten card, screenshot):
  // the vision model OCRs + structures it, then we drop the result into the
  // empty fields (applyDraft never clobbers what's already typed). The picked
  // file is only sent for reading — it does NOT become the dish's display photo.
  async function readPhoto(file: File) {
    if (reading) return
    setReading(true)
    setReadMsg(null)
    try {
      const blob = await resizeImage(file, PHOTO_MAX)
      // resize fell back to the un-shrunk original (a format no decoder could
      // read) and it's over the server cap — say so instead of uploading just to
      // get a generic reject. After HEIC handling this is rare (a corrupt/exotic
      // file), but it's the difference between "trop lourde" and silent failure.
      if (blob.size > MAX_UPLOAD_BYTES) {
        setReadMsg(t.recipes.photoTooBig)
        return
      }
      const r = await api<{ title: string | null; ingredients: string[]; steps: string[] }>('recipe-vision', {
        method: 'POST',
        body: blob,
      })
      if (!r.title && !r.ingredients.length && !r.steps.length) setReadMsg(t.recipes.readFail)
      else applyDraft(r)
    } catch (e) {
      if (isStatus(e, 503)) setReadMsg(t.recipes.aiOff)
      else if (isStatus(e, 400)) setReadMsg(t.recipes.photoTooBig)
      else setReadMsg(t.recipes.readFail)
    } finally {
      setReading(false)
    }
  }

  async function runImport() {
    const url = importUrl.trim()
    const text = importText.trim()
    if ((!url && !text) || importing) return
    setImporting(true)
    setImportMsg(null)
    try {
      const r = await api<{
        title: string | null
        ingredients: string[]
        steps: string[]
        servings: number | null
        servingsUnit: string | null
        times: { prep: number | null; cook: number | null; total: number | null }
        image: string | null
        source: string | null
        empty?: boolean
      }>('recipe-import', { method: 'POST', body: text ? { text } : { url } })
      if (r.empty || (!r.ingredients.length && !r.steps.length && !r.title)) {
        setImportMsg(t.recipes.importFail)
      } else {
        applyDraft(r)
        if (r.image && !image) setImage(r.image)
        if (r.source) setSource(r.source)
        setShowImport(false)
      }
    } catch (e) {
      setImportMsg(isStatus(e, 503) ? t.recipes.aiOff : t.recipes.importFail)
    } finally {
      setImporting(false)
    }
  }

  async function uploadPhoto(file: File) {
    setUploading(true)
    try {
      const blob = await resizeImage(file, PHOTO_MAX)
      const { key } = await api<{ key: string }>('recipe-image', { method: 'POST', body: blob })
      setImage(key)
    } catch {
      /* storage off / failure — leave the picture unset, never block the form */
    } finally {
      setUploading(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    // A section row with no title ("## ") and a heading with nothing under it
    // are editing leftovers, not content — both drop here.
    const cleanRows = (xs: string[]) =>
      dropDanglingHeadings(xs.map((s) => s.trim()).filter((s) => s && !/^##$/.test(s)))
    const fields = {
      title: title.trim(),
      ingredients: cleanRows(ingredients),
      steps: cleanRows(steps),
      servings: servings.trim() ? Number(servings) : null,
      servingsUnit: servingsUnit.trim() || null,
      prepMin: prepMin.trim() ? Number(prepMin) : null,
      cookMin: cookMin.trim() ? Number(cookMin) : null,
      totalMin: totalMin.trim() ? Number(totalMin) : null,
      notes: notes.trim() || null,
      source,
      image,
      tags,
      original,
    }
    await api('recipes', {
      method: value ? 'PATCH' : 'POST',
      body: value ? { id: value.id, ...fields } : fields,
    }).catch(() => {})
    setBusy(false)
    qc.invalidateQueries({ queryKey: RECIPES_KEY })
    // A freshly typed tag becomes part of the pill offer next time.
    qc.invalidateQueries({ queryKey: RECIPE_TAGS_KEY })
    onSaved()
  }

  const imgSrc = recipeImg(image)

  // The ↑/↓ pair every row gets (ingredient, step, or section) — tap-to-reorder.
  const moveButtons = (kind: LineKind, i: number) => (
    <span className="recipe-line__move">
      <button
        type="button"
        className="recipe-line__mv mono"
        onClick={() => moveLine(kind, i, -1)}
        disabled={i === 0}
        aria-label={t.recipes.moveUp}
      >
        <Icon name="caret-up-bold" size={16} />
      </button>
      <button
        type="button"
        className="recipe-line__mv mono"
        onClick={() => moveLine(kind, i, 1)}
        disabled={i === lines(kind).length - 1}
        aria-label={t.recipes.moveDown}
      >
        <Icon name="caret-down-bold" size={16} />
      </button>
    </span>
  )

  const lineEditor = (kind: LineKind, placeholder: string) => (
    <div className="recipe-lines">
      {lines(kind).map((v, i) => {
        // A section row edits its TITLE; the "## " marker stays in the value.
        const sec = isHeadingRow(v)
        const shown = sec ? headingTitle(v) : v
        return (
          <div key={i} className={'recipe-line' + (sec ? ' recipe-line--sec' : '')}>
            <input
              className="input"
              value={shown}
              onChange={(e) => updateLine(kind, i, sec ? SECTION_PREFIX + e.target.value : e.target.value)}
              placeholder={sec ? t.recipes.sectionPlaceholder : placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (i === lines(kind).length - 1 && shown.trim()) addLine(kind)
                } else if (e.key === 'Backspace' && !shown && lines(kind).length > 1) {
                  e.preventDefault()
                  removeLine(kind, i)
                }
              }}
              onPaste={(e) => {
                if (!sec && pasteLines(kind, i, e.clipboardData.getData('text'))) e.preventDefault()
              }}
            />
            {moveButtons(kind, i)}
            <button
              type="button"
              className="recipe-line__del mono"
              onClick={() => removeLine(kind, i)}
              aria-label={t.recipes.removePhoto}
            >
              <Icon name="x-bold" size={14} />
            </button>
          </div>
        )
      })}
      <div className="recipe-add-row">
        <button type="button" className="btn btn--ghost mono recipe-add-line" onClick={() => addLine(kind)}>
          ＋ {kind === 'ingredients' ? t.recipes.addIngredient : t.recipes.addStep}
        </button>
        <button
          type="button"
          className="btn btn--ghost mono recipe-add-line"
          onClick={() => addLine(kind, SECTION_PREFIX)}
        >
          ＋ {t.recipes.addSection}
        </button>
      </div>
    </div>
  )

  // Steps editor: one-at-a-time memo. Collapsed, a step is a tappable preview of
  // its own text (wraps, keeps line breaks); the ✎ opens ONE roomy textarea where
  // it can be written/formatted over several lines. "Terminé" — or opening another
  // step — closes it, so the list is never a stack of open boxes.
  const stepsEditor = (
    <div className="recipe-steps">
      {steps.map((v, i) =>
        // A section row among the steps: a plain title input, no number, no memo.
        isHeadingRow(v) ? (
          <div key={i} className="recipe-line recipe-line--sec">
            <input
              className="input"
              value={headingTitle(v)}
              onChange={(e) => updateLine('steps', i, SECTION_PREFIX + e.target.value)}
              placeholder={t.recipes.sectionPlaceholder}
            />
            {moveButtons('steps', i)}
            <button
              type="button"
              className="recipe-line__del mono"
              onClick={() => removeLine('steps', i)}
              aria-label={t.recipes.removePhoto}
            >
              <Icon name="x-bold" size={14} />
            </button>
          </div>
        ) : (
        <div key={i} className={'recipe-step' + (editStep === i ? ' is-editing' : '')}>
          <span className="recipe-step__n mono">{steps.slice(0, i).filter((s) => !isHeadingRow(s)).length + 1}</span>
          {editStep === i ? (
            <div className="recipe-step__edit">
              <textarea
                className="input recipe-step__memo"
                autoFocus
                value={v}
                onChange={(e) => updateLine('steps', i, e.target.value)}
                placeholder={t.recipes.stepPlaceholder}
                rows={4}
              />
              <div className="recipe-step__actions">
                <button
                  type="button"
                  className="btn btn--ghost mono recipe-step__del"
                  onClick={() => {
                    removeLine('steps', i)
                    setEditStep(null)
                  }}
                >
                  <InlineIcon name="x-bold" size={13} /> {t.recipes.removeStep}
                </button>
                <button type="button" className="btn btn--primary mono" onClick={() => setEditStep(null)}>
                  {t.recipes.stepDone}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="recipe-step__open"
                onClick={() => setEditStep(i)}
                aria-label={t.recipes.editStep}
              >
                <span className={'recipe-step__text' + (v.trim() ? '' : ' is-empty')}>
                  {v.trim() || t.recipes.stepPlaceholder}
                </span>
                <span className="recipe-step__cue mono" aria-hidden="true">
                  <InlineIcon name="pencil-simple-bold" size={13} />
                </span>
              </button>
              {moveButtons('steps', i)}
            </>
          )}
        </div>
        ),
      )}
      <div className="recipe-add-row">
        <button
          type="button"
          className="btn btn--ghost mono recipe-add-line"
          onClick={() => {
            addLine('steps')
            setEditStep(steps.length) // open the freshly added step right away
          }}
        >
          ＋ {t.recipes.addStep}
        </button>
        <button
          type="button"
          className="btn btn--ghost mono recipe-add-line"
          onClick={() => addLine('steps', SECTION_PREFIX)}
        >
          ＋ {t.recipes.addSection}
        </button>
      </div>
    </div>
  )

  return (
    <div ref={modalRef} className="recipe-modal" role="dialog" aria-modal="true" aria-label={value ? t.recipes.edit : t.recipes.new}>
      <div className="recipe-modal__scrim" onClick={onCancel} aria-hidden="true" />
      <form className="recipe-modal__card surface" onSubmit={save}>
        <div className="recipe-modal__bar">
          <h2>{value ? t.recipes.edit : t.recipes.new}</h2>
          <button type="button" className="btn btn--ghost mono" onClick={onCancel} aria-label={t.common.cancel}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>

        <div className="recipe-modal__body">
          {/* Photo */}
          <div className="recipe-photo">
            {imgSrc ? (
              <div className="recipe-photo__has">
                <img src={imgSrc} alt="" />
                <button type="button" className="btn btn--ghost mono" onClick={() => setImage(null)}>
                  {t.recipes.removePhoto}
                </button>
              </div>
            ) : (
              <label className="btn btn--ghost mono recipe-photo__add">
                {uploading ? '…' : t.recipes.addPhoto}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadPhoto(f)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
          </div>

          {/* No autoFocus: on a phone it would summon the keyboard over the
              just-opened form (hiding the photo/import helpers); autoComplete
              off keeps iOS from offering contact names for a recipe title. */}
          <input
            className="input recipe-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.recipes.titlePlaceholder}
            autoComplete="off"
          />

          {/* Fast-fill helpers — distinct from the dish photo above: these READ a
              recipe (scan a card / import a link) into the fields. */}
          <span className="recipe-fill-label mono">{t.recipes.fillFrom}</span>
          <div className="recipe-helpers">
            <label className={'btn btn--ghost mono' + (reading ? ' is-busy' : '')}>
              {reading ? t.recipes.reading : t.recipes.readPhoto}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={reading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) readPhoto(f)
                  e.target.value = ''
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost mono"
              onClick={() => setShowImport((s) => !s)}
              aria-expanded={showImport}
            >
              {t.recipes.import}
            </button>
          </div>
          {readMsg && <p className="recipe-aioff mono">{readMsg}</p>}

          {showImport && (
            <div className="recipe-import">
              <input
                className="input"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder={t.recipes.importUrl}
                inputMode="url"
              />
              <textarea
                className="input recipe-import__paste"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={t.recipes.importPaste}
                rows={3}
              />
              <button
                type="button"
                className="btn mono"
                onClick={runImport}
                disabled={importing || (!importUrl.trim() && !importText.trim())}
              >
                {importing ? t.recipes.importing : t.recipes.importBtn}
              </button>
              {importMsg && <p className="recipe-aioff mono">{importMsg}</p>}
            </div>
          )}

          {/* Ingredients */}
          <h3 className="recipe-sec-h">
            <Icon name="carrot-bold" size={18} color="var(--terracotta-deep)" /> {t.recipes.ingredients}
          </h3>
          {lineEditor('ingredients', t.recipes.ingredientPlaceholder)}

          {/* Steps */}
          <h3 className="recipe-sec-h">
            <Icon name="pencil-simple-bold" size={18} color="var(--berry-deep)" /> {t.recipes.steps}
          </h3>
          {stepsEditor}

          {/* Servings (+ optional unit: "24 biscuits") + times + notes */}
          <div className="recipe-meta-row">
            <label className="recipe-servings mono">
              {t.recipes.servings}
              <input
                className="input"
                type="number"
                min="1"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </label>
            <input
              className="input recipe-servings-unit"
              value={servingsUnit}
              onChange={(e) => setServingsUnit(e.target.value)}
              placeholder={t.recipes.servingsUnitPlaceholder}
              aria-label={t.recipes.servingsUnitPlaceholder}
              maxLength={24}
            />
          </div>
          <div className="recipe-times-row">
            {(
              [
                [t.recipes.timePrep, prepMin, setPrepMin],
                [t.recipes.timeCook, cookMin, setCookMin],
                [t.recipes.timeTotal, totalMin, setTotalMin],
              ] as [string, string, (v: string) => void][]
            ).map(([label, v, set]) => (
              <label key={label} className="recipe-time mono">
                {label}
                <span className="recipe-time__field">
                  <input className="input" type="number" min="1" value={v} onChange={(e) => set(e.target.value)} />
                  <span className="recipe-time__unit mono">min</span>
                </span>
              </label>
            ))}
          </div>
          <textarea
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.recipes.notesPlaceholder}
            rows={2}
          />

          {/* Tags: preset chips + any custom one already on the recipe, then a
              free-text add. Drives the Kitchen filter chips. */}
          <div className="recipe-tags-edit">
            <span className="recipe-tags-edit__label mono">{t.recipes.tagsLabel}</span>
            <div className="recipe-tags-edit__chips">
              {pills.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={'chip' + (hasTag(tag) ? ' is-on' : '')}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={hasTag(tag)}
                >
                  {tag}
                </button>
              ))}
              {tags
                .filter((tag) => !pills.some((p) => p.toLowerCase() === tag.toLowerCase()))
                .map((tag) => (
                  <button key={tag} type="button" className="chip is-on" onClick={() => toggleTag(tag)} aria-pressed>
                    {tag} <InlineIcon name="x-bold" size={12} />
                  </button>
                ))}
            </div>
            <div className="recipe-tags-edit__add">
              <input
                className="input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder={t.recipes.tagAdd}
                aria-label={t.recipes.tagAdd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
              <button type="button" className="btn btn--ghost mono" onClick={addTag} disabled={!tagInput.trim()}>
                ＋
              </button>
            </div>
          </div>
        </div>

        <div className="recipe-modal__foot">
          <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!title.trim() || busy}>
            {t.recipes.save}
          </button>
        </div>
      </form>
    </div>
  )
}
