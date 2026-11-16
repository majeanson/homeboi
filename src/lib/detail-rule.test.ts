import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readScanned, sourceFiles } from './buildGuardScan'

// THE PEEK RULE (solidify plan, wave 6.7 — PARITY D2 « tap an item → detail peek »,
// until now scored by hand).
//
// `lib/detail.ts` lists every kind of thing the peek can describe (`DetailKind`), and
// `components/detail/adapters.ts` builds each one (`buildEvent`, `buildMeal`, …). Two
// ways for the two to drift, both silent:
//   · a DEAD ARM — a kind in the union that nothing builds. 'note' sat there until
//     someone noticed nothing had ever built one (detail.ts still says so);
//   · an UNREACHABLE PEEK — a builder that exists, is unit-tested, and that no row ever
//     calls, so the peek PARITY scores ✅ cannot be opened.
// This reads both files and holds the chain: every kind is built by an exported
// builder, and every builder is called from at least one surface.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')
const DETAIL = join(srcDir, 'lib', 'detail.ts')
const ADAPTERS = join(srcDir, 'components', 'detail', 'adapters.ts')

/** The members of `type DetailKind = | 'a' | 'b' …`. */
export function detailKinds(src: string): string[] {
  const block = /type DetailKind\s*=([\s\S]*?)\n\n/.exec(src)?.[1] ?? ''
  return [...block.matchAll(/^\s*\|\s*'([a-z-]+)'/gm)].map((m) => m[1]!)
}

/** builder name → the DetailKind literals its `kind:` property can take. */
export function buildersByKind(src: string, kinds: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const starts = [...src.matchAll(/^export function (build\w+)/gm)]
  starts.forEach((m, i) => {
    const body = src.slice(m.index, starts[i + 1]?.index ?? src.length)
    const found = new Set<string>()
    // `kind: 'x'` and `kind: cond ? 'x' : 'y'` — a block's `kind: 'text'` is not a DetailKind.
    for (const k of body.matchAll(/\bkind:\s*([^,\n]+)/g)) for (const lit of k[1]!.matchAll(/'([a-z-]+)'/g)) if (kinds.includes(lit[1]!)) found.add(lit[1]!)
    if (found.size) out.set(m[1]!, [...found])
  })
  return out
}

describe('the peek rule (every detail kind is built, and every builder is reachable)', () => {
  const kinds = detailKinds(readFileSync(DETAIL, 'utf8'))
  const builders = buildersByKind(readScanned(ADAPTERS), kinds)

  it('the readers see the union and the builders (a broken parser must not pass vacuously)', () => {
    expect(kinds).toEqual(expect.arrayContaining(['event', 'meal', 'contact', 'transfer']))
    expect(kinds.length).toBeGreaterThanOrEqual(10)
    const fixture = [
      `export function buildA(): DetailModel {`,
      `  const b = [{ kind: 'text', text }]`,
      `  return { kind: opts.todo ? 'todo' : 'chore', blocks: b }`,
      `}`,
      `export function buildB() { return { kind: 'event' } }`,
    ].join('\n')
    expect(Object.fromEntries(buildersByKind(fixture, ['todo', 'chore', 'event']))).toEqual({ buildA: ['todo', 'chore'], buildB: ['event'] })
  })

  it('no dead arm: every DetailKind is built by an adapter', () => {
    const built = new Set([...builders.values()].flat())
    expect(
      kinds.filter((k) => !built.has(k)),
      'A DetailKind nothing builds is a promise the peek cannot keep. Build it in components/detail/adapters.ts ' +
        '(an exported build<Thing>), or remove the arm from lib/detail.ts.',
    ).toEqual([])
  })

  it('no unreachable peek: every builder is called from a surface', () => {
    const callers = sourceFiles(srcDir)
      .filter((f) => f !== ADAPTERS)
      .map((f) => ({ file: relative(rootDir, f).split(sep).join('/'), src: readScanned(f) }))
    const orphans = [...builders.keys()].filter((name) => !callers.some((c) => new RegExp(String.raw`\b${name}\s*\(`).test(c.src)))
    expect(
      orphans,
      'This builder makes a peek no row opens. Wire it with useEntityDetail() on the row that shows the thing ' +
        '(lib/detail.ts, components/detail/DetailProvider), or delete it.',
    ).toEqual([])
  })
})
