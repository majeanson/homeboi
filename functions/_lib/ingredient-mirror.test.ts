import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE MIRROR RULE, made structural. `functions/_lib/ingredient.ts` and
// `src/lib/ingredient.ts` are the same function in two trees that don't share code
// (the Worker bundle and the SPA bundle), and BOTH headers have said "keep them
// byte-identical" in prose since the client copy was added.
//
// Prose is exactly what drifted on 2026-08-28: cook mode's « Il en manque » sent a
// name derived CLIENT-side while the grocery list derived it SERVER-side, so a
// divergence would have shown up as the same ingredient landing under two different
// names — an invisible bug, since each half looks right on its own.
//
// Sibling of write-rule.test.ts: a cross-cutting rule nothing enforced. Comments and
// blank lines are allowed to differ (the server copy carries the canonical doc
// block); the CODE may not.
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

// Line comments + blank lines out, everything else compared verbatim. Safe for these
// two files specifically: neither contains a `//` inside a string or a regex literal.
// If one ever does, this strip is the thing to fix — not the assertion.
const codeOf = (rel: string) =>
  readFileSync(join(root, rel), 'utf8')
    .split('\n')
    .map((l) => l.replace(/\s*\/\/.*$/, '').trim())
    .filter(Boolean)
    .join('\n')

describe('ingredient.ts mirrors', () => {
  it('the client copy and the server copy are the same code', () => {
    expect(codeOf('src/lib/ingredient.ts')).toBe(codeOf('functions/_lib/ingredient.ts'))
  })
})
