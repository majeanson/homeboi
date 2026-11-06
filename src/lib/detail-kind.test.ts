import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// EVERY KIND OF PEEK HAS A BUILDER (solidify 6.7, 2026-11-06). `DetailKind` once carried a
// `note` arm that nothing built: the sheet read as if notes had a peek, and the matrix
// agreed. A kind with no adapter is a promise with no door, so a new arm must arrive with its
// builder. Planted red with a fresh arm in the union. PARITY's D2 leans on this.

const detail = readFileSync(join(__dirname, 'detail.ts'), 'utf8')
const adapters = readFileSync(join(__dirname, '../components/detail/adapters.ts'), 'utf8')

const union = detail.slice(detail.indexOf('type DetailKind'), detail.indexOf('// One block of body content'))
const kinds = [...union.matchAll(/^\s*\|\s*'([a-z-]+)'/gm)].map((m) => m[1] ?? '')

describe('DetailKind ↔ adapters', () => {
  it('found the union (canary)', () => {
    expect(kinds.length).toBeGreaterThan(8)
  })
  it('every kind is built by an adapter', () => {
    const unbuilt = kinds.filter((k) => !new RegExp(`kind: (?:[^,\\n]*\\? )?(?:'[a-z-]+' : )?'${k}'`).test(adapters))
    expect(unbuilt).toEqual([])
  })
})
