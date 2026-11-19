// Review #43 helper: rename/fold e2e specs into a journey file and repoint every reference.
//   node scripts/e2e-journey.mjs <journey-name> "<title>" <main-spec> [<other-spec> …]
// The MAIN spec is git-mv'd to e2e/journey-<name>.spec.ts and gets a header line. Each OTHER
// spec is appended under a section comment and removed; its imports are merged by hand after
// (the script prints them). References to any old `<spec>.spec.ts` across the repo are rewritten.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [name, title, main, ...others] = process.argv.slice(2)
if (!name || !title || !main) throw new Error('usage: e2e-journey <name> "<title>" <main> [others…]')
const root = process.cwd()
const target = `journey-${name}.spec.ts`
const git = (...a) => execFileSync('git', a, { stdio: 'inherit' })

git('mv', `e2e/${main}.spec.ts`, `e2e/${target}`)
let s = readFileSync(`e2e/${target}`, 'utf8')
const was = [main, ...others].map((x) => `${x}.spec.ts`).join(' + ')
const head = `// JOURNEY — ${title} (review #43; was ${was}).\n//\n`
const firstComment = s.search(/^\/\//m)
s = firstComment >= 0 ? s.slice(0, firstComment) + head + s.slice(firstComment) : head + s
for (const o of others) {
  const src = readFileSync(`e2e/${o}.spec.ts`, 'utf8')
  const imports = src.match(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm) ?? []
  console.log(`--- imports of ${o}:\n${imports.join('')}`)
  const body = src.replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '').trim()
  s = s.trimEnd() + `\n\n// ── folded from ${o}.spec.ts ──────────────────────────────────────────────\n\n${body}\n`
  git('rm', '-q', `e2e/${o}.spec.ts`)
}
writeFileSync(`e2e/${target}`, s)

// Repoint references (code, docs, CI config); plans/ and the review file keep their history.
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
  for (const x of [main, ...others]) t = t.split(`${x}.spec.ts`).join(target)
  if (t !== before) {
    writeFileSync(f, t)
    console.log('repointed', f.slice(root.length + 1))
  }
}
