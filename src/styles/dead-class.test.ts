import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A CLASS NOTHING WEARS (solidify 5.1, 2026-11-05). Every class selector in src/styles must
// appear in some source string. CSS never throws: a retired component leaves its stylesheet
// behind, the next reader takes the rule for live and matches it, and ~150 of them had
// piled up by this date (`nownext__*`, `kitchen__slot*`, `lane__*`...).
//
// The check is deliberately generous, because a false red here trains people to ALLOW:
// a class counts as worn if its exact token appears anywhere in src/**/*.{ts,tsx} or
// index.html, or if a template string in that source builds it from a known prefix
// (`status-msg--${tone}` covers every `status-msg--*`). So a green run proves little about
// one class, and a red one is close to certain. Plant: `.zz-dead{}` in kit.css.

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..')
const root = join(src, '..')

function walk(dir: string, keep: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p, keep)
    return keep(p) ? [p] : []
  })
}

const cssFiles = walk(here, (f) => f.endsWith('.css'))
const codeFiles = walk(src, (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))

const code = [...codeFiles, join(root, 'index.html'), join(root, 'vite.config.ts')]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

// Prefixes a template literal composes: `foo--${x}`, 'foo--' + x, `foo-${x}`.
const dynamicPrefixes = [...code.matchAll(/([a-z][a-z0-9_-]*(?:--|__|-))(?:\$\{|['"`]\s*\+)/g)].map((m) => m[1])

const words = new Set(code.match(/[A-Za-z_][A-Za-z0-9_-]*/g) ?? [])

// Classes that arrive from outside the source: each says from where.
const ALLOWED: Record<string, string> = {}

function classesOf(css: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  // Only selectors: drop the declaration bodies, keep what sits before each `{`.
  const selectors = noComments.replace(/\{[^{}]*\}/g, '{}').replace(/url\([^)]*\)/g, '')
  const out = new Set<string>()
  for (const m of selectors.matchAll(/\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g)) out.add(m[1])
  return [...out]
}

function dead(): string[] {
  const found: string[] = []
  for (const f of cssFiles) {
    for (const c of classesOf(readFileSync(f, 'utf8'))) {
      if (words.has(c) || c in ALLOWED) continue
      if (dynamicPrefixes.some((p) => c.startsWith(p))) continue
      found.push(`${relative(here, f).split(sep).join('/')}: .${c}`)
    }
  }
  return found.sort()
}

describe('every CSS class is worn by something', () => {
  it('no class selector is dead', () => {
    expect(dead()).toEqual([])
  })
  it('ALLOWED holds only classes that exist in the CSS and not in the code', () => {
    const css = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n')
    const stale = Object.keys(ALLOWED).filter((c) => !css.includes(`.${c}`) || words.has(c))
    expect(stale).toEqual([])
  })
})
