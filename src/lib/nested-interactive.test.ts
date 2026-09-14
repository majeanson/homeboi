import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Two ARIA mistakes that LOOK fine and are invisible to anyone testing with a
// mouse — the same class as field-fit / keyboard-fit: the surface still renders,
// it just stops working for someone.
//
// 1. A NESTED INTERACTIVE. A `role="button"` container holding real `<button>`s
//    announces as "a button whose contents are buttons", and a keyboard user tabs
//    INTO a button from inside one. `e.stopPropagation()` on the inner handlers
//    fixes what a mouse does and hides the semantics completely, which is exactly
//    how the routines grid kept it. The fix is never to nest: either the container
//    is the control (and holds no others), or the inner controls are, and the
//    container's onClick is a plain mouse convenience with no role/tabIndex.
//
// 2. `role="img"` ON AN INTERACTIVE SVG. Per ARIA, an `img` role makes its whole
//    subtree PRESENTATIONAL — every `role="button"` inside is dropped from the
//    accessibility tree. « Notre monde », the tree and the web view each had a
//    dozen focusable, labelled nodes a screen reader could not see at all:
//    focusable but nameless, the worst of both. `role="group"` keeps the
//    accessible name and leaves the children exposed.
//
// A source grep, deliberately: an axe run in e2e only sees the states a test
// happens to open, and both defects live in views (the constellation, an empty
// routine card) that no screenshot spec visits.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sourceFiles(p)
    return /\.tsx$/.test(name) && !name.endsWith('.test.tsx') ? [p] : []
  })
}

// Comment lines are blanked before scanning so the prose above a fix — which
// necessarily quotes the thing it removed — can neither satisfy nor trip the grep.
// Same treatment calm-tenets.test.ts gives migrations.
function code(text: string): string {
  // …and the line-prefix test alone did NOT do that, which this guard found out the
  // hard way for the fourth time (2026-09-14). It blanked a line starting with `//`,
  // `*` or `/*` — but a JSX comment starts with `{`, so every `{/* … */}` block, the
  // dominant comment style inside JSX in this codebase, was scanned as code. The
  // moment a fix was documented in the file it fixed — « never `role="button"` +
  // tabIndex » — the prose tripped the grep and the walk blamed the enclosing <li>.
  // A guard that fires because you wrote down why you fixed it is a guard that
  // teaches people to stop writing things down.
  //
  // Blank whole /* … */ regions (the `{/*` form included) while PRESERVING newlines,
  // so the line numbers the walk reports still point at the real source line.
  const blanked = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return blanked
    .split('\n')
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? '' : l))
    .join('\n')
}

const files = sourceFiles(SRC).map((f) => ({ path: relative(SRC, f), text: code(readFileSync(f, 'utf8')) }))

type Src = { path: string; text: string }

// — THE HOLE THIS GUARD COULD NOT SEE, closed 2026-09-14.
//
// The body test below matches a LITERAL `<button` / `<a href` / `<Link`. A child
// COMPONENT that renders one is invisible, and that is precisely how cook mode kept a
// control inside a control through three green runs: `<IngredientLine>` renders the
// measure pills as real buttons, one file away. The first a11y census (axe over the
// state matrix) found it in minutes because axe reads the rendered DOM; a grep that
// walks one file at a time never can.
//
// So: know which COMPONENTS render a control, and treat one appearing inside a
// `role="button"` container as the same offence.
//
// Deliberately DEPTH ONE — "this component's own file renders a control" — and not a
// transitive closure. Both catch the cook-mode pair; the transitive version marked 318
// of 358 exported components interactive against 259, and a detector that suspects
// everything is the one that gets muted. The precision that matters was measured, not
// hoped for: `Icon`, `InlineIcon`, `Avatar`, `Skeleton` and `StatusMessage` all come
// out INERT, so the ordinary decorative child of a tappable container does not fire.
// `Chip`, `IngredientLine` and `MeasureScoops` come out interactive, correctly.
//
// File granularity is the known coarseness: `Sayable` reads as interactive only because
// it shares BigTiles.tsx with real buttons. Nothing puts it inside a role="button"
// today; if that ever fires, the fix is to split the file, not to widen the filter.
const RENDERS_CONTROL = /<button\b|<a\s+href|<Link\b|role="button"|<input\b|<select\b|<textarea\b|tabIndex=\{0\}/

