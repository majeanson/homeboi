import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// AN UNCLOSED `/*` IN A STYLESHEET IS SILENT, AND IT EATS THE RULES AFTER IT.
//
// Written 2026-09-12, from a self-inflicted one. Fixing the recurrence row's overflow,
// I appended a comment explaining the fix and forgot the `*/`. The comment then
// swallowed the two rules it was introducing AND the two that already followed
// (`.recur__interval`'s width, `.recur__days`' layout). Nothing failed: the build was
// green, the page rendered, the screenshot looked plausible, and the overflow I was
// fixing stayed exactly 24px. It took measuring `getComputedStyle` in the browser to
// see that `flex-wrap` had never applied.
//
// That is the whole failure mode — a CSS comment is not a syntax error, it is a
// silencer. The scan is trivial and the class of bug is invisible without it.
const here = dirname(fileURLToPath(import.meta.url))

function cssFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...cssFiles(p))
    else if (name.endsWith('.css')) out.push(p)
  }
  return out
}

/** The line a `/*` was opened on and never closed, or null. CSS comments do NOT nest,
 *  so a `/*` seen while already inside one is ordinary text (`pages/*` is written
 *  inside a real comment in misc.css) and must not be counted as a second opener. */
function unterminatedAt(css: string): number | null {
  let line = 1
  let openedAt: number | null = null
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '\n') line++
    if (openedAt === null && css[i] === '/' && css[i + 1] === '*') {
      openedAt = line
      i++
    } else if (openedAt !== null && css[i] === '*' && css[i + 1] === '/') {
      openedAt = null
      i++
    }
  }
  return openedAt
}

describe('stylesheets: every comment is closed', () => {
  const files = cssFiles(here)

  it('is scanning the real stylesheets (canary — a scan that finds nothing proves nothing)', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((f) => f.endsWith('misc.css'))).toBe(true)
  })

  // THE STRONGER HALF, and the one that would have caught the real thing: a comment
  // that SWALLOWS A RULE. The unclosed `/*` did not leave the file unbalanced — the
  // next comment's terminator closed it — so "ends inside a comment" stayed green
  // while four rules sat inside a comment. What gives it away is the SHAPE of what got
  // eaten: a selector line ending in a brace, followed by a `prop: value;`. Measured
  // against the whole tree before being trusted: 1766 comments, 6 mention a brace in
  // prose, 0 match this. Zero false positives is what earns a grep test its place.
  it('no comment has swallowed a rule', () => {
    const RULE = /(^|\n)[ \t]*[.#&:[a-zA-Z][^\n{}]*\{[ \t]*\n[ \t]*[-a-z]+[ \t]*:[^\n;]*;/
    const offenders: string[] = []
    for (const f of files) {
      const css = readFileSync(f, 'utf8')
      for (const body of css.match(/\/\*[\s\S]*?\*\//g) ?? []) {
        if (RULE.test(body)) {
          offenders.push(`${f.slice(f.indexOf('styles'))}: a comment contains a rule — « ${body.slice(0, 60).replace(/\n/g, ' ')}… »`)
        }
      }
    }
    expect(
      offenders,
      'a forgotten */ turns the rules after it into prose: the build stays green, the page just loses styles',
    ).toEqual([])
  })

  it('no stylesheet ends inside a comment', () => {
    const offenders = files
      .map((f) => ({ f, at: unterminatedAt(readFileSync(f, 'utf8')) }))
      .filter((x) => x.at !== null)
      .map((x) => `${x.f.slice(x.f.indexOf('styles'))}: '/*' opened at line ${x.at} is never closed`)
    expect(
      offenders,
      'an unclosed comment swallows every rule after it, silently — the build stays green and the page just loses styles',
    ).toEqual([])
  })

  // The detector itself, pinned against the two shapes that fooled a first pass: a
  // `/*` written INSIDE a comment (legitimate) and a normal closed comment.
  it('the detector tells a real opener from one written inside a comment', () => {
    expect(unterminatedAt('/* after the pages/* block, so it holds */\n.a { color: red }')).toBeNull()
    expect(unterminatedAt('.a { color: red }\n/* explaining the next rule\n.b { color: blue }')).toBe(2)
    expect(unterminatedAt('/* one */ /* two */')).toBeNull()
  })
})
