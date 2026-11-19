import { test, expect } from '@playwright/test'
import { join } from 'node:path'

// THE RECIPE LIVE CONTRACT (`npm run e2e:recipes`, weekly) — the corpus, against the
// LIVE sites. functions/_lib/recipeCorpus.test.ts scores the pages as they were captured;
// this goes and fetches them again, the way the WORKER does (a plain fetch, our
// user-agent), and checks two facts per page:
//
//   1. REACH — a page captured as `direct` must still answer a Worker; one captured as
//      `blocked` (Akamai: recettes.qc.ca, Zeste, IGA…) must still refuse it. A flip
//      either way is news: a site that started refusing needs the bookmark, a site
//      that stopped refusing can drop it from the « blocked » list.
//   2. THE READ — for a reachable page, the production seam (`importFromHtml`) must
//      still read it EXACTLY as `expected.json` says. A site redesign shows up here
//      before a household finds a recipe with no steps.
//
// A red run is the fact that moved. Re-capture (`node scripts/recipe-corpus.mjs capture
// <url>`), read the page, then update expected.json — out loud, in a commit that says
// what changed.

const WORKER_UA = 'Babillard/0.1 (+household planner)'
const ROOT = join(import.meta.dirname, '..')

// The seam and the corpus helpers are Worker-side TypeScript: loaded through Vite's
// module runner (as scripts/recipe-corpus.mjs does) so this spec runs the exact
// production code without pulling the Worker's types into the e2e typecheck.
async function load<T>(rel: string): Promise<T> {
  const { runnerImport } = await import('vite')
  const { module } = await runnerImport<T>(join(ROOT, rel), { configFile: false, logLevel: 'silent' })
  return module
}

interface Expected {
  title: string | null
  ingredients: string[]
  steps: string[]
}
interface Entry {
  id: string
  meta: { url: string; reach: 'direct' | 'blocked'; pending?: string }
  expected: Expected | null
}
interface Corpus {
  loadCorpus(): Entry[]
  expectedOf(d: unknown): Expected
  diffExpected(a: Expected, b: Expected): string[]
}
interface Seam {
  importFromHtml(html: string, url: string): unknown
}
interface Refusal {
  isRefusalPage(html: string): boolean
}

test('every corpus page: the same reach, the same read', async () => {
  const corpus = await load<Corpus>('functions/test/recipeCorpus.ts')
  const seam = await load<Seam>('functions/_lib/recipeImportPage.ts')
  const refusal = await load<Refusal>('functions/_lib/renderPage.ts')
  const entries = corpus.loadCorpus()
  expect(entries.length).toBeGreaterThanOrEqual(12)
  const problems: string[] = []
  for (const e of entries) {
    let html: string | null = null
    try {
      const res = await fetch(e.meta.url, {
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': WORKER_UA, 'accept-language': 'fr-CA' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      })
      if (res.ok) {
        const body = await res.text()
        if (!refusal.isRefusalPage(body)) html = body
      }
    } catch {
      /* refused at the connection — reach is « blocked » */
    }
    const reach = html === null ? 'blocked' : 'direct'
    if (reach !== e.meta.reach) {
      problems.push(`${e.id}: reach was « ${e.meta.reach} », now « ${reach} »`)
      continue
    }
    if (html === null || !e.expected || e.meta.pending) continue
    const diff = corpus.diffExpected(e.expected, corpus.expectedOf(seam.importFromHtml(html, e.meta.url)))
    if (diff.length) problems.push(`${e.id}: the live page reads differently\n  ${diff.join('\n  ')}`)
  }
  console.log(`${entries.length} pages checked, ${problems.length} moved`)
  expect(problems, problems.join('\n')).toEqual([])
})
