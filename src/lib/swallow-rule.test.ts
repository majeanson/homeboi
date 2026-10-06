import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// THREE RULES that keep « I swipe it and it comes back » from growing back (2026-10-06).
//
// That bug was a write whose failure nobody heard about: the server answered a vacuous
// « ok », and ~100 call sites wrote `.catch(() => {})` on their writes, so a REAL server
// refusal reverted the optimistic row on the next refetch with not a word said. The fix
// is structural, and this file holds it:
//
//  1. No anonymous swallow. A write's rejection goes to `writeFailed` (one calm notice),
//     `wrote()` / `writeOrNull()` when a follow-up depends on the outcome. A bare
//     `.catch(() => {})` / `() => null` is allowed only where it is NOT a server write,
//     and the list below says why — it may fall, never rise.
//  2. A deferred-removal commit must PROPAGATE. useDeferredRemoval reads a rejected commit
//     as « the delete did not happen → show the row again » and a resolved one as « it
//     landed → keep it hidden »; a `.catch` inside `.remove(...)` made every failed delete
//     look like a success.
//  3. Optimistic `tmp-…` rows exist in exactly two resources (the list and todos), and
//     both DELETE handlers heal a stale id (functions/_lib/staleDelete.ts, covered by
//     worker/listDoors.d1.test.ts). A NEW create site that mints a tmp id needs the same
//     healing delete on its own endpoint before it joins the set.

const SRC = join(__dirname, '..')

function sources(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name))
        out.push({ rel: relative(join(SRC, '..'), p).split('\\').join('/'), text: readFileSync(p, 'utf8') })
    }
  }
  walk(SRC)
  return out
}

// What a swallow looks like, in any of its spellings.
const SWALLOW = /\.catch\(\(\w*\)\s*=>\s*(\{\s*\}|undefined|null|void 0)\)/g
const codeOnly = (text: string) =>
  text
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')

// A swallow whose BODY holds a comment — `.catch(() => { /* why it is safe */ })` — is a
// documented one, and is exactly the « good reason » case: the reason sits on the line that
// needs it. Only an EMPTY body is anonymous. Comment lines that merely MENTION `.catch(` are
// dropped so prose about the rule never counts as a violation of it.
const swallowScan = (text: string) =>
  text
    .split('\n')
    .filter((l) => !(/^\s*(\/\/|\*|\/\*)/.test(l) && l.includes('.catch(')))
    .join('\n')

// file → how many anonymous swallows it may keep, and WHY none of them is a server write.
const ALLOWED: Record<string, { max: number; why: string }> = {
  'src/components/DrawPad.tsx': { max: 1, why: 'navigator.share() — the user dismissing the share sheet rejects; not a write' },
  'src/components/FlyerViewer.tsx': { max: 1, why: 'a flyer PREFETCH read; best-effort by design (its comment says so)' },
  'src/components/board/MonthView.tsx': { max: 1, why: 'refetchQueries — Query keeps its own error state, a rejection adds nothing' },
  'src/components/board/PhotoFrame.tsx': { max: 1, why: 'keep-to-gallery is local IndexedDB, not the server' },
  'src/components/cercle/NoteEditor.tsx': { max: 1, why: 'deletes an ORPHANED upload blob on cancel — nothing the user asked for can fail' },
  'src/components/operator/shopping.tsx': { max: 1, why: 'a READ (the household postal prefill)' },
  'src/lib/cacheWarm.ts': { max: 1, why: 'warming the HTTP cache with fetch(); best-effort' },
  'src/lib/cookTimers.ts': { max: 1, why: 'Web Audio resume(); autoplay policy may refuse, harmlessly' },
  'src/lib/drawingGallery.ts': { max: 3, why: 'the gallery is local IndexedDB, not the server' },
  'src/lib/install.ts': { max: 1, why: 'the PWA install prompt; the user dismissing it rejects' },
  'src/lib/ocr.ts': { max: 1, why: 'terminating a tesseract worker; best-effort cleanup' },
  'src/lib/personSheet.ts': { max: 1, why: 'a READ with a cached fallback' },
  'src/lib/photoGallery.ts': { max: 1, why: 'the gallery is local IndexedDB, not the server' },
  'src/lib/tour.tsx': { max: 2, why: 'a tour chunk that cannot load (offline / stale deploy) is a tour that does not start' },
  'src/lib/useDeferredRemoval.ts': { max: 2, why: 'a REFETCH after the write; freshness is fenced by unhideWhenFresh instead' },
  'src/lib/useWakeLock.ts': { max: 2, why: 'the Wake Lock API may be refused or already released' },
  'src/main.tsx': { max: 2, why: 'navigator.storage.persist() and the first-paint snapshot restore; both best-effort' },
  'src/pages/DrawingGalleryPage.tsx': { max: 3, why: 'the gallery is local IndexedDB, not the server' },
  'src/pages/HandoffPage.tsx': { max: 1, why: 'clipboard.writeText(); the browser may refuse' },
}

