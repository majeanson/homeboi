import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blankComments, sourceFiles } from './buildGuardScan'

// FOUR SMALL STRUCTURE RULES (solidify 6.6, 2026-11-05). Each protects a seam CLAUDE.md
// already names in prose. All four scan the same files, so they share one walk. Every
// ALLOWED entry says why, and a stale entry fails. Plants: the same query-key head in a
// second file · a `fetch(` in a component · `window.innerWidth` in a component · a button
// whose whole content is an emoji.

const src = join(__dirname, '..')
const files = sourceFiles(src)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ rel: relative(src, f).split(sep).join('/'), text: blankComments(readFileSync(f, 'utf8')) }))

const stale = (allowed: Record<string, string>, hit: (rel: string) => boolean) =>
  Object.keys(allowed).filter((rel) => !hit(rel))

describe('one key, one spelling', () => {
  it('a query-key head appears in one file', () => {
    const heads = new Map<string, Set<string>>()
    for (const { rel, text } of files) {
      for (const m of text.matchAll(/queryKey:\s*\[\s*'([^']+)'/g)) {
        heads.set(m[1]!, (heads.get(m[1]!) ?? new Set()).add(rel))
      }
    }
    const twice = [...heads].filter(([, f]) => f.size > 1).map(([k, f]) => `${k}: ${[...f].join(', ')}`)
    expect(twice, 'a key spelled twice drifts into two caches: add it to lib/queryKeys.ts').toEqual([])
  })
})

describe('api() is the only way to /api', () => {
  const ALLOWED: Record<string, string> = {
    'lib/api.ts': 'it IS the seam',
    'components/DrawPad.tsx': 'reads a public R2 blob by opaque key',
    'lib/cacheWarm.ts': 'warms the SW cache for public blobs',
    'lib/drawingGallery.ts': 'reads public R2 blobs by opaque key',
    'lib/ficheMerge.ts': 'reads a public R2 blob by opaque key',
    'lib/photoGallery.ts': 'reads a public R2 blob by opaque key',
    'lib/recipeToRoutine.ts': 'reads a public R2 blob by opaque key',
    'lib/shareImport.ts': 'reads a public R2 blob by opaque key',
    'lib/flippList.ts': 'bookmarklet source that runs on flipp.com, not here',
  }
  const hits = files.filter(({ text }) => /(^|[^.\w])fetch\(/m.test(text)).map((f) => f.rel)
  it('no other file calls fetch', () => {
    expect(hits.filter((rel) => !(rel in ALLOWED))).toEqual([])
  })
  it('ALLOWED has no stale entry', () => {
    expect(stale(ALLOWED, (rel) => hits.includes(rel))).toEqual([])
  })
})

describe('layout decisions go through surface and CSS', () => {
  const ALLOWED: Record<string, string> = {
    'lib/viewportVars.ts': 'it IS the seam',
    'components/GlossaryTerm.tsx': 'positions a popover inside the viewport',
    'components/RemarkComposer.tsx': 'positions a popover inside the viewport',
    'components/tour/TourOverlay.tsx': 'positions a coachmark inside the viewport',
    'pages/CastPage.tsx': 'scales the frame to the TV',
    'components/operator/micTest.tsx': 'reads display-mode to explain a mic permission',
    'lib/useVoiceInput.ts': 'reads display-mode to pick a mic path',
    'lib/curatedBoard.ts': 'the trial board width, the one lens decided by width on purpose',
    'lib/motion.ts': 'prefers-reduced-motion, not a layout',
    'lib/theme.ts': 'prefers-color-scheme, not a layout',
  }
  const hits = files.filter(({ text }) => /\binnerWidth\b|\bmatchMedia\(/.test(text)).map((f) => f.rel)
  it('no other file reads the width', () => {
    expect(hits.filter((rel) => !(rel in ALLOWED))).toEqual([])
  })
  it('ALLOWED has no stale entry', () => {
    expect(stale(ALLOWED, (rel) => hits.includes(rel))).toEqual([])
  })
})

describe('a control glyph is an Icon', () => {
  // Toddler tiles use emoji on purpose, always beside a label or a sound. A button whose
  // whole content is an emoji has no name for a screen reader, and today there are none.
  it('no button holds only an emoji', () => {
    const emoji = /<button\b[^>]*>\s*\p{Extended_Pictographic}️?\s*<\/button>/gu
    const n = files.reduce((sum, { text }) => sum + (text.match(emoji) ?? []).length, 0)
    expect(n).toBe(0)
  })
})
