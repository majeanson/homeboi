import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A ROW THAT SCROLLS SIDEWAYS MUST BE REACHABLE WITH A MOUSE (CLAUDE.md « A scrolling
// row must be reachable with a mouse, not just a thumb »). A mouse wheel only emits
// deltaY and no browser maps that onto a horizontal scroller; a hidden scrollbar leaves
// no bar to drag either. `useHScroll()` (lib/hscroll) maps the wheel and hands it back
// to the page at either end; `Rail` and `SubTabs` wire it already. The rule was prose,
// and four rows (cook mode's timer rail and sibling tabs, the recipe book's two filter
// rows) plus the drawing pad's template pickers sat outside it (solidify 1.9).
//
// FAIL-CLOSED inventory: every CSS rule that is a side-scrolling flex/grid row
// (`overflow-x: auto|scroll` on a `display: flex|grid` block) names a class; each JSX
// element carrying that class either carries a `ref=` (the hook's) or IS <Rail>/<SubTabs>
// — or the class sits in ALLOWED with the reason. A class no .tsx spells is skipped here
// (the dead-class guard owns those). Planted red with TimerRail's ref removed.

const stylesDir = dirname(fileURLToPath(import.meta.url))
const SRC = join(stylesDir, '..')

const ALLOWED = new Map<string, string>([
  // (none today — a row that cannot take the hook says why here)
])

function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p, ext)
    return ext.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

// Innermost `selector { body }` pairs (flat rules; an @media header never matches).
function rules(css: string): { selector: string; body: string }[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: { selector: string; body: string }[] = []
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim().split('\n').pop()!.trim(), body: m[2] })
  return out
}

// The side-scrolling rows: a single-class selector whose block is a flex/grid row
// that scrolls on x.
export function hscrollClasses(): Map<string, string> {
  const out = new Map<string, string>()
  for (const f of walk(stylesDir, /\.css$/)) {
    for (const r of rules(readFileSync(f, 'utf8'))) {
      const m = /^\.([A-Za-z0-9_-]+)$/.exec(r.selector)
      if (!m) continue
      if (/overflow-x\s*:\s*(auto|scroll)/.test(r.body) && /display\s*:\s*(flex|grid)/.test(r.body)) out.set(m[1], relative(SRC, f).split(sep).join('/'))
    }
  }
  return out
}

// Every JSX open tag whose className literal spells `cls`: does it carry a ref, or is it
// one of the two primitives that own the hook?
function hosts(src: string, cls: string): { tag: string; wired: boolean; line: number }[] {
  const out: { tag: string; wired: boolean; line: number }[] = []
  // A class TOKEN: bounded by whitespace or a quote, never by `-` or `_` (`rail` is not
  // `cook__timer-rail`, `subtabs` is not `subtabs__opt`).
  const tok = String.raw`(?<![\w-])${cls}(?![\w-])`
  const re = new RegExp(String.raw`className=(?:"[^"]*${tok}[^"]*"|'[^']*${tok}[^']*'|\{[^}]*['"\`][^'"\`]*${tok})`, 'g')
  for (const m of src.matchAll(re)) {
    const at = m.index ?? 0
    // Walk back to the enclosing open tag, forward to its `>`.
    const open = src.lastIndexOf('<', at)
    const close = src.indexOf('>', at)
    if (open < 0 || close < 0) continue
    const tagSrc = src.slice(open, close + 1)
    const tag = /^<([A-Za-z][A-Za-z0-9.]*)/.exec(tagSrc)?.[1] ?? '?'
    const wired = /\bref=\{/.test(tagSrc) || tag === 'Rail' || tag === 'SubTabs'
    out.push({ tag, wired, line: src.slice(0, open).split('\n').length })
  }
  return out
}

describe('hscroll rule — a side-scrolling row maps the mouse wheel', () => {
  const classes = hscrollClasses()
  const tsx = walk(SRC, /\.tsx$/).map((f) => ({ path: relative(SRC, f).split(sep).join('/'), src: readFileSync(f, 'utf8') }))

  it('found the rows (canary)', () => {
    expect(classes.has('rail'), '.rail (core.css) is the reference row').toBe(true)
    expect(classes.size).toBeGreaterThan(8)
  })

  it('every element carrying a side-scrolling row class holds the hook’s ref (or is Rail/SubTabs)', () => {
    const offenders: string[] = []
    for (const [cls, cssFile] of classes) {
      if (ALLOWED.has(cls)) continue
      for (const f of tsx) {
        for (const h of hosts(f.src, cls)) {
          if (!h.wired) offenders.push(`${f.path}:${h.line} <${h.tag} className=…${cls}…> (${cssFile})`)
        }
      }
    }
    expect(
      offenders,
      'attach useHScroll(): `const row = useHScroll<HTMLDivElement>()` + `ref={row.ref}` — or render <Rail>/<SubTabs>. A row that truly cannot take it goes in ALLOWED with the reason',
    ).toEqual([])
  })

  it('every ALLOWED class is still a side-scrolling row (a stale entry exempts the next arrival)', () => {
    const stale = [...ALLOWED.keys()].filter((c) => !classes.has(c))
    expect(stale).toEqual([])
  })
})
