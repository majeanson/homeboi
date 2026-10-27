// THE RECIPE CORPUS TOOL — capture a real recipe page, score the corpus.
//
//   node scripts/recipe-corpus.mjs capture <url> [--slug <slug>]
//   node scripts/recipe-corpus.mjs score
//   node scripts/recipe-corpus.mjs links <listing-or-sitemap-url> [<regex>]
//
// capture: drives Playwright's Chromium from THIS machine (a residential browser —
// Akamai sites refuse curl and every Worker, 2026-10-27), saves the page's raw HTML as
// the server sent it (`page.html.gz`) + `meta.json` (with the REACH a Worker would get:
// a plain Node fetch with the Worker's user-agent), runs the production seam
// (`importFromHtml`, functions/_lib/recipeImportPage.ts) and writes what it read as
// `expected.json` (only if none exists — else `expected.proposed.json`), plus
// `proposed.txt`: the rendered text of the page, to verify the expectation BY READING.
// A proposed expected.json is a draft, not a truth: read the page, fix it by hand.
//
// score: the table the commit message carries — per entry, which fields match.
// links: lists the links of a listing page or a sitemap (discover REAL recipe URLs;
// guessed slugs 404).
//
// Untrusted input: the captured pages are only ever parsed, never executed here.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKER_UA = 'Babillard/0.1 (+household planner)'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

async function load(rel) {
  const { module } = await runnerImport(join(ROOT, rel), { configFile: false, logLevel: 'silent' })
  return module
}

const slugOf = (u) => {
  const url = new URL(u)
  const host = url.hostname.replace(/^www\./, '')
  const last = url.pathname.split('/').filter(Boolean).pop() ?? 'index'
  return `${host}__${last.replace(/\.[a-z]+$/i, '').replace(/[^a-z0-9-]+/gi, '-').slice(0, 60)}`
}

// What a Worker gets: a plain fetch with our user-agent.
async function workerReach(url) {
  try {
    const res = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': WORKER_UA, 'accept-language': 'fr-CA' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    return { reach: res.ok ? 'direct' : 'blocked', status: res.status }
  } catch (e) {
    return { reach: 'blocked', status: String(e?.message ?? e) }
  }
}

