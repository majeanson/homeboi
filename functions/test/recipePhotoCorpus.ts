import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LineSelection } from '../_lib/ai'
import { stripStepPrefix } from '../_lib/recipeImport'
import type { Expected } from './recipeCorpus'

// THE PHOTO CORPUS (2026-10-30) — real cookbook pages photographed on a phone, with the
// transcript the vision reader ACTUALLY returned and a hand-verified expected read. One
// folder per recipe under functions/test/fixtures/recipes/photos/:
//   page-N.jpg             the photo, downscaled to 1500 px (what the reader sees is
//                          ~1120 px — lib/image VISION_MAX); absent for a duplicate shot
//   page-N.transcript.txt  the reader's transcript of that page, verbatim
//   meta.json              { pages, readerModel, readAt, notes, pending?, readerErrors? }
//   expected.json          what a cook would type from the PAGE — verified by reading it
//
// Two readers of this corpus, deliberately split:
//   recipePhotoCorpus.test.ts (every push) — the DETERMINISTIC half: the transcripts are
//     stitched (lib/ocrMerge) and structured without a model, and the test demands that
//     every expected line is ONE whole pickable line of the stitched text and that the
//     draft built from those lines is exactly the expectation. That is the half that
//     broke on 2026-10-30 (lines swallowed by the merge, cut at sentences, a column-break
//     remainder dropped) — none of it needed a model to go wrong.
//   scripts/recipe-photos.mjs (on demand) — the LIVE half: re-reads the photos through the
//     deployed reader and the deployed selection model, and scores the result against
//     expected.json. The reader is non-deterministic; one run proves nothing, three say
//     something.
//
// `meta.readerErrors` names what the READER got wrong on the page (a ⅔ read as ¼, a step
// lost at a column break) — the text path cannot mend those, so expected.json holds the
// page's truth and the entry is `pending` until a better read replaces the transcript.

export const PHOTO_CORPUS_DIR = join(import.meta.dirname, 'fixtures', 'recipes', 'photos')

export interface PhotoMeta {
  pages: number
  source: string
  shot: string
  readAt: string
  readerModel: string
  notes?: string
  // A KNOWN gap with what closes it — the test then demands the entry still mismatch.
  pending?: string
  // What the reader misread on the page, one line each (the verify panel's job).
  readerErrors?: string[]
  // The audit flags this entry SHOULD raise (none unless named).
  audit?: string[]
}

export interface PhotoEntry {
  id: string
  dir: string
  meta: PhotoMeta
  expected: Expected | null
  transcripts: string[]
}

