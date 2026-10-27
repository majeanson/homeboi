import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { DraftOut } from '../_lib/recipeDraft'

// THE RECIPE CORPUS (2026-10-27) — real pages, captured whole, with a hand-verified
// expected read. One folder per page under functions/test/fixtures/recipes/corpus/:
//   page.html.gz   the page's raw HTML as the server sent it (gzip)
//   meta.json      { url, capturedAt, reach: 'direct'|'blocked', via, notes, pending? }
//   expected.json  what a cook would type from that page — verified by READING the page
//
// Used three ways, always through the production seam (_lib/recipeImportPage):
// recipeCorpus.test.ts (every push), scripts/recipe-corpus.mjs (capture + score) and
// e2e/recipe-live.spec.ts (weekly, against the live sites).
//
// `meta.pending` names a KNOWN gap with the workstream that closes it (« C2: Ricardo's
// ingredient groups »). The test then demands the entry still MISMATCH — so the day the
// gap closes, the marker has to come off and the entry joins the exact ratchet.

export const CORPUS_DIR = join(import.meta.dirname, 'fixtures', 'recipes', 'corpus')

export interface CorpusMeta {
  url: string
  capturedAt: string
  reach: 'direct' | 'blocked'
  via: 'playwright' | 'curl'
  notes?: string
  pending?: string
}

// The fields a cook would check — everything the form fills from an import.
export interface Expected {
  title: string | null
  servings: number | null
  servingsUnit: string | null
  times: { prep: number | null; cook: number | null; total: number | null }
  ingredients: string[]
  steps: string[]
  notes: string | null
  structuring: DraftOut['structuring'] | null
  // Several recipes on one page: their titles, in page order (C4).
  candidates?: string[]
}

export interface CorpusEntry {
  id: string
  dir: string
  meta: CorpusMeta
  expected: Expected | null
  html: () => string
}

export function loadCorpus(dir = CORPUS_DIR): CorpusEntry[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((id) => {
      const p = join(dir, id)
      const meta = JSON.parse(readFileSync(join(p, 'meta.json'), 'utf8')) as CorpusMeta
      const ex = join(p, 'expected.json')
      return {
        id,
        dir: p,
        meta,
        expected: existsSync(ex) ? (JSON.parse(readFileSync(ex, 'utf8')) as Expected) : null,
        html: () => gunzipSync(readFileSync(join(p, 'page.html.gz'))).toString('utf8'),
      }
    })
}

// A draft, projected onto the fields the corpus checks.
export function expectedOf(d: DraftOut & { candidates?: { title: string | null }[] }): Expected {
  const out: Expected = {
    title: d.title,
    servings: d.servings,
    servingsUnit: d.servingsUnit,
    times: { prep: d.times.prep, cook: d.times.cook, total: d.times.total },
    ingredients: d.ingredients,
    steps: d.steps,
    notes: d.notes ?? null,
    structuring: d.empty ? null : (d.structuring ?? null),
  }
  if (d.candidates && d.candidates.length > 1) out.candidates = d.candidates.map((c) => c.title ?? '')
  return out
}

// Field-by-field differences, as readable lines (a list shows the first differing row).
export function diffExpected(want: Expected, got: Expected): string[] {
  const out: string[] = []
  const scalar = (k: keyof Expected) => {
    if (JSON.stringify(want[k] ?? null) !== JSON.stringify(got[k] ?? null))
      out.push(`${k}: want ${JSON.stringify(want[k] ?? null)} got ${JSON.stringify(got[k] ?? null)}`)
  }
  const list = (k: 'ingredients' | 'steps' | 'candidates') => {
    const a = want[k] ?? []
    const b = got[k] ?? []
    if (JSON.stringify(a) === JSON.stringify(b)) return
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        out.push(`${k}[${i}] (${a.length} vs ${b.length}):\n  - ${JSON.stringify(a[i])}\n  + ${JSON.stringify(b[i])}`)
        return
      }
    }
  }
  scalar('title')
  scalar('servings')
  scalar('servingsUnit')
  scalar('times')
  scalar('notes')
  scalar('structuring')
  list('ingredients')
  list('steps')
  list('candidates')
  return out
}
