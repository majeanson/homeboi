import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, isStatus } from '../lib/api'
import { resizeImage, PHOTO_MAX } from '../lib/image'
import { type Recipe, type RecipeOriginal, RECIPES_KEY, recipeImg } from '../lib/recipes'
import { formatDuration } from '../lib/duration'
import { Icon } from './Icon'

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
  const [title, setTitle] = useState(value?.title ?? '')
  // Keep at least one empty row so there's always somewhere to type.
  const [ingredients, setIngredients] = useState<string[]>(value?.ingredients?.length ? value.ingredients : [''])
  const [steps, setSteps] = useState<string[]>(value?.steps?.length ? value.steps : [''])
  const [servings, setServings] = useState(value?.servings ? String(value.servings) : '')
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
  const addLine = (kind: LineKind) => setLines(kind)([...lines(kind), ''])
  const removeLine = (kind: LineKind, i: number) => {
    const next = lines(kind).filter((_, idx) => idx !== i)
    setLines(kind)(next.length ? next : [''])
  }
  // Pasting a multi-line block into one row spreads it over rows (bullets and
  // leading step numbers stripped — the editor numbers steps itself), so fixing
  // an import by copy-pasting a section never means typing line by line.
  const pasteLines = (kind: LineKind, i: number, pasted: string): boolean => {
    const parts = pasted
      .split(/\r?\n/)
      .map((s) =>
        s
          .replace(/^[•·▪◦‣*–—-]+\s*/, '')
          .replace(/^\d{1,2}\s*[.):\-–—]\s+/, '')
          .trim(),
      )
      .filter(Boolean)
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
    times?: { prep: number | null; cook: number | null; total: number | null }
    source?: string | null
  }
  function applyDraft(d: Draft) {
    if (d.title && !title.trim()) setTitle(d.title)
    if (d.ingredients?.length && ingredients.every((x) => !x.trim())) setIngredients(d.ingredients)
    if (d.steps?.length && steps.every((x) => !x.trim())) setSteps(d.steps)
    if (d.servings && !servings.trim()) setServings(String(d.servings))
    // Prep/cook/total times land as a notes line ("Préparation 20 min · …") —
    // informative without needing new fields, and freely editable.
    if (d.times && !notes.trim()) {
      const parts = (
        [
          [t.recipes.timePrep, d.times.prep],
          [t.recipes.timeCook, d.times.cook],
          [t.recipes.timeTotal, d.times.total],
        ] as [string, number | null][]
      )
        .filter(([, m]) => m != null && m > 0)
        .map(([label, m]) => `${label} ${formatDuration(m! * 60)}`)
      if (parts.length) setNotes(parts.join(' · '))
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
      const r = await api<{ title: string | null; ingredients: string[]; steps: string[] }>('recipe-vision', {
        method: 'POST',
        body: blob,
      })
      if (!r.title && !r.ingredients.length && !r.steps.length) setReadMsg(t.recipes.readFail)
      else applyDraft(r)
    } catch (e) {
      setReadMsg(isStatus(e, 503) ? t.recipes.aiOff : t.recipes.readFail)
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
    const fields = {
      title: title.trim(),
      ingredients: ingredients.map((s) => s.trim()).filter(Boolean),
      steps: steps.map((s) => s.trim()).filter(Boolean),
      servings: servings.trim() ? Number(servings) : null,
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
    onSaved()
  }

  const imgSrc = recipeImg(image)

  const lineEditor = (kind: LineKind, placeholder: string) => (
    <div className="recipe-lines">
      {lines(kind).map((v, i) => (
        <div key={i} className="recipe-line">
          {kind === 'steps' && <span className="recipe-line__n mono">{i + 1}</span>}
          <input
            className="input"
            value={v}
            onChange={(e) => updateLine(kind, i, e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (i === lines(kind).length - 1 && v.trim()) addLine(kind)
              } else if (e.key === 'Backspace' && !v && lines(kind).length > 1) {
                e.preventDefault()
                removeLine(kind, i)
              }
            }}
            onPaste={(e) => {
              if (pasteLines(kind, i, e.clipboardData.getData('text'))) e.preventDefault()
            }}
          />
          <button
            type="button"
            className="recipe-line__del mono"
            onClick={() => removeLine(kind, i)}
            aria-label={t.recipes.removePhoto}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn--ghost mono recipe-add-line" onClick={() => addLine(kind)}>
        ＋ {kind === 'ingredients' ? t.recipes.addIngredient : t.recipes.addStep}
      </button>
    </div>
  )

  return (
    <div className="recipe-modal" role="dialog" aria-modal="true" aria-label={value ? t.recipes.edit : t.recipes.new}>
      <div className="recipe-modal__scrim" onClick={onCancel} aria-hidden="true" />
      <form className="recipe-modal__card surface" onSubmit={save}>
        <div className="recipe-modal__bar">
          <h2>{value ? t.recipes.edit : t.recipes.new}</h2>
          <button type="button" className="btn btn--ghost mono" onClick={onCancel} aria-label={t.common.cancel}>
            ✕
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

          <input
            className="input recipe-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.recipes.titlePlaceholder}
            autoFocus
          />

          {/* Fast-fill helpers */}
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
          {lineEditor('steps', t.recipes.stepPlaceholder)}

          {/* Servings + notes */}
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
              {t.recipes.tagPresets.map((tag) => (
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
                .filter((tag) => !t.recipes.tagPresets.some((p) => p.toLowerCase() === tag.toLowerCase()))
                .map((tag) => (
                  <button key={tag} type="button" className="chip is-on" onClick={() => toggleTag(tag)} aria-pressed>
                    {tag} ✕
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
