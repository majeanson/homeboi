import type { Env } from './env'
import { SELECTION_MODEL, type LineSelection, type Lang, selectRecipeLines, selectionLines } from './ai'
import { detectLang } from './langDetect'
import { MAX_STEPS, NO_TIMES, type RecipeTimes, parseRecipeText, parseYield, refineSteps, textToMinutes } from './recipeImport'
import { jsonFragmentsToText, repairRecipeRead, stripTranscriptPreamble } from './recipeRepair'
import { dropDanglingHeadings, makeSectionHeading } from './recipeSections'

// THE ONE text → draft path (2026-09-24). It lived inline in api/recipe-import's paste
// branch, and api/recipe-vision had its own: the vision model was asked to read AND
// structure a photo in one generative pass, and on a paragraph card it put the method
// in the ingredients, the footer in the steps, invented prep/cook times from the
// durations in the method, and — cut off by max_tokens — left the prose fallback
// reading raw JSON lines, quotes and all. The same card pasted as TEXT came out
// perfect through this path. So the vision model only TRANSCRIBES now, and its
// transcript comes here like a paste does: deterministic headings parser first, the
// text model to organise free-form text, the shape heuristic when AI is off or
// empty-handed, and repairRecipeRead over whatever comes out.

export interface DraftOut {
  title: string | null
  ingredients: string[]
  steps: string[]
  servings: number | null
  servingsUnit: string | null
  times: RecipeTimes
  image: string | null
  source: string | null
  // Auto-detected reading language ('fr' | 'en' | null = couldn't tell → the form
  // leaves its language on "Auto"). Set here so every import path fills it.
  lang: 'fr' | 'en' | null
  // The recipe's own notes (« Notes », « Conseils », « Astuces » — the lines under that
  // heading, word for word). Never a model's: the site path harvests them from the page
  // text, the paste path from the paste. Capped at the save cap (2000).
  notes?: string | null
  // Several recipes on the page (C4): each one's title — the draft is candidate `pick`.
  candidates?: { i: number; title: string | null }[]
  // The site's own photo per step (C3), aligned to `steps`; the endpoint stores them
  // and answers `stepImages` (R2 keys) instead.
  stepImageUrls?: (string | null)[]
  // HOW this draft was structured, for the photo-read report (RecipeReadReview's
  // « Rapport » tab): 'headings' = the deterministic no-AI parser (real section
  // headings found), 'ai' = the text model CHOSE the lines (named in `model`; every word
  // is still the source's — it picks line numbers, never writes),
  // 'heuristic' = the shape-based best effort (no AI available or AI empty-handed),
  // 'jsonld' / 'microdata' = the page's own structured data (URL import, no AI).
  structuring?: 'headings' | 'ai' | 'heuristic' | 'jsonld' | 'microdata'
  model?: string | null
  // The source the model chose from, NUMBERED as the model saw it (structuring 'ai'
  // only, capped) — the verify panel shows it beside the lines, the way the photo read
  // shows the photo.
  transcript?: string
  empty?: boolean
  // Why we came back empty-handed, so the UI can say something true instead of one
  // catch-all "rien trouvé":
  //   'blocked'    — the page refused us (bot manager); pasting the text still works.
  //   'no-recipe'  — we read the page fine, there was just no recipe on it.
  reason?: 'blocked' | 'no-recipe'
}

export const draft = (d: Partial<DraftOut>): DraftOut => {
  const base: DraftOut = {
    title: null,
    ingredients: [],
    steps: [],
    servings: null,
    servingsUnit: null,
    times: NO_TIMES,
    image: null,
    source: null,
    lang: null,
    ...d,
  }
  // repairRecipeRead (recipeRepair.ts): leaked JSON and field lines out, the footer
  // out, and a paragraph recipe gets its ingredients lifted word for word from the
  // method. An honest read passes through untouched. NOT on the site's own
  // structured data: the site delimited every step, and the footer rule deleted a real
  // last step there (« Conserver au réfrigérateur jusqu'au service », 2026-10-27).
  const siteData = d.structuring === 'jsonld' || d.structuring === 'microdata'
  const merged: DraftOut = siteData ? base : repairRecipeRead(base)
  // Detect the recipe's language from its own words (title + the lines), unless a
  // caller already supplied one. Runs on every path — incl. the no-AI JSON-LD /
  // paste ones — so the read-aloud voice matches the recipe wherever it came from.
  merged.lang = merged.lang ?? detectLang([merged.title, ...merged.ingredients, ...merged.steps].join('\n'))
  return merged
}

// The no-model draft is good enough to ship when it has a title, a real ingredient
// list, and a method of sentence-steps that all close — a transcript that lost its
// punctuation (a weak OCR, a handwritten card) fails this and gets the model.
export function heuristicIsGood(d: DraftOut): boolean {
  const steps = d.steps.filter((s) => !s.startsWith('## '))
  const ings = d.ingredients.filter((s) => !s.startsWith('## '))
  if (!d.title || ings.length < 2 || steps.length < 2 || steps.length > MAX_STEPS) return false
  const closed = steps.filter((s) => /[.!?]$/.test(s)).length
  return closed * 10 >= steps.length * 8
}

type Known = Pick<DraftOut, 'title' | 'servings' | 'servingsUnit' | 'times'> & { notes?: string | null }

