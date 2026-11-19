// Review #43 helper: fold e2e specs into one journey file and repoint every reference.
//   node scripts/e2e-journey.mjs <journey-name> "<title>" <main-spec> [<other-spec> …]
// The MAIN spec is git-mv'd to e2e/journey-<name>.spec.ts and gets a header line. Each OTHER spec
// is folded in as its own `describe` block (which scopes its constants, helpers and `test.use`),
// its imports merged into the file's. A folded spec whose `test` comes from a different module
// gets it under an alias. References to any old `<spec>.spec.ts` outside plans/ are rewritten.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [name, title, main, ...others] = process.argv.slice(2)
if (!name || !title || !main) throw new Error('usage: e2e-journey <name> "<title>" <main> [others…]')
const root = process.cwd()
const target = `journey-${name}.spec.ts`
const git = (...a) => execFileSync('git', a, { stdio: 'inherit' })

const IMPORT = /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\n?/gm
/** { module → { def?: string, names: Map<local, spec>, typeOnly: bool } } plus the body without imports. */
function parse(src) {
  const mods = new Map()
  for (const m of src.matchAll(IMPORT)) {
    const clause = m[1].trim()
    const mod = m[2]
    const entry = mods.get(mod) ?? { def: null, names: new Map() }
    const typeOnly = clause.startsWith('type ')
    const c = typeOnly ? clause.slice(5) : clause
    const braces = /\{([\s\S]*)\}/.exec(c)
    const def = c.replace(/\{[\s\S]*\}/, '').replace(/,\s*$/, '').trim()
    if (def) entry.def = def
    if (braces)
      for (const part of braces[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const spec = typeOnly && !part.startsWith('type ') ? `type ${part}` : part
        const local = spec.replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim()
        entry.names.set(local, spec)
      }
    mods.set(mod, entry)
  }
  return { mods, body: src.replace(IMPORT, '').trim() }
}
const testSource = (mods) => [...mods].find(([, e]) => e.names.has('test'))?.[0]
const render = (mods) =>
  [...mods]
    .map(([mod, e]) => {
      const named = [...e.names.values()]
      const parts = [e.def, named.length ? `{ ${named.join(', ')} }` : null].filter(Boolean).join(', ')
      return `import ${parts} from '${mod}'`
    })
    .join('\n')

git('mv', `e2e/${main}.spec.ts`, `e2e/${target}`)
const m0 = parse(readFileSync(`e2e/${target}`, 'utf8'))
const mods = m0.mods
const mainTest = testSource(mods)
const was = [main, ...others].map((x) => `${x}.spec.ts`).join(' + ')
let body = `// JOURNEY — ${title} (review #43; was ${was}).\n//\n${m0.body}`
others.forEach((o, i) => {
  const p = parse(readFileSync(`e2e/${o}.spec.ts`, 'utf8'))
  let b = p.body
  let t = 'test'
  const src = testSource(p.mods)
  if (src && src !== mainTest) {
    // A different `test`: import it under an alias and use the alias in this block.
    t = `test${i + 2}`
    const spec = p.mods.get(src).names.get('test')
    p.mods.get(src).names.delete('test')
    p.mods.get(src).names.set(t, spec.includes(' as ') ? spec.replace(/\s+as\s+\w+$/, ` as ${t}`) : `test as ${t}`)
    // Not a method named test: `/re/.test(x)` must stay a RegExp call.
    b = b.replace(/(?<![.\w$])test(?=\s*[.(])/g, t)
  }
  // One binding per local name across ALL modules: `expect` from './fixtures' and from
  // '@playwright/test' are the same function, and a second import of it is a duplicate.
  const bound = new Set([...mods.values()].flatMap((e) => [...e.names.keys(), ...(e.def ? [e.def] : [])]))
  for (const [mod, e] of p.mods) {
    const into = mods.get(mod) ?? { def: null, names: new Map() }
    if (e.def && !into.def && !bound.has(e.def)) into.def = e.def
    for (const [local, spec] of e.names) {
      if (bound.has(local)) continue
      into.names.set(local, spec)
      bound.add(local)
    }
    if (into.def || into.names.size) mods.set(mod, into)
  }
  body += `\n\n// ── folded from ${o}.spec.ts ──────────────────────────────────────────────\n${t}.describe('${o}', () => {\n${b
    .split('\n')
    .map((l) => (l ? `  ${l}` : l))
    .join('\n')}\n})\n`
  git('rm', '-qf', `e2e/${o}.spec.ts`)
})
writeFileSync(`e2e/${target}`, `${render(mods)}\n\n${body.trimEnd()}\n`)

// The main spec's body goes into its own describe as well, so its file-level hooks (a frozen
// clock, a viewport) never reach a folded block (journey-voyage found that one the hard way).
if (others.length) execFileSync('node', [join(root, 'scripts/e2e-journey-wrap.mjs'), `e2e/${target}`], { stdio: 'inherit' })

const skip = new Set(['node_modules', '.git', 'dist', 'plans', 'test-results', 'screenshots', 'coverage'])
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    if (skip.has(f) || f === 'REVIEW-PERSONAS-2026-11-17.md') return []
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|md|json|yml|yaml|css)$/.test(f) ? [p] : []
  })
for (const f of walk(root)) {
  let t = readFileSync(f, 'utf8')
  const before = t
  // The journey's own header line names what it was made of: leave it alone.
  const HEADER = /^\/\/ JOURNEY — .*$/m
  const keep = f.endsWith(target) ? (t.match(HEADER) ?? [''])[0] : ''
  for (const x of [main, ...others]) t = t.split(`${x}.spec.ts`).join(target)
  if (keep) t = t.replace(HEADER, keep)
  if (t !== before) {
    writeFileSync(f, t)
    console.log('repointed', f.slice(root.length + 1))
  }
}
