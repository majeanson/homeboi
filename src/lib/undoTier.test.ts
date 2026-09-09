import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// ONE MECHANISM PER ACT — a held delete is held ONE way in this app.
//
// Until 2026-09-09 two hooks felt identical and were not. `useDeferredRemoval` holds a
// pending set and un-hides only once a genuinely FRESH frame proves the write landed;
// `useUndoableRemove` spliced the row out of the QUERY CACHE optimistically. On a polled
// key the second is a bug waiting: the next poll refills the cache and the row flashes
// back mid-undo — the resurrection class this repo has already fixed twice (STATE.md
// C-quater / C-sexies). Two of its five sites sat on `HOME_PROJECTS_KEY`, which the
// board polls. The fold removed the choice; `lib/undoRemove.ts` is gone.
//
// TWO RULES I HAD TO NARROW, because the first draft was confidently wrong — the exact
// failure this file exists to prevent, reproduced in the guard for it:
//
//  · "an undo toast + a setQueryData in one file" flagged three innocents. Every one of
//    them uses `useWrite`'s SANCTIONED `optimistic` callback (renaming a reserve item,
//    reordering a gallery) — an optimistic EDIT, which is not a removal at all. A file
//    doing two legitimate things is not the banned shape.
//  · "every deferred-removal key is exported from lib/queryKeys.ts" flagged four more.
//    CLAUDE.md's actual rule is that CROSS-PAGE keys live there and PAGE-LOCAL keys sit
//    beside their code (`PANTRY_KEY`, `RESERVE_KEY`…). The check now accepts any key the
//    app really exports, which is what "a real scope" means.

const SRC = join(__dirname, '..')

const files = sourceFiles(SRC).map((f) => ({
  path: relative(SRC, f).split(sep).join('/'),
  raw: blankComments(readFileSync(f, 'utf8')),
}))

// Files allowed to call the undo toast's raw hook. Everything else that wants to hold a
// DELETE goes through useDeferredRemoval; these hold something else, and say what.
const RAW_TOAST_ALLOWED: Record<string, string> = {
  'lib/useDeferredRemoval.ts': 'the mechanism itself',
  'lib/householdListSetting.ts': 'a settings LIST edit (add/rename a location) — compensating undo, no row hidden',
  'components/board/MonthView.tsx': 'moving a meal to another day — an undoable MOVE, nothing is removed',
  'components/kitchen/ReserveSection.tsx': 'the reserve edit + its own removal already rides useDeferredRemoval',
  'components/operator/shopping.tsx': 'store/aisle list edits — compensating undo',
  'pages/Board.tsx': 'the board’s own composite undos (layout, card moves)',
  'pages/QuickAddPage.tsx': 'the ⚡ add chips — a compensating undo on a CREATE',
}

describe('undo tier — one mechanism per act', () => {
  it('the scan found the app (canary)', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some((f) => f.path === 'lib/useDeferredRemoval.ts'), 'the hook itself was not scanned').toBe(true)
  })

  it('the retired mechanism is gone and stays gone', () => {
    const refs = files
      .filter((f) => /useUndoableRemove\s*\(|from '.*undoRemove'/.test(f.raw))
      .map((f) => f.path)
    expect(refs, 'lib/undoRemove.ts was folded into useDeferredRemoval on 2026-09-09').toEqual([])
  })

  it('only the listed files reach for the raw undo toast', () => {
    // A held DELETE belongs to useDeferredRemoval. The raw hook is for the other undo
    // tier — compensating (a move, an edit, a create) — and each such site says so.
    const raw = files
      .filter((f) => /useUndoToast\s*\(/.test(f.raw))
      .map((f) => f.path)
      .filter((p) => !(p in RAW_TOAST_ALLOWED))
    expect(
      raw,
      'to hold a delete use useDeferredRemoval (it waits for a fresh frame before un-hiding); ' +
        'for a compensating undo, add the file to RAW_TOAST_ALLOWED with what it undoes',
    ).toEqual([])
  })

  it('every RAW_TOAST_ALLOWED entry still exists and still calls it', () => {
    const byPath = new Map(files.map((f) => [f.path, f.raw]))
    const stale = Object.keys(RAW_TOAST_ALLOWED).filter((p) => !byPath.has(p) || !/useUndoToast\s*\(/.test(byPath.get(p)!))
    expect(stale, 'an exemption that no longer applies hides nothing and misleads the next reader').toEqual([])
  })

  it('every deferred-removal scope is a key the app really exports', () => {
    // `scopeOf` buckets by the key's head, so a typo'd key silently gets a private scope
    // and the row then hides on no other surface. Cross-page keys live in lib/queryKeys;
    // page-local ones sit beside their code — both are real.
    const exported = new Set(
      files.flatMap((f) => [...f.raw.matchAll(/export const ([A-Z][A-Z0-9_]*_KEY)\b/g)].map((m) => m[1])),
    )
    expect(exported.size, 'no *_KEY constants found — the scan broke').toBeGreaterThan(20)
    const bad: string[] = []
    for (const f of files) {
      for (const m of f.raw.matchAll(/useDeferredRemoval\(([A-Za-z_][A-Za-z0-9_]*)\)/g)) {
        if (/_KEY$/.test(m[1]) && !exported.has(m[1])) bad.push(`${f.path}: useDeferredRemoval(${m[1]})`)
      }
    }
    expect(bad, 'that key is exported nowhere — a private scope hides the row on no other surface').toEqual([])
  })
})
