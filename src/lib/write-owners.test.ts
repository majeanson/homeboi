import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE OWNERSHIP RULE — the anti-fork guard (sibling of write-rule.test.ts, same
// plumbing, same fail-closed shape).
//
// The recurring failure it exists for: a page hand-rolls its own copy of a shared
// mutation and the copy DRIFTS. Leftovers.tsx's header says it plainly ("lived in
// THREE hand-rolled copies … which is how they came to disagree on the
// invalidation") — and by 2026-09-03 the forks had RE-GROWN: DayPlanPage's copy
// was missing MEAL_HISTORY_KEY, Board's undo re-inserted the pool row without its
// recipe link, and both Board's delete and AddSheet's announce refreshed only one
// of the two surfaces that show the pool. Four independent drifts of one flow.
//
// Two checks per owned endpoint:
//   1. WHO may write it — the module(s) that own the flow. A new file writing an
//      owned endpoint fails the build: reuse the owner's hook, or add an entry
//      HERE with the reason a fifth spelling of the same write is correct.
//   2. WHAT every write must invalidate — the keys for every surface that shows
//      the data. A key list missing one is exactly the "stale until next poll"
//      bug class; a site that genuinely needs fewer documents why in ALLOWED.
//
// Grow this map when a review finds the next forked flow — the endpoint goes in
// WITH its owners and required keys in the same commit that converges the forks.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

interface Owned {
  // repo-relative (src-relative, /-separated) files allowed to write the endpoint,
  // each with the reason it is a sanctioned site. OPTIONAL: an endpoint with many
  // legitimate doors (meals has seven) skips the owner check and keeps only the
  // key invariant — the anti-fork half is for flows with ONE designated hook.
  owners?: Map<string, string>
  // Key IDENTIFIERS every write's affectedKeys must include (matched as tokens in
  // the affectedKeys array text) — one per surface that displays the data.
  requiredKeys: string[]
}

const OWNED: Record<string, Owned> = {
  'meal-leftovers': {
    owners: new Map([
      ['components/kitchen/Leftovers.tsx', 'THE home: usePlanLeftover + useAnnounceLeftover'],
      ['components/AddSheet.tsx', 'deliberate form-local announce (busy/error state, closes on success — see the hook header)'],
      ['pages/Board.tsx', 'markLeftoverDone: deferred-removal DELETE behind the undo toast, a board-only shape'],
    ]),
    // The pool shows on BOTH the kitchen strip (LEFTOVERS_KEY) and the board's
    // « À finir » card (BOARD_KEY); a write refreshing only one leaves the other
    // stale until its next poll — the exact 2026-09-03 drift.
    requiredKeys: ['LEFTOVERS_KEY', 'BOARD_KEY'],
  },
  // The remaining entries came out of the 2026-09-03 every-endpoint sweep: each key
  // list below was VERIFIED against the surfaces that render the data (the board
  // payload, /api/month's bands, Réglages lists), and eleven write sites were
  // missing one or more of them. Key-invariant only — these flows legitimately
  // have several doors.
  meals: {
    // Week grid + board hero/day table + Historique + the month grid all render
    // meal rows.
    requiredKeys: ['MEALS_KEY', 'BOARD_KEY', 'MEAL_HISTORY_KEY', 'MONTH_KEY'],
  },
  chores: {
    // Réglages ▸ Corvées list (live on DayPlanPage too), the board card, and the
    // month grid; completing also advances the rotation server-side.
    requiredKeys: ['CHORES_KEY', 'BOARD_KEY', 'MONTH_KEY'],
  },
  'home-projects': {
    // Réglages ▸ Projets, the board (upkeep card + season card), and the month
    // grid; done/snooze re-derive nextAt (recur_from 'done' re-anchors).
    requiredKeys: ['HOME_PROJECTS_KEY', 'BOARD_KEY', 'MONTH_KEY'],
  },
  'day-notes': {
    // The day scene AND /api/board (today's note shows on the wall).
    requiredKeys: ['DAY_NOTES_KEY', 'BOARD_KEY'],
  },
  trips: {
    // The voyage list AND /api/month (each trip is a calendar band).
    requiredKeys: ['TRIPS_KEY', 'MONTH_KEY'],
  },
}

interface Site {
  file: string
  line: number
  endpoint: string
  keysText: string | null
}

function ownedWrites(): Site[] {
  const endpoints = Object.keys(OWNED)
    .map((e) => e.replace(/[-/]/g, '\\$&'))
    .join('|')
  const re = new RegExp(`\\b(write|writeWith|api)\\s*(?:<[^>]*>)?\\s*\\(\\s*['"\`](${endpoints})['"\`]`, 'g')
  const out: Site[] = []
  for (const f of sourceFiles(srcDir)) {
    const src = readScanned(f)
    for (const m of src.matchAll(re)) {
      let after = src.slice(m.index, m.index + 600)
      // Cut the window at the NEXT api/write call so a GET is never credited with
      // the method/keys of the write that happens to follow it (the false-positive
      // class the 2026-09-03 sweep hit on household.tsx's GET-then-DELETE).
      const next = after.slice(6).search(/\b(?:write|writeWith|api)\s*(?:<[^>]*>)?\s*\(/)
      if (next >= 0) after = after.slice(0, next + 6)
      // `api()` also serves plain GET reads (lib/queryHooks.ts polls this
      // endpoint) — only a mutating method makes it a write this rule owns.
      if (m[1] === 'api' && !/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(after)) continue
      const keys = after.match(/affectedKeys:\s*(\[[^\]]*\]|\w+)/)
      out.push({
        file: relative(srcDir, f).split(sep).join('/'),
        line: src.slice(0, m.index).split('\n').length,
        endpoint: m[2],
        keysText: keys ? keys[1] : null,
      })
    }
  }
  return out
}

describe('the ownership rule (a shared mutation flow is not re-implemented beside its owner)', () => {
  const writes = ownedWrites()

  it('found owned-endpoint writes to classify (the scanner still works)', () => {
    expect(writes.length).toBeGreaterThan(3)
  })

  it('only the documented owners write an owned endpoint', () => {
    const offenders = writes
      .filter((w) => {
        const owners = OWNED[w.endpoint].owners
        return owners !== undefined && !owners.has(w.file)
      })
      .map((w) => `${w.file}:${w.line} → ${w.endpoint}`)
    expect(
      offenders,
      "reuse the owner module's hook (see OWNED for who that is) instead of re-writing the flow — or, if a new sanctioned site is a real decision, add it to OWNED with the reason",
    ).toEqual([])
  })

  it('every owner entry still writes (a stale entry exempts the next arrival)', () => {
    const live = new Set(writes.map((w) => `${w.endpoint} → ${w.file}`))
    const dead = Object.entries(OWNED).flatMap(([ep, o]) =>
      [...(o.owners?.keys() ?? [])].filter((f) => !live.has(`${ep} → ${f}`)).map((f) => `${ep} → ${f}`),
    )
    expect(dead, 'these files no longer write the endpoint — drop them from OWNED').toEqual([])
  })

  it('every write to an owned endpoint invalidates every surface that shows the data', () => {
    const offenders: string[] = []
    for (const w of writes) {
      // A named-variable key list (`affectedKeys: keys`) is resolved by hand: the
      // required tokens must at least appear somewhere in the same file.
      const scope = w.keysText && w.keysText.startsWith('[') ? w.keysText : readScanned(join(srcDir, w.file))
      for (const k of OWNED[w.endpoint].requiredKeys) {
        if (!scope.includes(k)) offenders.push(`${w.file}:${w.line} → ${w.endpoint} is missing ${k}`)
      }
    }
    expect(
      offenders,
      'every surface showing this data must be invalidated (the stale-until-next-poll drift, 2026-09-03) — add the key, or document in OWNED why this site is exempt',
    ).toEqual([])
  })
})
