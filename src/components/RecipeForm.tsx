import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, isStatus } from '../lib/api'
import { useWrite } from '../lib/write'
import { useConfirm } from '../lib/confirm'
import { StatusMessage } from './StatusMessage'
import { Disclosure } from './Disclosure'
import { useAi } from '../lib/ai'
import { resizeImage, imgUrl, PHOTO_MAX, OCR_MAX, MAX_UPLOAD_BYTES } from '../lib/image'
import { ocrImage, mergeOcrPages, disposeOcr } from '../lib/ocr'
import { repairImperialFromMetric } from '../lib/measure'
import { useOcrEngine, useCloudOcrAvailable } from '../lib/ocrPref'
import { uploadMedia, MediaUnavailableError } from '../lib/uploadMedia'
import { RecipeReadReview, type ReadReviewDraft } from './RecipeReadReview'
import { alignSide, sideInsert, sideRemove, sideSwap, sideSplice, sideSet } from '../lib/parallelArray'
import {
  type Recipe,
  type RecipeOriginal,
  type RecipeTagsData,
  RECIPES_KEY,
  RECIPE_TAGS_KEY,
  recipeImg,
  tagOptions,
  tagColor,
} from '../lib/recipes'
import { A_REGLER_KEY } from '../lib/queryKeys'
import { wash, tintInk, edge } from '../lib/colors'
import { SECTION_PREFIX, dropDanglingHeadings, isSectionHeading } from '../lib/recipeSections'
import { Icon, InlineIcon } from './Icon'
import { Chip } from './Chip'
import { EntityCombobox, type ComboOption } from './EntityCombobox'
import { ZoomableImg } from './ZoomableImg'
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
  const write = useWrite()
  const confirm = useConfirm()
  // "Read a photo" is pure vision AI — hide it when AI is off. Import stays: it
  // works without AI (JSON-LD / microdata / the paste heuristic), only free-form
  // text falls back, so it's not an AI-only feature.
  const { enabled: aiEnabled } = useAi()
  // OCR engine (per-device): on-device Tesseract by default, or the high-accuracy
  // cloud reader when the operator picked it AND the deployment has a Mistral key.
  const ocrEngine = useOcrEngine()
  const cloudOcrAvailable = useCloudOcrAvailable()
  const modalRef = useRef<HTMLDivElement>(null)
  // Free the OCR worker's WASM heap when the editor closes — a cheap wall tablet
  // shouldn't hold megabytes after one read. Safe no-op if no read happened.
  useEffect(() => () => void disposeOcr(), [])
  const [title, setTitle] = useState(value?.title ?? '')
  // Keep at least one empty row so there's always somewhere to type.
  const [ingredients, setIngredients] = useState<string[]>(value?.ingredients?.length ? value.ingredients : [''])
  const [steps, setSteps] = useState<string[]>(value?.steps?.length ? value.steps : [''])
  // Per-step photo R2 keys (feature #17 B), kept rigorously the SAME length as
  // `steps` — every step mutation below (add / remove / move / paste / import)
  // updates this array in lockstep through the shared lib/parallelArray ops, so a
  // photo never mis-attaches to the wrong step. '' = that step has no photo (a
  // heading row keeps an empty slot). Seeded + padded from the loaded recipe.
  const [stepImages, setStepImages] = useState<string[]>(() =>
    alignSide(value?.stepImages, value?.steps?.length ? value.steps.length : 1),
  )
  // R2 photo storage off (the step-image upload 503'd once) → hide every per-step
  // 📷 control for the rest of this edit (mirrors PhotosSection's 503 → hide). Cook
  // mode already renders no photo for an empty slot, so nothing breaks.
  const [stepPhotoOff, setStepPhotoOff] = useState(false)
  // Which step is currently uploading a photo (its index), or null when idle.
  const [stepUploading, setStepUploading] = useState<number | null>(null)
  const [servings, setServings] = useState(value?.servings ? String(value.servings) : '')
  // Yield unit ("biscuits") + real time fields (minutes) — imports prefill,
  // freely editable by hand afterwards.
  const [servingsUnit, setServingsUnit] = useState(value?.servingsUnit ?? '')
  const [prepMin, setPrepMin] = useState(value?.prepMin ? String(value.prepMin) : '')
  const [cookMin, setCookMin] = useState(value?.cookMin ? String(value.cookMin) : '')
  const [totalMin, setTotalMin] = useState(value?.totalMin ? String(value.totalMin) : '')
  const [notes, setNotes] = useState(value?.notes ?? '')
  // Reading language for read-aloud (#TTS): null = follow the app's language (the
  // default), 'fr'/'en' = always narrate this recipe with that voice (an English
  // recipe in a French app). Not a translation — just which mouth reads the words.
  const [readLang, setReadLang] = useState<'fr' | 'en' | null>(value?.lang ?? null)
  const [tags, setTags] = useState<string[]>(value?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [source, setSource] = useState<string | null>(value?.source ?? null)
  const [image, setImage] = useState<string | null>(value?.image ?? null)
  // The as-imported snapshot, kept verbatim across edits; a fresh import
  // replaces it. Saved alongside the card so the sheet can show "the original".
  const [original, setOriginal] = useState<RecipeOriginal | null>(value?.original ?? null)

  // Dirty guard: this is the one form in a scrim modal, so a stray tap on the
  // backdrop (or Esc) mid-edit used to discard everything silently. Snapshot the
  // saveable fields once on mount; backdrop/Esc closes freely while pristine and
  // asks first once anything changed. The explicit Annuler / ✕ stay immediate.
  const snap = () =>
    JSON.stringify({ title, ingredients, steps, stepImages, servings, servingsUnit, prepMin, cookMin, totalMin, notes, readLang, tags, source, image, original })
  const snapRef = useRef(snap)
  snapRef.current = snap
  const initialSnap = useRef<string | null>(null)
  if (initialSnap.current === null) initialSnap.current = snap()
  const requestClose = () => {
    if (snapRef.current() === initialSnap.current) {
      onCancel()
      return
    }
    void confirm({ message: t.recipes.discardConfirm, confirmLabel: t.recipes.discardBtn, tone: 'default' }).then(
      (ok) => ok && onCancel(),
    )
  }
  useModal(modalRef, requestClose)

  const [busy, setBusy] = useState(false)
  // The save answered 4xx/5xx — keep the filled form and say so (offline is NOT
  // this: useWrite queues it and resolves, so the scene still closes calmly).
  const [err, setErr] = useState(false)
  const [reading, setReading] = useState(false)
  // OCR progress (0..1) for the "Lecture… 60 %" label while transcribing on-device.
  const [readProgress, setReadProgress] = useState(0)
  // The read result awaiting the cook's verify-against-the-photo confirm (Pillar 3).
  // Null when no read is pending review. `confirming` flags the source-photo upload.
  const [readReview, setReadReview] = useState<{
    draft: ReadReviewDraft
    photoUrl: string
    sourceFile: File
    lowConfidenceWords: string[]
  } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  // A photo upload (hero or step) failed for a NON-503 reason — say so once,
  // shared line (503 keeps its own contract: hide the controls, stay quiet).
  const [uploadErr, setUploadErr] = useState(false)
  const [readMsg, setReadMsg] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importText, setImportText] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  // Steps edit ONE at a time in a roomy memo (index being edited, or null). Avoids
  // a wall of always-open single-line boxes and gives space to format a step over
  // several lines.
  const [editStep, setEditStep] = useState<number | null>(null)

  // Multi-row inputs (ingredients / section titles) advance like a phone "next"
  // key: Enter commits the row (state already holds it on each keystroke) and moves
  // focus to the next row, appending an empty one when you Enter off the last filled
  // row. Refs are keyed by kind + index; `focusLine` defers the focus to AFTER the
  // render that creates a freshly-appended row (the input doesn't exist yet on Enter).
  const lineInputs = useRef<Partial<Record<LineKind, (HTMLInputElement | null)[]>>>({})
  const [focusLine, setFocusLine] = useState<{ kind: LineKind; i: number } | null>(null)
  useEffect(() => {
    if (!focusLine) return
    lineInputs.current[focusLine.kind]?.[focusLine.i]?.focus()
    setFocusLine(null)
  }, [focusLine])

  // The pill offer: household presets (Réglages → Recettes) or the built-in
  // starters, plus every tag already used on a recipe — a tag typed once
  // ("Collation") is a one-tap pill from then on.
  const tagsQ = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') })
  const pills = tagOptions(
    tagsQ.data?.presets ?? [],
    (tagsQ.data?.used ?? []).map((u) => u.tag),
    t.recipes.tagPresets,
  )
  const tagColors = tagsQ.data?.colors
  // Tint a tag chip by its household colour (migration 0037): faint when off, a
  // solid fill when selected, mirroring the search pills. No colour → default chip.
  const tagChipStyle = (tag: string, on: boolean): React.CSSProperties | undefined => {
    const hex = tagColor(tagColors, tag)
    if (!hex) return undefined
    return on
      ? { background: tintInk(hex), color: '#fffcf5', borderColor: tintInk(hex) }
      : { background: wash(hex), color: tintInk(hex), borderColor: edge(hex) }
  }

  const hasTag = (tag: string) => tags.some((x) => x.toLowerCase() === tag.toLowerCase())
  const toggleTag = (tag: string) =>
    setTags((ts) => (hasTag(tag) ? ts.filter((x) => x.toLowerCase() !== tag.toLowerCase()) : [...ts, tag]))
  function addTag(value?: string) {
    const s = (value ?? tagInput).trim()
    if (s && !hasTag(s)) setTags((ts) => [...ts, s])
    setTagInput('')
  }
  // Known tags not yet on this recipe → the combobox's "did you mean this existing
  // one?" suggestions, so typing "veg" surfaces "végé" instead of spawning a near-dupe.
  const tagSuggestions: ComboOption<string>[] = pills
    .filter((p) => !hasTag(p))
    .map((p) => ({ id: p, label: p, data: p }))

  const lines = (kind: LineKind) => (kind === 'ingredients' ? ingredients : steps)
  const setLines = (kind: LineKind) => (kind === 'ingredients' ? setIngredients : setSteps)
  const updateLine = (kind: LineKind, i: number, v: string) =>
    setLines(kind)(lines(kind).map((x, idx) => (idx === i ? v : x)))
  const addLine = (kind: LineKind, v = '') => {
    setLines(kind)([...lines(kind), v])
    // A new step appends an empty photo slot so stepImages stays the same length.
    if (kind === 'steps') setStepImages((imgs) => sideInsert(alignSide(imgs, steps.length)))
  }
  const removeLine = (kind: LineKind, i: number) => {
    const next = lines(kind).filter((_, idx) => idx !== i)
    setLines(kind)(next.length ? next : [''])
    if (kind === 'steps')
      setStepImages((imgs) => {
        const dropped = sideRemove(alignSide(imgs, steps.length), i)
        // removeLine keeps a single empty row when the list would empty; mirror
        // that so stepImages is never shorter than the steps array it tracks.
        return dropped.length ? dropped : ['']
      })
  }
  // ↑/↓ swap a row with its neighbour — reordering without drag-and-drop (which
  // fights the page scroll on a phone). The open step memo follows its step, and
  // a step's photo rides along (sideSwap mirrors the array swap).
  const moveLine = (kind: LineKind, i: number, delta: -1 | 1) => {
    const arr = [...lines(kind)]
    const j = i + delta
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setLines(kind)(arr)
    if (kind === 'steps') {
      setStepImages((imgs) => sideSwap(alignSide(imgs, steps.length), i, j))
      setEditStep((es) => (es === i ? j : es === j ? i : es))
    }
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
    const keepCurrent = cur[i].trim()
    setLines(kind)([...cur.slice(0, i), ...(keepCurrent ? [cur[i], ...parts] : parts), ...cur.slice(i + 1)])
    // Keep stepImages aligned to the same splice: a kept row holds its photo and
    // the pasted rows insert empty slots AFTER it (remove 0); a blank row is
    // consumed and replaced by the pasted rows (remove 1). Either way the tail
    // keeps its photos at the right index (feature #17 B).
    if (kind === 'steps')
      setStepImages((imgs) =>
        keepCurrent
          ? sideSplice(alignSide(imgs, steps.length), i + 1, 0, parts.length)
          : sideSplice(alignSide(imgs, steps.length), i, 1, parts.length),
      )
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
    // Auto-detected reading language from the import ('fr'|'en'|null = undetected).
    lang?: 'fr' | 'en' | null
    // R2 key of the photo this was READ from (photo-import path) — stashed into the
    // original snapshot so the sheet can show the source card later.
    sourceImage?: string | null
  }
  function applyDraft(d: Draft) {
    if (d.title && !title.trim()) setTitle(d.title)
    // An import that could tell its own language pre-fills the read-aloud chip,
    // unless the cook already picked one (never clobber, like the fields below).
    if (d.lang && readLang === null) setReadLang(d.lang)
    if (d.ingredients?.length && ingredients.every((x) => !x.trim())) setIngredients(d.ingredients)
    if (d.steps?.length && steps.every((x) => !x.trim())) {
      setSteps(d.steps)
      // The imported steps are fresh rows (we only replace when the editor's steps
      // were all blank, so no photo is lost) — reset stepImages to a same-length
      // all-empty array so it can't drift past the new step count (feature #17 B).
      setStepImages(alignSide(undefined, d.steps.length))
    }
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
        sourceImage: d.sourceImage ?? null,
      })
    }
  }

  type ReadDraft = {
    title: string | null
    ingredients: string[]
    steps: string[]
    servings: number | null
    servingsUnit: string | null
    times: { prep: number | null; cook: number | null; total: number | null }
    lang: 'fr' | 'en' | null
    empty?: boolean
  }
  const draftHasContent = (d: ReadDraft) => !!(d.title || d.ingredients.length || d.steps.length)

  // Read a recipe out of a photo (cookbook page, handwritten card, screenshot).
  // Faithful-first: real on-device OCR (lib/ocr.ts) transcribes the page — it can
  // garble but it NEVER flips a 3/4 into a 1/4 or invents an ingredient — then the
  // SAME structuring path paste-import uses (/api/recipe-import) organises the text.
  // Only when OCR comes up near-empty do we fall back to the generative vision read
  // (/api/recipe-vision), which is the part that hallucinates. The result is shown
  // for a verify-against-the-photo confirm (Pillar 3) before it touches the form.
  // Several photos can be read at once (a long recipe split over pages) — their
  // transcripts are stitched in pick order; the heading-aware parser merges an
  // "Ingrédients" page with a "Préparation" page into one card. The picked files
  // are only read — they do NOT become the dish's display photo.
  async function readPhoto(files: File[]) {
    if (reading || !files.length) return
    setReading(true)
    setReadProgress(0)
    setReadMsg(null)
    try {
      const texts: string[] = []
      const lowWords = new Set<string>()
      let meanConf = 0

      // The high-accuracy CLOUD reader (Mistral OCR), when the operator picked it and
      // the deployment has a key. Sends each page to /api/recipe-ocr → faithful text.
      const useCloud = ocrEngine === 'cloud' && cloudOcrAvailable && aiEnabled
      if (useCloud) {
        for (let i = 0; i < files.length; i++) {
          // Downscale-only here (no Tesseract-style upscaling) — Mistral reads small
          // text fine, and this keeps the upload under the endpoint's 6 MB cap.
          const img = await resizeImage(files[i], OCR_MAX)
          setReadProgress(i / files.length)
          const r = await api<{ text: string }>('recipe-ocr', { method: 'POST', body: img }).catch(() => null)
          if (r?.text) texts.push(r.text)
        }
        setReadProgress(1)
        if (texts.length) meanConf = 95 // cloud OCR is reliable → skip the AI fallback gate
      }

      // On-device Tesseract — the default, AND the fallback if cloud came back empty.
      // Downscale-only to OCR_MAX (the original, "okay" read): plain shrinking reads
      // ordinary photos more faithfully than upscaling small ones, which invented
      // blurry pixels the engine then mis-read. Average confidence; union shaky words.
      if (!texts.length) {
        let confSum = 0
        let confN = 0
        for (let i = 0; i < files.length; i++) {
          const big = await resizeImage(files[i], OCR_MAX)
          const res = await ocrImage(big, (p) => setReadProgress((i + p) / files.length))
          if (res.text) texts.push(res.text)
          if (res.confidence > 0) {
            confSum += res.confidence
            confN++
          }
          res.lowConfidenceWords.forEach((w) => lowWords.add(w))
        }
        meanConf = confN ? confSum / confN : 0
      }

      // Merge the pages: a wide shot + zoomed close-ups of the same recipe dedupe to
      // one transcript (the clearer zoom replaces a fuzzy line); separate pages
      // (ingredients here, steps there) just concatenate.
      const stitched = mergeOcrPages(texts).trim()

      // OCR gave usable text → structure it through the no-/low-AI text path. Only a
      // near-empty or very-low-confidence read (handwriting, skew, a weak tablet)
      // drops to the generative vision read as a safety net.
      let draft: ReadDraft | null = null
      if (stitched.length >= 25 && meanConf >= 40) {
        draft = await api<ReadDraft>('recipe-import', { method: 'POST', body: { text: stitched } }).catch(() => null)
      }
      if ((!draft || draft.empty || !draftHasContent(draft)) && aiEnabled) {
        // Fallback: the generative vision read of the FIRST page (resized to the
        // upload cap, like recipe-image). 503 = AI off → handled below as readFail.
        const small = await resizeImage(files[0], PHOTO_MAX)
        if (small.size <= MAX_UPLOAD_BYTES) {
          draft = await api<ReadDraft>('recipe-vision', { method: 'POST', body: small }).catch((e) => {
            if (isStatus(e, 503) || isStatus(e, 400)) return null
            throw e
          })
        }
      }

      if (!draft || !draftHasContent(draft)) {
        setReadMsg(t.recipes.readFail)
        return
      }
      // Rescue garbled imperial fractions from the (reliably-read) millilitres: a
      // recipe printing "60 ml (¼ de tasse)" keeps the "60 ml" but loses the tiny ¼,
      // so derive it back. No-op on lines without the "n ml (… unit …)" shape.
      draft.ingredients = draft.ingredients.map(repairImperialFromMetric)
      draft.steps = draft.steps.map(repairImperialFromMetric)
      // Hand off to the verify panel rather than applying straight to the form: the
      // cook glances at the photo, confirms the flagged numbers, THEN it lands.
      setReadReview({
        draft,
        photoUrl: URL.createObjectURL(files[0]),
        sourceFile: files[0],
        lowConfidenceWords: [...lowWords],
      })
    } catch (e) {
      if (isStatus(e, 503)) setReadMsg(t.recipes.aiOff)
      else if (isStatus(e, 400)) setReadMsg(t.recipes.photoTooBig)
      else setReadMsg(t.recipes.readFail)
    } finally {
      setReading(false)
    }
  }

  // The cook confirmed the read in the verify panel. Stash the source card to R2
  // (best-effort — R2 unbound just means no "original" photo), then drop the
  // verified draft into the form (applyDraft never clobbers what's already typed).
  async function confirmRead(edited: Draft) {
    if (!readReview) return
    setConfirming(true)
    let sourceImage: string | null = null
    try {
      sourceImage = await uploadMedia('recipe-image', readReview.sourceFile, { maxBytes: MAX_UPLOAD_BYTES })
    } catch {
      /* R2 off / un-shrinkable — keep the parsed recipe, just no source snapshot */
    }
    applyDraft({ ...edited, sourceImage })
    closeReadReview()
    setConfirming(false)
  }

  function closeReadReview() {
    setReadReview((r) => {
      if (r) URL.revokeObjectURL(r.photoUrl)
      return null
    })
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
        lang: 'fr' | 'en' | null
        empty?: boolean
        reason?: 'blocked' | 'no-recipe'
      }>('recipe-import', { method: 'POST', body: text ? { text } : { url } })
      if (r.empty || (!r.ingredients.length && !r.steps.length && !r.title)) {
        // A site that refuses us is not the same failure as a page with no recipe on
        // it — and neither is the AI being off. Say which one it was.
        setImportMsg(r.reason === 'blocked' ? t.recipes.importBlocked : t.recipes.importFail)
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
    setUploadErr(false)
    try {
      setImage(await uploadMedia('recipe-image', file))
    } catch (e) {
      // R2 unbound (503) stays quiet — the picture is simply unset and the form
      // works on. Any other failure says so, instead of silently eating the pick.
      if (!(e instanceof MediaUnavailableError)) setUploadErr(true)
    } finally {
      setUploading(false)
    }
  }

  // Attach (or replace) one step's photo (feature #17 B). Resized small client-side
  // like the hero image, uploaded to the sibling /api/recipe-step-image endpoint,
  // and the returned R2 key is written at THIS step's index in the parallel
  // stepImages array (sideSet leaves every other slot alone). Same graceful
  // degrade as the hero image plus the deck clips: a 503 (R2 unbound) hides the
  // whole per-step control; any other failure leaves the step unphotographed and
  // never blocks the form.
  async function uploadStepPhoto(i: number, file: File) {
    setStepUploading(i)
    setUploadErr(false)
    try {
      const key = await uploadMedia('recipe-step-image', file, { maxBytes: MAX_UPLOAD_BYTES })
      setStepImages((imgs) => sideSet(alignSide(imgs, steps.length), i, key))
    } catch (e) {
      if (e instanceof MediaUnavailableError) setStepPhotoOff(true)
      // Other failure (incl. an un-shrinkable too-large blob) — leave the step
      // photo unset and say so; never block the form.
      else setUploadErr(true)
    } finally {
      setStepUploading(null)
    }
  }
  const clearStepPhoto = (i: number) =>
    setStepImages((imgs) => sideSet(alignSide(imgs, steps.length), i, ''))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    // A section row with no title ("## ") and a heading with nothing under it
    // are editing leftovers, not content — both drop here.
    const cleanRows = (xs: string[]) =>
      dropDanglingHeadings(xs.map((s) => s.trim()).filter((s) => s && !/^##$/.test(s)))
    // Clean the steps and their PARALLEL photo keys with the SAME row drops, so
    // stepImages stays index-aligned to the saved steps (feature #17 B). We pair
    // each row with its photo, run the identical trim/filter/dangling-heading
    // pass on the pair list, then split back out — a dropped row takes its (empty)
    // photo slot with it, every surviving photo keeps its step.
    const cleanStepsWithPhotos = () => {
      const imgs = alignSide(stepImages, steps.length)
      const paired = steps
        .map((s, i) => ({ text: s.trim(), img: imgs[i] ?? '' }))
        .filter((p) => p.text && !/^##$/.test(p.text))
      // dropDanglingHeadings, but carrying the photo slot alongside each row (same
      // isSectionHeading predicate as the real cleanRows path, so the split steps
      // array is byte-identical to what the server would otherwise receive).
      const out: { text: string; img: string }[] = []
      for (const p of paired) {
        const prev = out[out.length - 1]
        if (isSectionHeading(p.text) && prev && isSectionHeading(prev.text)) out.pop()
        out.push(p)
      }
      if (out.length && isSectionHeading(out[out.length - 1].text)) out.pop()
      return { steps: out.map((p) => p.text), stepImages: out.map((p) => p.img) }
    }
    const cleanedSteps = cleanStepsWithPhotos()
    const fields = {
      title: title.trim(),
      ingredients: cleanRows(ingredients),
      steps: cleanedSteps.steps,
      stepImages: cleanedSteps.stepImages,
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
      lang: readLang,
    }
    setErr(false)
    try {
      // useWrite: offline queues + replays instead of dropping the recipe, and the
      // affected keys invalidate once the write lands. RECIPE_TAGS_KEY — a freshly
      // typed tag becomes part of the pill offer next time; A_REGLER_KEY — a
      // recipe's ingredients feed the « À régler » meal-low scan, so the card
      // refreshes instead of waiting its 5-min poll (write.ts adds it for the
      // `recipes` path anyway; listed here so the intent is visible).
      await write('recipes', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...fields } : fields,
        affectedKeys: [RECIPES_KEY, RECIPE_TAGS_KEY, A_REGLER_KEY],
      })
      onSaved()
    } catch {
      // The server said no (4xx/5xx) — keep the filled form; closing here would
      // discard the recipe as if it saved.
      setErr(true)
    } finally {
      setBusy(false)
    }
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
              ref={(el) => {
                const arr = lineInputs.current[kind] ?? (lineInputs.current[kind] = [])
                arr[i] = el
              }}
              className="input"
              value={shown}
              // iOS shows a "next" return key; Enter then jumps to the next row.
              enterKeyHint="next"
              onChange={(e) => updateLine(kind, i, sec ? SECTION_PREFIX + e.target.value : e.target.value)}
              placeholder={sec ? t.recipes.sectionPlaceholder : placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const last = lines(kind).length - 1
                  if (i < last) {
                    // Jump to the next existing row (the value is already committed).
                    lineInputs.current[kind]?.[i + 1]?.focus()
                  } else if (shown.trim()) {
                    // Off the last filled row: append one and focus it next render.
                    addLine(kind)
                    setFocusLine({ kind, i: i + 1 })
                  }
                }
                // No Backspace-to-delete: clearing a row to retype it shouldn't make
                // it vanish on one extra keypress. Row removal stays explicit via the
                // per-row ✕ button (recipe-line__del).
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
          <InlineIcon name="plus-bold" /> {kind === 'ingredients' ? t.recipes.addIngredient : t.recipes.addStep}
        </button>
        <button
          type="button"
          className="btn btn--ghost mono recipe-add-line"
          onClick={() => addLine(kind, SECTION_PREFIX)}
        >
          <InlineIcon name="plus-bold" /> {t.recipes.addSection}
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
          {/* The step's own photo (feature #17 B): a thumbnail + add / change /
              remove, or just the add button when the step has none. Hidden whole
              when R2 photo storage is unset (the upload 503'd). Keyed by THIS
              step's index into the parallel stepImages array. */}
          {!stepPhotoOff && (
            <StepPhoto
              imgKey={stepImages[i] ?? ''}
              uploading={stepUploading === i}
              onPick={(f) => uploadStepPhoto(i, f)}
              onClear={() => clearStepPhoto(i)}
              t={t}
            />
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
          <InlineIcon name="plus-bold" /> {t.recipes.addStep}
        </button>
        <button
          type="button"
          className="btn btn--ghost mono recipe-add-line"
          onClick={() => addLine('steps', SECTION_PREFIX)}
        >
          <InlineIcon name="plus-bold" /> {t.recipes.addSection}
        </button>
      </div>
    </div>
  )

  return (
    <div ref={modalRef} className="recipe-modal" role="dialog" aria-modal="true" aria-label={value ? t.recipes.edit : t.recipes.new}>
      <div className="recipe-modal__scrim" onClick={requestClose} aria-hidden="true" />
      <form className="recipe-modal__card surface" onSubmit={save}>
        <div className="recipe-modal__bar">
          <h2>{value ? t.recipes.edit : t.recipes.new}</h2>
          <button type="button" className="btn btn--ghost mono" onClick={onCancel} aria-label={t.common.cancel}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>

        <div className="recipe-modal__body">
          {/* The NAME leads. It used to be the third thing on the form — under the
              « Photo du plat » button and above a « Remplir vite » block three
              controls and an explainer paragraph tall — so a recipe you were simply
              going to type opened on everything except the field you had to fill.
              No autoFocus: on a phone it would summon the keyboard over the
              just-opened form; autoComplete off keeps iOS from offering contact
              names for a recipe title. */}
          <input
            className="input recipe-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.recipes.titlePlaceholder}
            autoComplete="off"
          />

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
                <InlineIcon name="image-square-bold" /> {uploading ? '…' : t.recipes.addPhoto}
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
          {/* One shared line for a failed photo upload (hero or step) — a non-503
              failure used to eat the pick silently. 503 hides the controls instead. */}
          {uploadErr && <StatusMessage tone="error">{t.memo.uploadFailed}</StatusMessage>}

          {/* Fast-fill helpers — distinct from the dish photo above: these READ a
              recipe (scan a card / import a link) into the fields. FOLDED: two
              buttons, a label and a three-line explainer stood permanently between
              the recipe's name and its first ingredient, explaining a path most
              recipes don't take (they get typed). Behind « Remplir vite » they're
              one tap away and the explainer arrives WITH the buttons it explains,
              instead of before them. Opens itself when the link/paste panel is
              already showing, so a half-finished import is never folded away. */}
          <Disclosure label={t.recipes.fillFrom} defaultOpen={showImport} className="recipe-fill">
          <div className="recipe-helpers">
            {/* Read a photo is on-device OCR now — it works with AI OFF, so it's no
                longer gated behind aiEnabled. `multiple`: a long recipe split over
                pages is read in one go (ingredients page + steps page → one card). */}
            <label className={'btn btn--ghost mono' + (reading ? ' is-busy' : '')}>
              <InlineIcon name="camera-bold" />{' '}
              {reading
                ? readProgress > 0
                  ? `${t.recipes.reading} ${Math.round(readProgress * 100)} %`
                  : t.recipes.reading
                : t.recipes.readPhoto}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={reading}
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? [])
                  if (fs.length) readPhoto(fs)
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
              <InlineIcon name="link-bold" /> {t.recipes.import}
            </button>
          </div>
          {/* The gold path: an online recipe imported by link is verbatim — no OCR,
              nothing to mis-read. Gently point cooks there. */}
          <p className="recipe-fill-hint mono">{t.recipes.readHint}</p>
          {readMsg && <p className="recipe-aioff mono">{readMsg}</p>}

          {showImport && (
            // data-kb-reveal: keep the "Importer" button (below the URL + paste
            // fields) in view on mobile, not just the focused field — see
            // viewportVars' focus-scroll. The default elsewhere pins the field itself.
            <div className="recipe-import" data-kb-reveal>
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
          </Disclosure>

          {/* Ingredients */}
          <h3 className="recipe-sec-h">
            <Icon name="carrot-bold" size={18} color="var(--terracotta-deep)" /> {t.recipes.ingredients}
          </h3>
          {lineEditor('ingredients', t.recipes.ingredientPlaceholder)}

          {/* Steps */}
          <h3 className="recipe-sec-h">
            <Icon name="pencil-simple-bold" size={18} color="var(--berry-deep)" /> {t.recipes.steps}
          </h3>
          {/* Each step carries an optional photo (feature #17 B). The control is
              built into stepsEditor (StepPhoto), kept parallel to the steps array
              and hidden whole where R2 photo storage is unset. */}
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
          {/* #TTS — which voice reads this recipe aloud (cook mode, toddler tiles).
              Auto follows the app language; pick a language for, say, an English
              recipe kept in a French household so its steps aren't read with a
              French accent. */}
          <div className="picker-chips mono recipe-readlang">
            <span className="picker-chips__label">{t.recipes.readLangLabel}</span>
            <Chip selected={readLang === null} onClick={() => setReadLang(null)}>
              {t.recipes.readLangAuto}
            </Chip>
            <Chip selected={readLang === 'fr'} onClick={() => setReadLang('fr')}>
              {t.recipes.readLangFr}
            </Chip>
            <Chip selected={readLang === 'en'} onClick={() => setReadLang('en')}>
              {t.recipes.readLangEn}
            </Chip>
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
                  style={tagChipStyle(tag, hasTag(tag))}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={hasTag(tag)}
                >
                  {tag}
                </button>
              ))}
              {tags
                .filter((tag) => !pills.some((p) => p.toLowerCase() === tag.toLowerCase()))
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="chip is-on"
                    style={tagChipStyle(tag, true)}
                    onClick={() => toggleTag(tag)}
                    aria-pressed
                  >
                    {tag} <InlineIcon name="x-bold" size={12} />
                  </button>
                ))}
            </div>
            {/* Type a new tag OR pick an existing one as you type — the suggestions
                surface near-duplicates ("veg" → "végé") so the vocabulary doesn't
                drift into synonyms. Applied tags already show as chips above, so the
                box is pure type-ahead (no full-list caret). */}
            <EntityCombobox
              value={tagInput}
              onChange={setTagInput}
              options={tagSuggestions}
              onPick={(o) => {
                toggleTag(o.data)
                setTagInput('')
              }}
              onSubmit={(v) => addTag(v)}
              submitIcon="plus-bold"
              placeholder={t.recipes.tagAdd}
              ariaLabel={t.recipes.tagAdd}
              typeaheadOnly
            />
          </div>
        </div>

        <div className="recipe-modal__foot">
          {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
          <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!title.trim() || busy}>
            {t.recipes.save}
          </button>
        </div>
      </form>

      {/* Verify-against-the-photo gate (Pillar 3): a read result waits here while the
          cook checks the flagged numbers against the source card, then it's applied. */}
      {readReview && (
        <RecipeReadReview
          photoUrl={readReview.photoUrl}
          draft={readReview.draft}
          lowConfidenceWords={readReview.lowConfidenceWords}
          busy={confirming}
          onConfirm={confirmRead}
          onCancel={closeReadReview}
        />
      )}
    </div>
  )
}