// The text model CHOOSES the lines of `text` (one call, behind runModel's budget —
// _lib/ai selectRecipeLines); the draft is then built from the source by index, so no
// word in it was written by a model. Null when the model came back empty-handed.
// Servings, times and the title come from the TEXT's own read (`known`) first; the lines
// the model pointed at only fill what that read left empty.
export async function draftByModel(env: Env, text: string, lang: Lang, known: Known, hint?: string): Promise<DraftOut | null> {
  const lines = selectionLines(text)
  const sel = await selectRecipeLines(env, lines, lang, hint)
  if (!sel) return null
  const d = draftFromSelection(lines, sel, known)
  if (!d) return null
  return draft({
    ...d,
    structuring: 'ai',
    model: SELECTION_MODEL,
    // The source the verify panel shows beside the lines — numbered, as the model saw it.
    transcript: lines.map((l, i) => `${i}: ${l}`).join('\n').slice(0, 16_000),
  })
}

// A selection → the draft's fields, every line VERBATIM from `lines` (only a list
// bullet is dropped, and a label's closing colon). A part label becomes a « ## » line
// before the first selected line of its part.
export function draftFromSelection(lines: string[], sel: LineSelection, known: Known): Omit<DraftOut, 'image' | 'source' | 'lang'> | null {
  const bare = (i: number) => lines[i].replace(/^[-•·▪◦‣*–—]+\s*/, '').trim()
  const label = (i: number) => bare(i).replace(/\s*:\s*$/, '')
  const withParts = (items: number[], parts: { line: number; before: number }[]): string[] => {
    const pending = [...parts].sort((a, b) => a.before - b.before)
    const out: string[] = []
    for (const i of items) {
      while (pending.length && pending[0].before <= i) out.push(makeSectionHeading(label(pending.shift()!.line)))
      out.push(bare(i))
    }
    return dropDanglingHeadings(out)
  }
  const ingredients = withParts(sel.ingredients, sel.ingredientSections)
  // The method's lines as printed — one line, one step; refineSteps only strips a
  // « 1. » the editor numbers itself and splits a run-on past the step cap.
  const steps = dropDanglingHeadings(refineSteps(withParts(sel.steps, sel.stepSections), { blob: 'keep' }))
  if (!ingredients.length && !steps.length) return null
  const at = (i: number | null) => (i == null ? null : lines[i])
  const notes = sel.notes.map(bare).join('\n').slice(0, 2000) || null
  return {
    title: known.title ?? (sel.title != null ? bare(sel.title).slice(0, 200) : null),
    ingredients,
    steps,
    servings: known.servings ?? parseYield(at(sel.servings)),
    servingsUnit: known.servingsUnit,
    times: {
      prep: known.times.prep ?? (at(sel.prep) ? textToMinutes(at(sel.prep)!) : null),
      cook: known.times.cook ?? (at(sel.cook) ? textToMinutes(at(sel.cook)!) : null),
      total: known.times.total,
    },
    notes: notes ?? known.notes ?? null,
  }
}

// Free text (a paste, an OCR transcript, the vision model's transcription) → a draft.
// `aiOn` = the binding is wired AND the household has not switched AI off; when false
// the text model is never called. The result is `empty` only when nothing at all
// could be made of the text.
// `hint` = the cook's optional note for the model (« c'est la 2e recette de la page »);
// it only reaches the prompt when the model actually runs.
export async function draftFromText(env: Env, raw: string, lang: Lang, aiOn: boolean, hint?: string): Promise<DraftOut> {
  const r = readText(raw)
  if (r.read) return r.read
  // Free-form text → the model picks which LINES are what (draftByModel); the words
  // stay the source's. Servings and times come from the TEXT first: the vision read
  // used to turn « cuire 5 minutes » into a prep time.
  if (aiOn) {
    const byModel = await draftByModel(env, r.text, lang, r.known, hint)
    if (byModel) return byModel
  }
  // AI unbound or empty-handed — the heuristic's best effort still beats nothing.
  return r.fallback
}

// The NO-MODEL half of draftFromText, synchronous: `read` is a draft good enough to
// ship without the model (real headings, or a paragraph card the shape heuristic read
// well), else null; `fallback` is the heuristic's best effort (or an empty draft) for
// when the model is off or empty-handed. `text` is the cleaned text the model would get.
// `known` is the heuristic's own read, empty or not — the title, servings and times a
// model read takes from the TEXT, never from the model.
export interface TextRead {
  text: string
  read: DraftOut | null
  fallback: DraftOut
  known: DraftOut
}
export function readText(raw: string): TextRead {
  // A reply that is JSON, or the broken remains of one, reads as text first; a label a
  // model put before the text it copied (« Transcription… », « Texte ») is not recipe.
  const text = stripTranscriptPreamble(jsonFragmentsToText(raw.trim()))
  // Format first: a recipe with its real headings (Ingrédients / Préparation) parses
  // deterministically — no AI, nothing invented. Markdown-shaped text (the cloud OCR
  // reader answers in markdown) flattens first so its headings hit the same parser.
  const heuristic = parseRecipeText(text)
  const fields = {
    title: heuristic.title,
    ingredients: heuristic.ingredients,
    steps: heuristic.steps,
    servings: heuristic.servings,
    servingsUnit: heuristic.servingsUnit,
    times: heuristic.times,
    notes: heuristic.notes,
  }
  if (heuristic.confident) {
    const read = draft({ ...fields, structuring: 'headings' })
    return { text, read, fallback: read, known: read }
  }
  // A PARAGRAPH card the shape heuristic already read well needs no model: title, a
  // lifted ingredient list and sentence-steps that all close on punctuation. Taking it
  // as is saves the second model call (5–10 s on a phone) AND keeps the printed words
  // — the model rephrased a step on the very card this was measured on. Garbled OCR
  // (sentences that do not close) still goes to the model below.
  const plain = draft({ ...fields, structuring: 'heuristic' })
  const fallback =
    heuristic.ingredients.length || heuristic.steps.length
      ? plain
      : draft({ title: heuristic.title, empty: true })
  return { text, read: heuristicIsGood(plain) ? plain : null, fallback, known: plain }
}
