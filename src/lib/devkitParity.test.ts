import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// /dev/kit ↔ code parity, both directions.
//
// The standing rule (CLAUDE.md): "a new primitive that isn't in the gallery is
// invisible to the next session and will get re-invented." Nothing enforced it, and
// the 2026-09-09 audit found the rule had quietly stopped being true: COMPONENTS.md's
// primitive table carried 140 rows under a heading that said « gallery-suitable »,
// 91 of them had a specimen, and there was NO WAY TO TELL an oversight from a
// deliberate exemption — so both accumulated silently. Eight primitives the law in
// CLAUDE.md tells you to reach for (`FormScene` among them) simply weren't there.
//
// The fix is a convention this file enforces: a row either has a live specimen, or
// ends with `*(no specimen: <reason>)*`. Both halves fail closed.
//
// It also pins the two shapes that made the audit itself lie before it was believed:
//  - a component NAME that lives in two files (`LoadError` did, and the two had
//    drifted apart in behaviour — see COMPONENTS.md's Fallback row);
//  - a gallery entry whose `name` promises a component its `file` doesn't export
//    (`WidgetGrid · CardSlot` cited only WidgetGrid.tsx).
//
// House rule, and it earned its keep here: PLANT THE BUG, WATCH IT GO RED, then
// trust it. Every expectation below was proven red against a real planted violation
// before this file was committed.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'src')
const DEVKIT = path.join(SRC, 'pages/DevKit.tsx')
const MD = path.join(ROOT, 'COMPONENTS.md')

const devkit = fs.readFileSync(DEVKIT, 'utf8')
const md = fs.readFileSync(MD, 'utf8')
const mdLines = md.split(/\r?\n/)

// ── the gallery ──────────────────────────────────────────────────────────────
type Entry = { cat: string; name: string; files: string[] }

// Anchored on the three fields in their real order. A looser parse (matching the
// `Entry[]` brackets, or a bare /cat: '…'/) is how two earlier passes at this
// counted a local `cat` variable inside a render as if it were an entry.
const ENTRIES: Entry[] = [...devkit.matchAll(/\n\s+cat: '([^']+)',\n\s+name: '([^']+)',\n\s+file: '([^']+)',/g)].map(
  (m) => ({ cat: m[1], name: m[2], files: pathsIn(m[3]) }),
)

/** Every path-shaped token in a string — a `file` may cite several, or wrap them in prose. */
function pathsIn(s: string): string[] {
  return [...s.matchAll(/[A-Za-z0-9_/.-]+\.(?:tsx?|css)/g)].map((m) => m[0])
}

// ── COMPONENTS.md's primitive table ──────────────────────────────────────────
type Row = { line: number; name: string; files: string[]; excused: boolean }

const secStart = mdLines.findIndex((l) => l.startsWith('## Shared primitives'))
const secEnd = mdLines.findIndex((l) => l.startsWith('### Page orchestrators'))
const ROWS: Row[] = []
for (let i = secStart; i < secEnd; i++) {
  const l = mdLines[i]
  if (!l.startsWith('|')) continue
  const cells = l.split('|').map((c) => c.trim())
  if (cells.length < 4) continue
  const name = cells[1].replace(/\*\*/g, '').trim()
  if (!name || /^-+$/.test(name) || name === 'Component') continue
  const files = pathsIn(cells[2])
  if (!files.length) continue
  ROWS.push({ line: i + 1, name, files, excused: /\*\(no specimen: .+?\)\*/.test(l) })
}

describe('/dev/kit ↔ COMPONENTS.md parity', () => {
  it('parses both sides (canary — a parser that finds nothing proves nothing)', () => {
    // Both numbers only ever move deliberately. They exist so that a regex that
    // silently stops matching fails HERE, loudly, instead of turning every rule
    // below into a green no-op — the failure mode this repo has recorded five times.
    expect(ENTRIES.length).toBeGreaterThan(100)
    expect(ROWS.length).toBeGreaterThan(130)
  })

  it('every primitive row has a specimen, or says why not', () => {
    const kitFiles = new Set(ENTRIES.flatMap((e) => e.files))
    const offenders = ROWS.filter((r) => {
      if (r.excused) return false
      // Only a real component can be a specimen; a route or a lib seam must be excused
      // in the doc rather than silently tolerated here.
      if (!r.files.some((f) => f.startsWith('components/') && f.endsWith('.tsx'))) return true
      return !r.files.some((f) => kitFiles.has(f))
    }).map((r) => `COMPONENTS.md:${r.line} ${r.name} (${r.files.join(', ')})`)

    expect(
      offenders,
      'Each of these is listed as a shared primitive but has no live specimen in /dev/kit.\n' +
        'Add an Entry to src/pages/DevKit.tsx, or end the row with *(no specimen: <reason>)*.',
    ).toEqual([])
  })

  it('every gallery entry points at files that exist', () => {
    const missing: string[] = []
    for (const e of ENTRIES)
      for (const f of e.files) if (!fs.existsSync(path.join(SRC, f))) missing.push(`${e.name} → src/${f}`)
    expect(missing, 'A gallery entry cites a file that is not there — a rename left the gallery lying.').toEqual([])
  })

  it('every gallery entry name is exported by one of its files', () => {
    const bad: string[] = []
    for (const e of ENTRIES) {
      const exported = new Set(e.files.flatMap((f) => exportsOf(path.join(SRC, f))))
      for (const token of e.name.split('·').map((t) => t.trim()))
        // Only bare PascalCase tokens are component promises; « Contraste (WCAG) » and
        // « Élévation (--shadow-*) » are foundations, not exports.
        if (/^[A-Z][A-Za-z0-9]*$/.test(token) && !exported.has(token))
          bad.push(`${e.name} → "${token}" is not exported by ${e.files.join(', ')}`)
    }
    expect(bad, 'A gallery entry promises a component its own file does not export.').toEqual([])
  })

  it('no component name is declared in two files', () => {
    // `LoadError` was declared in BOTH components/Fallback.tsx and components/LoadError.tsx
    // — same name, same job, opposite behaviour offline, and the import line was the
    // only tell. Merged 2026-09-09; this keeps the fork from growing back.
    const home = new Map<string, string[]>()
    for (const f of walk(path.join(SRC, 'components'))) {
      if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(/^export function ([A-Z][A-Za-z0-9]*)\(/gm)) {
        const rel = path.relative(SRC, f).split(path.sep).join('/')
        home.set(m[1], [...(home.get(m[1]) ?? []), rel])
      }
    }
    const dupes = [...home.entries()].filter(([, files]) => files.length > 1).map(([n, f]) => `${n}: ${f.join(' + ')}`)
    expect(dupes, 'Two components share a name. One of them is a fork waiting to drift.').toEqual([])
  })

  it('the gallery has one name per category', () => {
    // « Champs & saisie » had grown beside « Saisie », stranding two entries in a
    // section of their own. One word per idea (UNIFY.md), inside the gallery too.
    const cats = [...new Set(ENTRIES.map((e) => e.cat))]
    const collisions: string[] = []
    for (const a of cats)
      for (const b of cats)
        if (a !== b && norm(b).includes(norm(a))) collisions.push(`"${a}" is contained in "${b}"`)
    expect(collisions, 'Two gallery categories name the same idea.').toEqual([])
  })
})

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

function exportsOf(file: string): string[] {
  if (!fs.existsSync(file)) return []
  const src = fs.readFileSync(file, 'utf8')
  const names: string[] = []
  for (const m of src.matchAll(
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/g,
  ))
    names.push(m[1])
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop()
      if (n) names.push(n)
    }
  return names
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p)
  }
  return out
}
