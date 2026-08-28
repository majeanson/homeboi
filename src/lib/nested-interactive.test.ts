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
  return text
    .split('\n')
    .map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l))
    .join('\n')
}

const files = sourceFiles(SRC).map((f) => ({ path: relative(SRC, f), text: code(readFileSync(f, 'utf8')) }))

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