function interactiveComponents(srcs: Src[]): Set<string> {
  const out = new Set<string>()
  for (const f of srcs) {
    if (!RENDERS_CONTROL.test(f.text)) continue
    for (const m of f.text.matchAll(/export\s+(?:default\s+)?function\s+([A-Z]\w*)/g)) out.add(m[1])
    for (const m of f.text.matchAll(/export\s+const\s+([A-Z]\w*)\s*[:=]/g)) out.add(m[1])
  }
  return out
}

/** Every `role="button"` container, with the slice of source it encloses. */
function roleButtonContainers(srcs: Src[]): { path: string; line: number; tag: string; body: string }[] {
  const found: { path: string; line: number; tag: string; body: string }[] = []
  for (const f of srcs) {
    const lines = f.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (!/\brole="button"/.test(lines[i])) continue
      let start = i
      while (start > 0 && !/^\s*<[A-Za-z]/.test(lines[start])) start--
      const tag = /^\s*<([A-Za-z][\w.]*)/.exec(lines[start])?.[1]
      if (!tag) continue
      let depth = 0
      let end = -1
      for (let j = start; j < lines.length; j++) {
        const opens = (lines[j].match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length
        const closes = (lines[j].match(new RegExp(`</${tag}>`, 'g')) ?? []).length
        const selfClosed = opens > 0 && /^\s*<[A-Za-z][^>]*\/>\s*$/.test(lines[j]) ? 1 : 0
        depth += opens - closes - selfClosed
        if (j > start && depth <= 0) {
          end = j
          break
        }
      }
      if (end < 0) continue
      found.push({ path: f.path, line: start + 1, tag, body: lines.slice(start, end + 1).join('\n') })
    }
  }
  return found
}

function nestedComponentOffenders(srcs: Src[]): string[] {
  const interactive = interactiveComponents(srcs)
  const out: string[] = []
  for (const c of roleButtonContainers(srcs)) {
    // The literal case is the `it` below; this one is about the child COMPONENT.
    if (/<button\b/.test(c.body) || /<a\s+href/.test(c.body) || /<Link\b/.test(c.body)) continue
    const kids = [...new Set([...c.body.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]))].filter((k) => interactive.has(k))
    if (kids.length) out.push(`${c.path}:${c.line} — role="button" <${c.tag}> contains <${kids.join('>, <')}>, which renders a control`)
  }
  return out
}