describe('no anonymous swallow on a write', () => {
  const found = sources()
    .map(({ rel, text }) => ({ rel, n: (swallowScan(text).match(SWALLOW) ?? []).length }))
    .filter((f) => f.n > 0)

  it('every remaining swallow is on the allowlist, with its reason', () => {
    const stray = found.filter((f) => !ALLOWED[f.rel]).map((f) => `${f.rel} (${f.n})`)
    expect(
      stray,
      'A bare .catch(() => {}) swallows a server refusal and the optimistic row snaps back unexplained. ' +
        'Use .catch(writeFailed) — or wrote() / writeOrNull() from lib/write when a follow-up depends on it. ' +
        'If it truly is not a write, add the file to ALLOWED with the reason.',
    ).toEqual([])
  })

  it('no file keeps more swallows than it was allowed (a ratchet: lower it, never raise it)', () => {
    const over = found.filter((f) => ALLOWED[f.rel] && f.n > ALLOWED[f.rel].max).map((f) => `${f.rel}: ${f.n} > ${ALLOWED[f.rel].max}`)
    expect(over).toEqual([])
  })

  it('the allowlist has no dead entries', () => {
    const live = new Set(found.map((f) => f.rel))
    expect(Object.keys(ALLOWED).filter((f) => !live.has(f))).toEqual([])
  })
})

describe('a deferred-removal commit propagates its rejection', () => {
  it('no `.catch` inside any `<x>Removal.remove(...)` call', () => {
    const bad: string[] = []
    for (const { rel, text } of sources()) {
      if (!text.includes('useDeferredRemoval') && !text.includes('useChoreRemovals')) continue
      const re = /\b\w*[Rr]emoval\w*\.remove\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        let i = m.index + m[0].length
        let depth = 1
        while (i < text.length && depth > 0) {
          if (text[i] === '(') depth++
          else if (text[i] === ')') depth--
          i++
        }
        const call = codeOnly(text.slice(m.index, i))
        if (/\.catch\(/.test(call)) bad.push(`${rel}:${text.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(
      bad,
      'useDeferredRemoval reads a REJECTED commit as « the delete did not happen » (show the row again) and a resolved one ' +
        'as « it landed ». A .catch inside the commit made every failed delete look like a success.',
    ).toEqual([])
  })
})

describe('optimistic tmp ids live only where the server heals them', () => {
  // Each entry is a create door for a resource whose DELETE goes through deleteHealing.
  const DOORS: Record<string, string> = {
    'src/components/AddSheet.tsx': 'list',
    'src/pages/Liste.tsx': 'list',
    'src/pages/QuickAddPage.tsx': 'list',
    'src/components/todos/TodoSection.tsx': 'todos',
  }
  it('mintTmpId() is called only from the known doors', () => {
    const callers = sources()
      .filter(({ rel, text }) => rel !== 'src/lib/tmpIds.ts' && /\bmintTmpId\(\)/.test(codeOnly(text)))
      .map((s) => s.rel)
      .sort()
    expect(
      callers,
      'A new optimistic-row create site needs its resource’s DELETE to heal a stale id ' +
        '(functions/_lib/staleDelete.ts + a case in worker/listDoors.d1.test.ts) before it is added here.',
    ).toEqual(Object.keys(DOORS).sort())
  })
})
