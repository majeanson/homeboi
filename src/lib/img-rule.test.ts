import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE IMAGE RULE, made structural (sibling of chip-rule.test.ts — same fail-closed
// shape, same shared plumbing).
//
// `components/Img.tsx` is THE picture. A bare <img> gets exactly one shot at its
// bytes: when that shot fails — one bar of signal, iOS cancelling in-flight requests
// as the PWA backgrounds, the service worker's synthetic 504 for a dropped
// connection — the element fires `error` once and sits empty for the rest of the
// session, because nothing on the page ever changes its `src` again. And until the
// bytes arrive it has no size, so a slow load and a dead one look the same: nothing.
// The board's « Dessins » strip showed exactly that on 2026-10-30 — three « clear »
// tiles on one open, three drawings on the next — and sixty-five other <img> sites
// had the same one shot. One (FlyerViewer) had grown a private retry.
//
// Img carries the retry (backoff, then once more per reconnection / foregrounding)
// and the `data-loaded` state a surface styles a placeholder from. FAIL-CLOSED: a
// raw `<img` open tag may only appear in an ALLOWED entry below, and the entry has
// to say why the primitive cannot host that call site. Comments are blanked before
// the scan (`readScanned`), so prose about "the <img>" does not trip it.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')

// file (repo-relative, /-separated) → why a bare <img> is spelled there.
const ALLOWED = new Map<string, string>([
  ['src/components/Img.tsx', 'the primitive itself — the one <img> every other picture renders through'],
])

interface Site {
  file: string
  line: number
  text: string
}

// Every `<img` OPEN TAG — the name must end there (`<img` is not `<Img`, and a
// made-up `<imgx` is not a tag either): whitespace, a self-close or the tag's `>`.
export function rawImgTags(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = []
  for (const m of src.matchAll(/<img(?=[\s/>])/g)) {
    const at = m.index ?? 0
    out.push({ line: src.slice(0, at).split('\n').length, text: src.slice(at, at + 50).split('\n')[0] })
  }
  return out
}

function rawImgs(): Site[] {
  const out: Site[] = []
  for (const f of sourceFiles(srcDir)) {
    if (!f.endsWith('.tsx')) continue
    const file = relative(rootDir, f).split(sep).join('/')
    for (const hit of rawImgTags(readScanned(f))) out.push({ file, ...hit })
  }
  return out
}

describe('the image rule (a picture is <Img>, components/Img.tsx — never a bare <img>)', () => {
  // The canary: pinned against a fixture carrying a violation in each of its
  // spellings and the look-alikes that must not count.
  it('the detector sees a raw <img> and none of its look-alikes', () => {
    const fixture = [
      `<img src={imgUrl(k)} alt="" />`, // ← the violation (line 1)
      `<img`, // ← prettier's multi-attribute break (line 2)
      `<Img src={imgUrl(k)} alt="" />`,
      `<imgx />`,
      `const s = 'image'`,
      `<img>`, // ← a bare tag with no attributes still counts (line 6)
    ].join('\n')
    expect(rawImgTags(fixture).map((h) => h.line)).toEqual([1, 2, 6])
  })

  it('no bare <img> outside the primitive', () => {
    const offenders = rawImgs()
      .filter((s) => !ALLOWED.has(s.file))
      .map((s) => `${s.file}:${s.line} ${s.text}`)
    expect(
      offenders,
      'use <Img> (components/Img.tsx) — same props as <img>, plus retry-with-backoff, a re-ask when the device comes back online or the app returns to the front, and data-loaded for a shape-reserving placeholder. If a call site truly cannot use it, EXTEND the primitive; an ALLOWED entry has to say why hosting it is impossible',
    ).toEqual([])
  })

  it('every ALLOWED file still spells it (a stale entry exempts the next arrival)', () => {
    const live = new Set(rawImgs().map((s) => s.file))
    const dead = [...ALLOWED.keys()].filter((f) => !live.has(f))
    expect(dead, 'these files no longer spell a bare <img> — drop them from ALLOWED').toEqual([])
  })
})
