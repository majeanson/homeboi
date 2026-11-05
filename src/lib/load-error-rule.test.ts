import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// A SURFACE THAT WAITS MUST ALSO KNOW HOW TO FAIL (2026-11-05, solidify plan 1.6).
//
// `if (!data) return <Loading />` is the honest line on a cold load and a LIE once the
// fetch has errored with nothing cached: the spinner is not spinning, nothing will
// retry it, and the reader waits on a wall tablet for a server that already said no.
// Sixteen scenes wrote exactly that line; La liste and La cuisine wrote the other
// shape — `if (!data && !error) return <Skeleton/>` — and then rendered the EMPTY
// surface on error, which is worse: a list with no rows hides real data behind a
// calm face. `components/LoadError.tsx` has existed since 2026-08-27 for this, with
// its own rule written in its header; the rule was prose, and prose drifted.
//
// The seam is `loadStateOf(q)` / `<LoadState q>` in components/Fallback.tsx — ONE
// decision: data → render; no data + error → LoadError with a retry; no data → the
// shape-aware wait. This guard makes reaching for it structural: a file that renders
// <Loading> or <Skeleton> either also reaches for LoadError (directly or through the
// seam), or it is listed here with the reason its wait cannot fail.
//
// Planted red before it shipped: `loadStateOf(cercleQ)` reverted to `<Loading />` in
// CercleFormPage.tsx → the file named here.

const SRC = join(__dirname, '..')

const ALLOWED = new Map<string, string>([
  ['components/Fallback.tsx', 'defines Loading and the seam itself'],
  ['components/FlippPager.tsx', 'the veil over an <iframe> that is NAVIGATING — local state, not a query; the frame’s own error page is the failure face'],
  ['pages/Board.tsx', 'the board’s cold skeleton sits under `board__synced`, which already names a failed read at the top (isBoardStale); a second LoadError beneath it would be the double alarm LoadError.tsx refuses'],
  ['pages/JoinHouseholdPage.tsx', 'handles isError itself with a page-specific message (an invite token can be invalid, which is not « the network did not answer »)'],
  ['pages/DevKit.tsx', 'the gallery renders every face on purpose'],
  ['router.tsx', 'Suspense fallbacks for lazy chunks — a chunk that fails to load is the SW/offline shell’s problem, not a query’s'],
  // The 2.1 sweep (2026-11-05): the hand-rolled « Chargement… » lines became <Loading>;
  // these waits are not a query’s, and each says what its failure face is instead.
  ['components/board/SimpleBoard.tsx', 'renders the board’s own frame (`data` is a prop); Board’s stale strip names a failed read'],
  ['components/board/ToddlerBoard.tsx', 'same as SimpleBoard — a lens over Board’s data, under its strip'],
  ['components/DealsBrowser.tsx', 'a state machine (start · loading · ok · empty · noPostal · error) with its own `error` arm'],
  ['components/FlyerViewer.tsx', 'a state machine whose `error` arm renders the empty state with the flyer’s own words'],
  ['components/operator/aisles.tsx', 'a local order seeded by a read whose .catch falls back to the default order — the wait cannot hang'],
  ['components/operator/meals.tsx', 'same shape as aisles: a failed read seeds the default slot order'],
  ['components/operator/HouseholdListSection.tsx', 'lib/householdListSetting seeds the defaults on a failed read — the wait cannot hang'],
  ['pages/FamilyWindowPage.tsx', 'a guest-link scene: a failed read is <GuestExpired>, which says the one thing a guest can do'],
  ['pages/HandoffPage.tsx', 'guest-link scene, same as FamilyWindowPage'],
  ['pages/WelcomePage.tsx', 'guest-link scene, same as FamilyWindowPage'],
  ['pages/Operator.tsx', 'the auth gate (`loading || !canEnter`) — a session check, not a household read'],
  ['pages/SharePage.tsx', 'waits on the share-target payload being parsed, not on a fetch'],
])

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({
    path: relative(SRC, f).split(sep).join('/'),
    raw: blankComments(readFileSync(f, 'utf8')),
  }))

const rendersWait = (raw: string) => /<(Loading|Skeleton)\b/.test(raw)
const knowsFailure = (raw: string) => /loadStateOf\s*\(|<LoadState\b|<LoadError\b/.test(raw)

describe('load-error rule — a wait that can fail says so', () => {
  it('the scan found the app (canary)', () => {
    // Twelve on the day the sweep landed — the other twenty-two moved onto the seam and
    // no longer spell <Loading> at all, which is the point.
    expect(files.filter((f) => rendersWait(f.raw)).length).toBeGreaterThan(8)
  })

  it('every file that renders <Loading>/<Skeleton> can also render LoadError, or says why not', () => {
    const offenders = files.filter((f) => rendersWait(f.raw) && !knowsFailure(f.raw) && !ALLOWED.has(f.path)).map((f) => f.path)
    expect(
      offenders,
      'reach for loadStateOf(q) / <LoadState q> (components/Fallback.tsx): no data + error → LoadError with a retry, no data → the wait. ' +
        'If the wait truly cannot fail (not a query), add the file to ALLOWED with that reason',
    ).toEqual([])
  })

  it('every ALLOWED entry still renders a wait (a stale entry exempts the next arrival)', () => {
    const byPath = new Map(files.map((f) => [f.path, f.raw]))
    const stale = [...ALLOWED.keys()].filter((p) => !byPath.has(p) || !rendersWait(byPath.get(p)!))
    expect(stale, 'these files no longer need the exemption — drop them').toEqual([])
  })
})