async function browse(urls, fn) {
  const { chromium } = await import('@playwright/test')
  // The FULL Chromium in new-headless mode ('chromium' channel), not the headless shell:
  // Akamai refuses the shell outright. CORPUS_CHANNEL=chrome uses the installed Chrome,
  // CORPUS_HEADED=1 shows the window — the last resort for a stubborn bot manager.
  const browser = await chromium.launch({
    channel: process.env.CORPUS_CHANNEL ?? 'chromium',
    headless: !process.env.CORPUS_HEADED,
  })
  try {
    const ctx = await browser.newContext({ userAgent: CHROME_UA, locale: 'fr-CA', viewport: { width: 1280, height: 900 } })
    for (const u of urls) {
      const page = await ctx.newPage()
      try {
        await fn(page, u)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}

async function capture(url, slug) {
  const seam = await load('functions/_lib/recipeImportPage.ts')
  const corpus = await load('functions/test/recipeCorpus.ts')
  const id = slug ?? slugOf(url)
  const dir = join(corpus.CORPUS_DIR, id)
  const reach = await workerReach(url)
  await browse([url], async (page) => {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    if (!res || !res.ok()) throw new Error(`browser got ${res?.status()} for ${url}`)
    const html = await res.text()
    const text = await page.evaluate(() => document.body?.innerText ?? '')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'page.html.gz'), gzipSync(Buffer.from(html, 'utf8')))
    const meta = {
      url,
      capturedAt: new Date().toISOString().slice(0, 10),
      reach: reach.reach,
      via: 'playwright',
      notes: `worker fetch: ${reach.status}`,
    }
    if (!existsSync(join(dir, 'meta.json'))) writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
    const read = corpus.expectedOf(seam.importFromHtml(html, url))
    const target = existsSync(join(dir, 'expected.json')) ? 'expected.proposed.json' : 'expected.json'
    writeFileSync(join(dir, target), JSON.stringify(read, null, 2) + '\n')
    writeFileSync(join(dir, 'proposed.txt'), text)
    console.log(`${id}: reach=${reach.reach} (${reach.status}) title=${JSON.stringify(read.title)} ` +
      `ings=${read.ingredients.length} steps=${read.steps.length} via=${read.structuring} → ${target}`)
  })
}

async function score() {
  const seam = await load('functions/_lib/recipeImportPage.ts')
  const corpus = await load('functions/test/recipeCorpus.ts')
  const rows = []
  let exact = 0
  for (const e of corpus.loadCorpus()) {
    if (!e.expected) continue
    const got = corpus.expectedOf(seam.importFromHtml(e.html(), e.meta.url))
    const want = e.expected
    const diff = corpus.diffExpected(want, got)
    if (!diff.length) exact++
    const n = (k) => {
      const a = want[k] ?? []
      const b = got[k] ?? []
      const same = a.filter((x, i) => b[i] === x).length
      return `${same}/${a.length}`
    }
    const eq = (k) => (JSON.stringify(want[k] ?? null) === JSON.stringify(got[k] ?? null) ? '✓' : '✗')
    rows.push([e.id.slice(0, 48), e.meta.reach, eq('title'), n('ingredients'), n('steps'), eq('notes'), eq('times'),
      eq('servings'), diff.length ? (e.meta.pending ? `pending: ${e.meta.pending}` : 'MISMATCH') : 'exact'])
  }
  const head = ['entry', 'reach', 'title', 'ingredients', 'steps', 'notes', 'times', 'yield', 'verdict']
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join(' | ')
  console.log(line(head))
  console.log(w.map((x) => '-'.repeat(x)).join('-|-'))
  for (const r of rows) console.log(line(r))
  console.log(`\n${exact}/${rows.length} exact`)
}

// propose: re-run the pipeline over the stored page and write what it reads NOW as
// expected.proposed.json — to diff against the hand-verified expected.json, never to
// replace it unread.
async function propose(id) {
  const seam = await load('functions/_lib/recipeImportPage.ts')
  const corpus = await load('functions/test/recipeCorpus.ts')
  for (const e of corpus.loadCorpus().filter((x) => x.id.startsWith(id ?? ''))) {
    const read = corpus.expectedOf(seam.importFromHtml(e.html(), e.meta.url))
    writeFileSync(join(e.dir, 'expected.proposed.json'), JSON.stringify(read, null, 2) + '\n')
    console.log(e.id)
  }
}

// debug: the window the parsers see and the text read of it, for one corpus entry.
async function debug(id) {
  const seam = await load('functions/_lib/recipeImportPage.ts')
  const corpus = await load('functions/test/recipeCorpus.ts')
  const e = corpus.loadCorpus().find((x) => x.id.startsWith(id))
  if (!e) throw new Error('no entry ' + id)
  const r = seam.readPage(seam.sourceFromHtml(e.html(), e.meta.url))
  console.log('--- window ---')
  console.log(r.window)
  console.log('--- known (text read) ---')
  console.log(JSON.stringify(corpus.expectedOf(r.known), null, 2))
  console.log('--- draft ---')
  console.log(JSON.stringify(r.draft && corpus.expectedOf(r.draft), null, 2))
  const want = e.expected
  if (want && r.draft) {
    console.log('--- diff ---')
    for (const d of corpus.diffExpected(want, corpus.expectedOf(r.draft))) console.log(d)
  }
}

async function links(url, pattern) {
  const re = pattern ? new RegExp(pattern) : null
  await browse([url], async (page) => {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const body = (await res?.text()) ?? ''
    const found = new Set()
    for (const m of body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) found.add(m[1])
    for (const h of await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href)).catch(() => []))
      found.add(h)
    const out = [...found].filter((u) => !re || re.test(u))
    console.log(out.slice(0, 80).join('\n'))
    console.log(`(${out.length} links${re ? ' matching' : ''}; status ${res?.status()})`)
  })
}

const [cmd, arg, ...rest] = process.argv.slice(2)
const flag = (name) => {
  const i = rest.indexOf(name)
  return i >= 0 ? rest[i + 1] : undefined
}
if (cmd === 'capture' && arg) await capture(arg, flag('--slug'))
else if (cmd === 'score') await score()
else if (cmd === 'debug' && arg) await debug(arg)
else if (cmd === 'propose') await propose(arg)
else if (cmd === 'links' && arg) await links(arg, rest[0])
else {
  console.log('usage: recipe-corpus.mjs capture <url> [--slug s] | score | links <url> [regex]')
  process.exit(1)
}
