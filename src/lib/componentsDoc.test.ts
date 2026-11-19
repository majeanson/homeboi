import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- a plain .mjs script (scripts/ stays JS, run by node); no declaration file
import { MARKER, renderComponents } from '../../scripts/gen-components.mjs'

// COMPONENTS.md is GENERATED from the /dev/kit gallery and each component's own doc comment
// (review #42). A hand edit under the marker, a gallery entry added without a regenerate, or a
// component whose doc comment changed all leave the file stale; this fails until
// `npm run components` is run. It replaces the parity checks that compared a hand-kept table
// with the gallery: there is no second copy to compare any more.
const ROOT = join(import.meta.dirname, '..', '..')

describe('COMPONENTS.md is what the generator prints', () => {
  it('has the marker, and everything under it is generated', () => {
    const md = readFileSync(join(ROOT, 'COMPONENTS.md'), 'utf8')
    expect(md.includes(MARKER as string), 'the generated-section marker is gone from COMPONENTS.md').toBe(true)
    expect(md, 'COMPONENTS.md is stale: run `npm run components`').toBe((renderComponents as (root: string) => string)(ROOT))
  })

  it('lists the gallery (a parser that finds nothing proves nothing)', () => {
    const md = readFileSync(join(ROOT, 'COMPONENTS.md'), 'utf8')
    expect((md.split(MARKER as string)[1] ?? '').match(/^\| \*\*/gm)?.length ?? 0).toBeGreaterThan(100)
  })
})
