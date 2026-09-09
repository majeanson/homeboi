import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readScanned } from './buildGuardScan'

// A CLASS WORN BY BOTH A <button> AND A <Link> MUST RESET THE BUTTON CHROME.
//
// Written 2026-09-09, from a defect that shipped and that no test could have caught.
// `.section-intro__more` had dressed a <Link> since it was written — display, colour,
// weight, `text-decoration: none`. Then « Revoir les cartes de première visite » wore the
// same class on a <button>, and the browser's own button styling came with it: a border,
// a grey fill, centred text, its own font. It rendered as a boxed two-line block directly
// beneath a bare text link, so the RARER of the two actions was the loud one and the
// section's help — the door people actually want — receded.
//
// Nothing was broken. Every assertion passed, the state matrix photographed the screen
// and reported it green, and its structural checks are all blind to this: a border and a
// background move no measurement. `contentTopPx` did not shift by a pixel. It was found
// by opening the PNG, which is what LEAN.md means when it says LOOK at the first screen.
//
// This is that judgement turned into a rule, so the next one is caught at build time
// instead of by whoever happens to look: if a class is worn by both element kinds, its
// CSS must say something about the box (appearance / background / border / padding).
// A class that declares NONE of those is, by construction, letting the UA dress the
// button — which is the whole bug.
//
// Deliberately NOT asserted: that the two look identical. That is a taste judgement and
// this file's neighbours already warn what happens when a grep pretends to make one.

const ROOT = join(import.meta.dirname, '..', '..')
const SRC = join(ROOT, 'src')

/** Classes worn by both kinds that are allowed to say nothing about the box — with why. */
const ALLOWED: Record<string, string> = {
  mono: 'typography utility (font-family/size/letter-spacing in core.css) — it never owns the box, and is always combined with the class that does',
}

const tsxFiles = (): string[] => {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p)
    }
  }
  walk(SRC)
  return out
}

/** Literal `className="a b"` on an opening <button> / <Link> / <a> tag. */
function classesByTag(): { button: Map<string, Set<string>>; link: Map<string, Set<string>> } {
  const button = new Map<string, Set<string>>()
  const link = new Map<string, Set<string>>()
  for (const f of tsxFiles()) {
    // Comments blanked: a class named in prose is not a call site.
    const src = readScanned(f)
    const where = relative(ROOT, f).replace(/\\/g, '/')
    for (const m of src.matchAll(/<(button|Link|a)\b([^>]*)>/gs)) {
      const cn = m[2].match(/className="([^"{]+)"/)
      if (!cn) continue
      const bag = m[1] === 'button' ? button : link
      for (const cls of cn[1].split(/\s+/).filter(Boolean)) {
        if (!bag.has(cls)) bag.set(cls, new Set())
        bag.get(cls)!.add(where)
      }
    }
  }
  return { button, link }
}

const allCss = (): string => {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.css')) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk(join(SRC, 'styles'))
  return out.join('\n')
}

/** Does any rule for `.cls` say anything about the BOX (not just colour and type)? */
function dressesTheBox(cls: string, css: string): boolean {
  const safe = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // `.cls` as a whole class token, then that rule's declarations.
  const re = new RegExp(`\\.${safe}(?![\\w-])[^{}]*\\{([^}]*)\\}`, 'g')
  let body = ''
  for (const m of css.matchAll(re)) body += `;${m[1]}`
  // `font-family` must NOT count: it is type, not chrome — that is exactly what `.mono`
  // declares, and counting it would have waved the real bug through.
  return /(?:^|;|\s)(appearance|background|border|padding)\s*:/.test(body)
}

describe('a class worn by a button and a link resets the button chrome', () => {
  const { button, link } = classesByTag()
  const shared = [...button.keys()].filter((c) => link.has(c))
  const css = allCss()

  it('the scanner found the app (canary)', () => {
    // If either bag collapses, every assertion below is trivially true.
    expect(button.size, 'no <button className="…"> found — the tag walk is broken').toBeGreaterThan(30)
    expect(link.size, 'no <Link/a className="…"> found — the tag walk is broken').toBeGreaterThan(10)
    expect(css.length, 'no CSS read').toBeGreaterThan(50_000)
  })

  it('every shared class dresses its own box, or says why it need not', () => {
    const bare = shared
      .filter((c) => !ALLOWED[c] && !dressesTheBox(c, css))
      .map(
        (c) =>
          `.${c} — worn by a <button> in ${[...button.get(c)!].slice(0, 3).join(', ')} ` +
          `and by a <Link>/<a> in ${[...link.get(c)!].slice(0, 3).join(', ')}, but its CSS never ` +
          `sets appearance/background/border/padding, so the button keeps the browser's own`,
      )
    expect(
      bare,
      'reset the chrome IN THE SHARED CLASS (not in a fork of it), or add the class to ALLOWED with the reason it owns no box',
    ).toEqual([])
  })

  it('every ALLOWED entry is still shared by both kinds', () => {
    // An exemption that no longer applies is a comment pretending to be a rule.
    const stale = Object.keys(ALLOWED).filter((c) => !shared.includes(c))
    expect(stale, 'these are exempted but no longer worn by both a button and a link — drop them').toEqual([])
  })
})
