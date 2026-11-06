import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE TOKEN RULES (2026-11-05, wave 0.2 of plans/2026-11-05-SOLIDIFY.md) — sibling of
// layer-order / field-fit / keyboard-fit: CSS invariants that never throw when broken.
//
// What the first scan found, none of it visible in a code review:
//   • `var(--danger)` at 9 sites and `var(--ok)` at 3, DEFINED NOWHERE — each rendered its
//     own literal fallback (#c0392b here, #c2563a there, a #3bb24a green off the palette).
//   • `var(--muted)` at two sites with NO fallback and no definition: `color: initial`.
//   • 15 × `var(--accent, #2a8f85)` — a teal hex under the marigold accent; 4 ×
//     `var(--marigold-deep, #d9842a)`, the value from BEFORE the contrast fix. None of
//     these fallbacks ever applied (the token is always defined), so they were only
//     wrong in the one way that matters: a reader trusts them.
//   • 62 literal z-index values for a scale that existed only as a comment.
//
// Four rules, each fail-closed where today's count is 0 and a RATCHET (falls, never
// rises) where a residue is being swept down wave by wave:
//   1. a `var(--x)` with no fallback must resolve: `--x` is declared somewhere in src
//      (a CSS declaration or a string a component sets).
//   2. a fallback on a token core.css's :root base block defines is forbidden — the
//      base block IS the fallback, and a second value beside it is the one that rots.
//   3. no literal `z-index` ≥ 10 in src/styles — the overlay scale is `--z-*` tokens;
//      0–9 is a local stacking order inside one component and stays literal.
//   4. ratchets: distinct @media WIDTH queries (toward the three canonical widths named
//      in core.css), hex literals in .tsx (toward tokens / lib/colors).

const stylesDir = dirname(fileURLToPath(import.meta.url))
const srcDir = join(stylesDir, '..')
const rootDir = join(srcDir, '..')

function walk(dir: string, re: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p, re)
    return re.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}
const rel = (f: string) => relative(rootDir, f).split(sep).join('/')
const css = walk(stylesDir, /\.css$/)
const tsx = walk(srcDir, /\.(tsx|ts)$/)
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

// Tokens the :root BASE block (the day palette, before any theme override) defines.
const core = readFileSync(join(stylesDir, 'core.css'), 'utf8')
const baseBlock = /:root\s*\{([^}]*)\}/.exec(noComments(core))![1]
const BASE = new Set([...baseBlock.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))

// Every custom property declared ANYWHERE: a CSS `--x:` declaration, or a component
// naming it as a string (`style={{ '--x': … }}`, `setProperty('--x', …)`).
const DECLARED = new Set<string>(BASE)
for (const f of css) for (const m of noComments(readFileSync(f, 'utf8')).matchAll(/(--[a-z0-9-]+)\s*:/g)) DECLARED.add(m[1])
for (const f of tsx) for (const m of readFileSync(f, 'utf8').matchAll(/['"`](--[a-z0-9-]+)['"`]/g)) DECLARED.add(m[1])

describe('tokens', () => {
  it('found the palette (a broken parser must not pass vacuously)', () => {
    expect(BASE.has('--accent')).toBe(true)
    expect(BASE.has('--z-sheet')).toBe(true)
    expect(BASE.size).toBeGreaterThan(80)
  })

  it('every var(--x) with no fallback resolves to a declared custom property', () => {
    const bad: string[] = []
    for (const f of [...css, ...tsx]) {
      const src = f.endsWith('.css') ? noComments(readFileSync(f, 'utf8')) : readFileSync(f, 'utf8')
      for (const m of src.matchAll(/var\((--[a-z0-9-]+)\s*\)/g)) {
        if (!DECLARED.has(m[1])) bad.push(`${rel(f)}: var(${m[1]})`)
      }
    }
    expect([...new Set(bad)].join('\n'), 'a var() that resolves to nothing renders as `initial` — define the token in core.css or use the one that exists').toBe('')
  })

  it('no fallback on a token the :root base block already defines', () => {
    const bad: string[] = []
    for (const f of [...css, ...tsx]) {
      const src = f.endsWith('.css') ? noComments(readFileSync(f, 'utf8')) : readFileSync(f, 'utf8')
      for (const m of src.matchAll(/var\((--[a-z0-9-]+)\s*,/g)) {
        if (BASE.has(m[1])) bad.push(`${rel(f)}: var(${m[1]}, …)`)
      }
    }
    expect([...new Set(bad)].join('\n'), 'the base block IS the fallback; a second value beside it is the one that goes stale (15 × a teal hex under --accent, 2026-11-05)').toBe('')
  })

  it('no literal z-index ≥ 10 in the stylesheets — the overlay scale is --z-* tokens', () => {
    const bad: string[] = []
    for (const f of css) {
      const src = noComments(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/z-index\s*:\s*(\d+)/g)) if (+m[1] >= 10) bad.push(`${rel(f)}: z-index: ${m[1]}`)
    }
    expect(bad.join('\n'), 'name the layer: add or reuse a --z-* token in core.css (and keep the prose scale in sheets/capture.css true)').toBe('')
  })

  // ── Ratchets. Lower the pin in the commit that earns it; never raise it. ──

  // Distinct WIDTH queries (min-/max-width, px or rem). 24 on 2026-11-05, 14 after 5.3 folded the
  // near-duplicates. It stops there on purpose: what is left around 340-420px decides
  // which side a real phone lands on, `max 699` pairs with the <source> in Home.tsx, and
  // `43.99rem` pairs with `44rem`. Three widths would move layouts no frame can check.
  const MEDIA_WIDTHS_MAX = 14
  it(`uses at most ${MEDIA_WIDTHS_MAX} distinct @media width queries (ratchet)`, () => {
    const seen = new Set<string>()
    for (const f of css) for (const m of noComments(readFileSync(f, 'utf8')).matchAll(/@media[^{]*?\((min|max)-width:\s*([0-9.]+(?:px|rem))\)/g)) seen.add(`${m[1]}:${m[2]}`)
    expect(seen.size, `distinct width queries: ${[...seen].sort().join(' ')}`).toBeLessThanOrEqual(MEDIA_WIDTHS_MAX)
  })

  // Hex colour literals in components AND lib (a tint belongs in a token or a colour
  // table). 267 on 2026-11-05 — data tints (member colours, the measure-pill table,
  // chart series) will stay; chrome will not.
  const TSX_HEX_MAX = 267
  it(`has at most ${TSX_HEX_MAX} hex colour literals in .tsx/.ts (ratchet)`, () => {
    let n = 0
    for (const f of tsx) n += (readFileSync(f, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length
    expect(n).toBeLessThanOrEqual(TSX_HEX_MAX)
  })
})
