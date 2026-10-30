// THE PHOTO CORPUS TOOL — read real cookbook photos through the DEPLOYED reader, propose
// an expectation, score the corpus. The counterpart of recipe-corpus.mjs for photos.
//
//   node scripts/recipe-photos.mjs read [<id>]      re-transcribe each page on prod → page-N.transcript.proposed.txt
//   node scripts/recipe-photos.mjs propose [<id>]   stitch the stored transcripts, structure them on prod
//                                                   (the selection model) → expected.proposed.json
//   node scripts/recipe-photos.mjs score [<id>]     propose, then diff against expected.json — the table
//   node scripts/recipe-photos.mjs add <slug> <photo…>   downscale the photos into a new entry (no read)
//
// Every call that reaches the model mints a 24 h demo SANDBOX on the deployed app
// (POST /api/demo — the one door that needs no account) and spends its AI budget;
// BASE=<url> points elsewhere. A proposed file is a draft, never a truth: read the page,
// fix expected.json by hand. The reader is non-deterministic — read three times before
// calling a difference a regression.
//
// Untrusted input: the photos are only ever uploaded, the replies only ever parsed.

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE ?? 'https://babillard.marc-jeanson.workers.dev'
const require = createRequire(import.meta.url)

async function load(rel) {
  const { module } = await runnerImport(join(ROOT, rel), { configFile: false, logLevel: 'silent' })
  return module
}

// A sandbox session: the cookies the demo door sets, echoed back with the CSRF token.
async function sandbox() {
  const res = await fetch(`${BASE}/api/demo`, { method: 'POST', headers: { 'accept-language': 'fr-CA' } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.sandbox) throw new Error(`demo mint: ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
  const jar = Object.fromEntries(res.headers.getSetCookie().map((c) => c.split(';')[0].split('=')))
  const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), 'X-CSRF-Token': jar.bb_csrf ?? '', 'X-Lang': 'fr' }
  return {
    async post(path, body, type) {
      const r = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': type },
        body: type === 'application/json' ? JSON.stringify(body) : body,
      })
      const text = await r.text()
      let json = null
      try {
        json = JSON.parse(text)
      } catch {}
      if (!r.ok || !json) throw new Error(`${path}: ${r.status} ${text.slice(0, 300)}`)
      return json
    },
  }
}

async function entries(id) {
  const corpus = await load('functions/test/recipePhotoCorpus.ts')
  return corpus.loadPhotoCorpus().filter((e) => !id || e.id.startsWith(id))
}

async function read(id) {
  const sb = await sandbox()
  for (const e of await entries(id)) {
    for (let i = 1; i <= e.meta.pages; i++) {
      const photo = join(e.dir, `page-${i}.jpg`)
      if (!existsSync(photo)) {
        console.log(`${e.id} page ${i}: no photo (a duplicate shot — transcript only)`)
        continue
      }
      const t0 = Date.now()
      const r = await sb.post('/api/recipe-vision?only=transcript', readFileSync(photo), 'image/jpeg')
      writeFileSync(join(e.dir, `page-${i}.transcript.proposed.txt`), (r.transcript ?? '') + '\n')
      const same = (r.transcript ?? '').trim() === e.transcripts[i - 1].trim()
      console.log(`${e.id} page ${i}: ${r.readerModel} ${(r.transcript ?? '').length} chars ${Date.now() - t0} ms — ${same ? 'same as stored' : 'DIFFERS from stored'}${r.aiError ? ` aiError=${r.aiError}` : ''}`)
    }
  }
}

async function propose(id, quiet = false) {
  const { mergeOcrPages } = await load('src/lib/ocrMerge.ts')
  const corpus = await load('functions/test/recipeCorpus.ts')
  const sb = await sandbox()
  const out = []
  for (const e of await entries(id)) {
    const text = mergeOcrPages(e.transcripts)
    const t0 = Date.now()
    const d = await sb.post('/api/recipe-import', { text }, 'application/json')
    const read = corpus.expectedOf(d)
    writeFileSync(join(e.dir, 'expected.proposed.json'), JSON.stringify(read, null, 2) + '\n')
    if (!quiet)
      console.log(`${e.id}: title=${JSON.stringify(read.title)} ings=${read.ingredients.length} steps=${read.steps.length} via=${read.structuring} audit=${JSON.stringify((d.audit ?? []).map((f) => f.kind))} ${Date.now() - t0} ms`)
    out.push({ e, read, audit: d.audit ?? [] })
  }
  return out
}

async function score(id) {
  const corpus = await load('functions/test/recipeCorpus.ts')
  const rows = []
  let exact = 0
  for (const { e, read: got, audit } of await propose(id, true)) {
    if (!e.expected) {
      rows.push([e.id, '—', '—', '—', '—', '—', '—', 'no expected.json'])
      continue
    }
    const want = e.expected
    const diff = corpus.diffExpected(want, got)
    if (!diff.length) exact++
    const n = (k) => {
      const a = want[k] ?? []
      const b = got[k] ?? []
      return `${a.filter((x, i) => b[i] === x).length}/${a.length}`
    }
    const eq = (k) => (JSON.stringify(want[k] ?? null) === JSON.stringify(got[k] ?? null) ? '✓' : '✗')
    rows.push([e.id, eq('title'), n('ingredients'), n('steps'), eq('notes'), eq('times'), eq('servings'),
      diff.length ? (e.meta.pending ? `pending: ${e.meta.pending}` : `MISMATCH — ${diff[0].split('\n')[0]}`) : 'exact',
      audit.map((f) => f.kind).join(',') || '—'])
  }
  const head = ['entry', 'title', 'ingredients', 'steps', 'notes', 'times', 'yield', 'verdict', 'audit']
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)))
  const line = (r) => r.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ')
  console.log(line(head))
  console.log(w.map((x) => '-'.repeat(x)).join('-|-'))
  for (const r of rows) console.log(line(r))
  console.log(`\n${exact}/${rows.length} exact (live: the deployed reader's transcripts are NOT used here — the stored ones are; run \`read\` to compare readers)`)
}

// add <slug> <photo…>: a new entry from phone photos — downscaled, EXIF-rotated, no read yet.
async function add(slug, photos) {
  const sharp = require('sharp')
  const corpus = await load('functions/test/recipePhotoCorpus.ts')
  const dir = join(corpus.PHOTO_CORPUS_DIR, slug)
  mkdirSync(dir, { recursive: true })
  let i = 0
  for (const p of photos) {
    i++
    const info = await sharp(p).rotate().resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(join(dir, `page-${i}.jpg`))
    console.log(`${slug} page ${i}: ${basename(p)} → ${info.width}×${info.height} ${Math.round(info.size / 1024)} KB`)
  }
  if (!existsSync(join(dir, 'meta.json'))) {
    const meta = { pages: i, source: '', shot: photos.map((p) => basename(p)).join(', '), readAt: '', readerModel: '', notes: '' }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  }
  console.log(`now: node scripts/recipe-photos.mjs read ${slug} — then rename each page-N.transcript.proposed.txt to page-N.transcript.txt, fill meta.readAt/readerModel, propose, verify.`)
}

const [cmd, arg, ...rest] = process.argv.slice(2)
if (cmd === 'read') await read(arg)
else if (cmd === 'propose') await propose(arg)
else if (cmd === 'score') await score(arg)
else if (cmd === 'add' && arg && rest.length) await add(arg, rest)
else {
  console.log('usage: recipe-photos.mjs read [id] | propose [id] | score [id] | add <slug> <photo…>')
  process.exit(1)
}
