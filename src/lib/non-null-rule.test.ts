import { spawnSync } from 'node:child_process'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// A `!` NON-NULL ASSERTION ONLY EVER GETS RARER IN PRODUCT CODE (solidify 7.3, 2026-11-19).
// `x!.y` tells the compiler « trust me »; at runtime it is `x.y`, and it throws when the
// trust was wrong. The plan meant to ban it outright when the audit counted 7. Turning on
// `noUncheckedIndexedAccess` (2026-11-06) made every `arr[i]` possibly undefined, and most
// of today's sites are an index the line before already proved: 309 in product code
// (`functions/test/` helpers excluded), ~820 in tests. Marc's call (2026-11-19): a RATCHET over product code only. A new `!` costs a
// real narrowing (`if (!x) return`, `?.`, a default) or the removal of an old one; a sweep
// lowers the max in its own commit. Tests are out of scope: a wrong `!` there fails the test.
//
// It counts with oxlint's own `typescript/no-non-null-assertion` (an AST, the same engine
// as `npm run lint`), one hit per assertion. Planted red with a `!` added in format.ts.

const ROOT = join(__dirname, '..', '..')
const NON_NULL_MAX = 309
const DIRS = ['src', 'functions', 'worker', 'shared']

type Diag = { filename: string; labels: { span: { offset: number } }[] }

function productAssertions(): string[] {
  const bin = join(ROOT, 'node_modules', 'oxlint', 'bin', 'oxlint')
  const run = spawnSync(process.execPath, [bin, '-A', 'all', '-D', 'typescript/no-non-null-assertion', '-f', 'json', ...DIRS], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const out = JSON.parse(run.stdout) as { diagnostics: Diag[] }
  const hits = new Set<string>()
  for (const d of out.diagnostics) {
    const file = relative(ROOT, join(ROOT, d.filename)).split(sep).join('/')
    if (/\.test\.tsx?$/.test(file) || file.includes('/test/')) continue
    hits.add(`${file}@${d.labels[0]?.span.offset ?? 0}`)
  }
  return [...hits]
}

describe('non-null rule: product code only ever has fewer `!`', () => {
  const hits = productAssertions()

  it('the counter sees assertions (canary: the count is not zero by a broken run)', () => {
    expect(hits.length, 'oxlint returned no assertion at all; the spawn or its JSON shape broke').toBeGreaterThan(0)
  })

  it(`at most ${NON_NULL_MAX} non-null assertions in product code (ratchet)`, () => {
    expect(hits.length, `product code has ${hits.length} \`!\` assertions (max ${NON_NULL_MAX}). Narrow instead (\`if (!x) return\`, \`?.\`, a default); never raise the max`).toBeLessThanOrEqual(NON_NULL_MAX)
    expect(hits.length, `the ratchet is loose: lower NON_NULL_MAX to ${hits.length}`).toBeGreaterThan(NON_NULL_MAX - 10)
  })
})