const isHeading = (l: string) => l.startsWith('## ')
const unheading = (l: string) => l.replace(/^##\s*/, '')
// A typographic apostrophe and a straight one are the same word to a cook — the
// expectations were typed from one reader's « d’huile », another reader writes « d'huile »,
// and neither is a reading error. Every comparison in the corpus goes through this.
const VULGAR: Record<string, string> = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' }
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const SUB = '₀₁₂₃₄₅₆₇₈₉'
export const canon = (s: string) =>
  s
    .replace(/[’‘`´]/g, "'")
    // A fraction typeset as superscript ⁄ subscript (« ²⁄₃ », one reader's spelling of ⅔).
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)[⁄/]([₀₁₂₃₄₅₆₇₈₉]+)/g, (_, a: string, b: string) => `${[...a].map((c) => SUP.indexOf(c)).join('')}/${[...b].map((c) => SUB.indexOf(c)).join('')}`)
    // A fraction glyph and its ASCII spelling (« ⅓ » / « 1/3 ») are one amount.
    .replace(/(\d)\s*([¼½¾⅓⅔⅛⅜⅝⅞])/g, (_, d, g) => `${d} ${VULGAR[g]}`)
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (g) => VULGAR[g])
    // French guillemets with or without their inner spaces (« gril » / «gril»).
    .replace(/«\s*/g, '« ')
    .replace(/\s*»/g, ' »')
    .replace(/\s+/g, ' ')
    .trim()
// A part heading's CASE is the page's typography (« pour une version bol » is printed
// lowercase, a reader capitalises it) — compared case-blind; the lines keep theirs.
const canonLine = (l: string) => (l.startsWith('## ') ? canon(l).toLowerCase() : canon(l))
export const canonExpected = (e: Expected): Expected => ({
  ...e,
  title: e.title == null ? null : canon(e.title),
  ingredients: e.ingredients.map(canonLine),
  steps: e.steps.map(canonLine),
  notes: e.notes == null ? null : e.notes.split('\n').map(canon).join('\n'),
  ...(e.candidates ? { candidates: e.candidates.map(canon) } : {}),
})
// A line as the draft would copy it: list bullet off, a label's trailing colon off.
const bare = (l: string) => canon(l.replace(/^(?:[-•·▪◦‣*–—›»▸►⇨➜→]+|,)\s*/, ''))
const label = (l: string) => bare(l).replace(/\s*:\s*$/, '')

// The selection a model that chose PERFECTLY would return for an expectation: each
// expected line located as ONE whole line of `lines` (a step the way the draft copies
// it — its printed number off; an ingredient with every figure). A line that cannot be
// found whole is reported in `missing` — the corpus test's finding 2, and the measure
// a reader is scored by (scripts/recipe-photos.mjs read-claude).
export function perfectSelection(lines: string[], want: Expected): { sel: LineSelection; missing: string[] } {
  const missing: string[] = []
  const used = new Set<number>()
  const find = (raw: string, how: (l: string) => string): number | null => {
    const text = canon(raw)
    const i = lines.findIndex((l, k) => !used.has(k) && how(l) === text)
    if (i < 0) return null
    used.add(i)
    return i
  }
  const pickList = (items: string[], how: (l: string) => string) => {
    const picked: number[] = []
    const sections: { line: number; before: number }[] = []
    let pendingLabel: string | null = null
    for (const item of items) {
      if (isHeading(item)) {
        pendingLabel = unheading(item)
        continue
      }
      const i = find(item, how)
      if (i == null) {
        missing.push(item)
        continue
      }
      if (pendingLabel != null) {
        // A version's part (« pour une version bol — Pour la sauce ») is the page's
        // « Pour la sauce » label under the version's label: the draft composes the
        // title, the page prints only the part (recipeDraft, 2026-10-30).
        const printed = pendingLabel.includes(' — ') ? pendingLabel.slice(pendingLabel.lastIndexOf(' — ') + 3) : pendingLabel
        const li = find(printed.toLowerCase(), (l) => label(l).toLowerCase())
        if (li == null) missing.push(`## ${pendingLabel}`)
        else sections.push({ line: li, before: i })
        pendingLabel = null
      }
      picked.push(i)
    }
    if (pendingLabel != null) missing.push(`## ${pendingLabel}`)
    return { picked, sections }
  }
  const ing = pickList(want.ingredients, bare)
  const st = pickList(want.steps, (l) => stripStepPrefix(bare(l)))
  const notes: number[] = []
  for (const n of (want.notes ?? '').split('\n').filter(Boolean)) {
    const i = find(n, bare)
    if (i == null) missing.push(`(note) ${n}`)
    else notes.push(i)
  }
  const title = want.title == null ? null : find(want.title, bare)
  return {
    sel: { title, servings: null, prep: null, cook: null, ingredients: ing.picked, steps: st.picked, notes, ingredientSections: ing.sections, stepSections: st.sections },
    missing,
  }
}

export function loadPhotoCorpus(dir = PHOTO_CORPUS_DIR): PhotoEntry[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((id) => {
      const p = join(dir, id)
      const meta = JSON.parse(readFileSync(join(p, 'meta.json'), 'utf8')) as PhotoMeta
      const ex = join(p, 'expected.json')
      const transcripts: string[] = []
      for (let i = 1; i <= meta.pages; i++) transcripts.push(readFileSync(join(p, `page-${i}.transcript.txt`), 'utf8'))
      return {
        id,
        dir: p,
        meta,
        expected: existsSync(ex) ? (JSON.parse(readFileSync(ex, 'utf8')) as Expected) : null,
        transcripts,
      }
    })
}