// One step's photo control (feature #17 B). With a photo: a tap-to-enlarge
// thumbnail (ZoomableImg, the same viewer flyers use) + change / remove. Without:
// a single 📷 add button. The parent owns the key; this just picks a file and
// reports add/clear, so the parallel-array bookkeeping stays in RecipeForm.
function StepPhoto({
  imgKey,
  uploading,
  onPick,
  onClear,
  t,
}: {
  imgKey: string
  uploading: boolean
  onPick: (file: File) => void
  onClear: () => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="recipe-step__photo">
      {imgKey ? (
        <>
          <ZoomableImg src={imgUrl(imgKey)} className="recipe-step__photo-thumb" alt="" />
          <label className="btn btn--ghost mono recipe-step__photo-btn">
            <InlineIcon name="camera-bold" size={14} /> {uploading ? '…' : t.recipes.stepPhotoChange}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPick(f)
                e.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn--ghost mono recipe-step__photo-btn recipe-step__photo-del"
            onClick={onClear}
            aria-label={t.recipes.stepPhotoRemove}
          >
            <Icon name="x-bold" size={14} />
          </button>
        </>
      ) : (
        <label className="btn btn--ghost mono recipe-step__photo-btn">
          <InlineIcon name="image-square-bold" size={14} /> {uploading ? '…' : t.recipes.stepPhotoAdd}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}