describe('nested interactives', () => {
  it('found the sources', () => {
    // A canary: a broken walker must fail loudly rather than pass vacuously.
    expect(files.length).toBeGreaterThan(150)
    expect(files.some((f) => f.text.includes('role="button"'))).toBe(true)
  })

  it('no element carrying role="button" also contains a real <button> or <a href>', () => {
    const offenders: string[] = []
    for (const f of files) {
      const lines = f.text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!/\brole="button"/.test(lines[i])) continue
        // Walk back to the element's opening tag (prettier puts one attribute per
        // line, so `role=` always sits inside a multi-line open tag).
        let start = i
        while (start > 0 && !/^\s*<[A-Za-z]/.test(lines[start])) start--
        const tag = /^\s*<([A-Za-z][\w.]*)/.exec(lines[start])?.[1]
        if (!tag) continue
        // Then forward by TAG DEPTH, not by indentation. The indentation walk this
        // started as reported GREEN over the very defect it was written for — worth
        // remembering that a guard which passes from the start proves nothing, and
        // is worth re-checking against the bug before being trusted.
        let depth = 0
        let end = -1
        for (let j = start; j < lines.length; j++) {
          // `\b`, not a lookahead for whitespace: prettier breaks a multi-attribute
          // open tag right after the tag name, so `<div` is the WHOLE line and a
          // lookahead finds nothing after it. That miscount made the walk end on the
          // element's own opening line and skip every subtree — the reason this
          // guard first reported green over the defect it was written for.
          const opens = (lines[j].match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length
          const closes = (lines[j].match(new RegExp(`</${tag}>`, 'g')) ?? []).length
          // A one-line self-closing element opens and closes on the same line.
          const selfClosed = opens > 0 && /^\s*<[A-Za-z][^>]*\/>\s*$/.test(lines[j]) ? 1 : 0
          depth += opens - closes - selfClosed
          if (j > start && depth <= 0) {
            end = j
            break
          }
        }
        if (end < 0) continue
        const body = lines.slice(start, end + 1).join('\n')
        if (/<button\b/.test(body) || /<a\s+href/.test(body) || /<Link\b/.test(body)) {
          offenders.push(`${f.path}:${start + 1} — role="button" <${tag}> contains a real control`)
        }
      }
    }
    expect(
      offenders,
      'A control inside a control: make the container a plain div whose onClick is mouse-only, and let the inner buttons carry the keyboard and the a11y tree.',
    ).toEqual([])
  })

  // The same offence one component away — the shape that survived three green runs.
  it('no element carrying role="button" contains a COMPONENT that renders a control', () => {
    expect(
      nestedComponentOffenders(files),
      'A control inside a control, arriving from a child component: the container is either THE control (and holds no others) or it is a plain div whose onClick is mouse-only. Cook mode is the worked example — see CookMode.tsx.',
    ).toEqual([])
  })

  // …and the detector pinned against its own near-misses, the way chip-rule.test.ts
  // pins its own. A guard this broad is only worth having if it stays quiet on the
  // ordinary case: a tappable container wrapping an ICON is the commonest markup in
  // this app, and it must never fire.
  it('the component detector fires on a real control and stays quiet on an icon', () => {
    const iconFile = { path: 'Icon.tsx', text: 'export function Icon() {\n  return <svg><path /></svg>\n}\n' }
    const pillFile = { path: 'Pill.tsx', text: 'export function Pill() {\n  return <button type="button">x</button>\n}\n' }
    const container = (child: string) => ({
      path: 'Host.tsx',
      text: ['export function Host() {', '  return (', '    <span', '      role="button"', '      tabIndex={0}', '    >', `      <${child} />`, '    </span>', '  )', '}'].join('\n'),
    })

    // The ordinary, correct markup: quiet.
    expect(nestedComponentOffenders([iconFile, pillFile, container('Icon')])).toEqual([])
    // The cook-mode shape: named, with the component that gives it away.
    const hit = nestedComponentOffenders([iconFile, pillFile, container('Pill')])
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain('<Pill>')
    // And a plain container holding the same component is fine — the role is the defect.
    expect(nestedComponentOffenders([iconFile, pillFile, { path: 'Ok.tsx', text: '<span onClick={x}>\n  <Pill />\n</span>' }])).toEqual([])
  })

  it('no interactive <svg> declares role="img"', () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const chunk of f.text.split(/(?=<svg\b)/).slice(1)) {
        const close = chunk.indexOf('</svg>')
        const svg = close < 0 ? chunk : chunk.slice(0, close + 1)
        const openTag = svg.slice(0, svg.indexOf('>') + 1)
        if (!/role="img"/.test(openTag)) continue
        if (/role="button"|tabIndex=\{0\}/.test(svg)) {
          offenders.push(`${f.path} — <svg role="img"> with focusable descendants`)
        }
      }
    }
    expect(
      offenders,
      'role="img" makes the whole subtree presentational — its interactive children vanish from the accessibility tree. Use role="group" (the aria-label still names it).',
    ).toEqual([])
  })
})
