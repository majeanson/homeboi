import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readScanned, sourceFiles } from './buildGuardScan'

// THE FETCH RULE (solidify plan, wave 6.6 — CLAUDE.md « Any /api/* read/fetch → api() »).
//
// `lib/api.ts` is the ONLY door to /api/*. It attaches the CSRF echo, the kiosk's
// device token, the locale (X-Lang), the acting profile (X-Profile) and credentials,
// and it reads X-AI-Error into the toast. A bare `fetch('/api/…')` loses whichever of
// those the next reader forgets, and the failure is silent: a 403 on a kiosk only, a
// write attributed to nobody, an AI outage nobody sees.
//
// Every bare fetch( in src/ on 2026-11-16 was legitimate, so this guard is preventive:
//   · `fetch(imgUrl(…))` is allowed by SHAPE — /api/img/<key> is unauthenticated BY
//     DESIGN (functions/api/img/[key].ts: the key is the capability), it is a blob read,
//     not JSON, and api() would parse it.
//   · anything else names its file in ALLOWED with the reason api() is wrong there.
// FAIL-CLOSED, and an ALLOWED entry whose fetch( is gone fails too (a stale exception
// is an open door nobody is watching).

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')

const ALLOWED = new Map<string, string>([
  ['src/lib/api.ts', 'the door itself — every other /api/* call goes through it'],
  [
    'src/lib/cacheWarm.ts',
    'warms the SERVICE WORKER cache-first store with image URLs (/api/img, /api/flyer-img): ' +
      'it must be a plain request the SW sees, and api() would try to parse the bytes as JSON',
  ],
  [
    'src/components/DrawPad.tsx',
    'reads a drawing’s scene JSON by URL — every caller passes imgUrl(sceneKey) ' +
      '(NoteEditor), an unauthenticated R2 blob; the URL arrives as a prop, so the shape rule cannot see it',
  ],
  [
    'src/lib/flippList.ts',
    'the fetch( calls live INSIDE the bookmarklet’s source string, which runs on flipp.com ' +
      'against Flipp’s own API — never ours',
  ],
])

interface Site {
  file: string
  line: number
  text: string
}

// Every call to the GLOBAL fetch: bare, or through window/globalThis/self. A method
// named fetch on something else (`env.ASSETS.fetch(`, `qc.fetchQuery(`) is not it.
export function fetchCalls(src: string): { line: number; text: string; viaImgUrl: boolean }[] {
  const out: { line: number; text: string; viaImgUrl: boolean }[] = []
  for (const m of src.matchAll(/(?:(?:window|globalThis|self)\.|(?<![\w$.]))fetch\s*\(/g)) {
    const at = m.index ?? 0
    const after = src.slice(at + m[0].length).trimStart()
    out.push({
      line: src.slice(0, at).split('\n').length,
      text: src.slice(at, at + 60).split('\n')[0]!,
      viaImgUrl: after.startsWith('imgUrl('),
    })
  }
  return out
}

function sites(): Site[] {
  const out: Site[] = []
  for (const f of sourceFiles(srcDir)) {
    const file = relative(rootDir, f).split(sep).join('/')
    for (const hit of fetchCalls(readScanned(f))) if (!hit.viaImgUrl) out.push({ file, line: hit.line, text: hit.text })
  }
  return out
}

describe('the fetch rule (an /api/* call goes through lib/api.ts — never a bare fetch)', () => {
  it('the detector sees every spelling of the global fetch and none of its look-alikes', () => {
    const fixture = [
      `const r = await fetch('/api/list')`, // ← line 1
      `window.fetch('/api/x')`, // ← line 2
      `globalThis.fetch(u)`, // ← line 3
      `env.ASSETS.fetch(req)`,
      `qc.fetchQuery({ queryKey })`,
      `prefetch(x)`,
      `fetch (url)`, // ← line 7
    ].join('\n')
    expect(fetchCalls(fixture).map((h) => h.line)).toEqual([1, 2, 3, 7])
    expect(fetchCalls(`await fetch(imgUrl(key))`)[0]!.viaImgUrl).toBe(true)
    expect(fetchCalls(`await fetch(\`/api/img/\${key}\`)`)[0]!.viaImgUrl).toBe(false)
  })

  it('no bare fetch( outside lib/api.ts, except an imgUrl blob read or an ALLOWED file', () => {
    const offenders = sites()
      .filter((s) => !ALLOWED.has(s.file))
      .map((s) => `${s.file}:${s.line} ${s.text}`)
    expect(
      offenders,
      'A bare fetch() skips lib/api.ts — CSRF, the device token, X-Lang, X-Profile and the AI-error ' +
        'toast. Use api() (reads) or useWrite() (writes). A blob read takes fetch(imgUrl(key)). If ' +
        'api() is genuinely wrong here, add the file to ALLOWED with the reason.',
    ).toEqual([])
  })

  it('every ALLOWED file still calls fetch (a stale exception is an unwatched door)', () => {
    for (const [file, why] of ALLOWED) {
      expect(why.length, `${file}: the reason is the point`).toBeGreaterThan(20)
      // flippList's calls are inside a string literal: read it raw, not comment-blanked.
      expect(/fetch\s*\(/.test(readFileSync(join(rootDir, file), 'utf8')), `${file} no longer calls fetch — drop it from ALLOWED`).toBe(true)
    }
  })
})
