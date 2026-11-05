import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// A STATUS LINE IS A StatusMessage (solidify 2.3, 2026-11-05). Nine surfaces spelled
// `<p className="…" role="status">` by hand — each with its own icon (an ⏳ emoji on
// two), its own colour, its own margin — beside the primitive that carries the tone,
// the glyph and the live-region role in one place. They folded onto it (`live`, `as`
// and `icon={null}` were the three props the copies needed).
//
// FAIL-CLOSED: a raw `role="status"` or `role="alert"` outside the primitives that OWN a
// live region fails — unless the file says here what it is instead (a popover, a
// progress panel, a speech bubble, a terminal face): those are not status LINES.
// Planted red with SearchPage's `<p className="search__count mono" role="status">` back.

const SRC = join(__dirname, '..')

const OWNERS = new Set([
  'components/StatusMessage.tsx',
  'components/LoadError.tsx', // builds on StatusMessage; its offline face is its own calm line
  'components/EmptyState.tsx', // an empty IS a status (role="status" on the <p>)
  'components/Skeleton.tsx', // the sr-only « chargement » announcement
  'lib/toast.tsx', // the undo toast + the notice bar
  'components/OfflineBanner.tsx',
])

const ALLOWED = new Map<string, string>([
  ['components/cercle/CercleConstellation.tsx', 'the live CAPTION of the map (what the picked island is) — a region, not a line'],
  ['components/DrawPad.tsx', 'the « brouillon » draft panel — a region'],
  ['components/ErrorBoundary.tsx', 'the crash face (role=alert on the whole panel)'],
  ['components/GlossaryTerm.tsx', 'a popover announcing a definition'],
  ['components/GuestExpired.tsx', 'a terminal face (lead + door), not a line'],
  ['components/HelpBubble.tsx', 'the help popover'],
  ['components/HubLayout.tsx', 'the idle-shell line « le babillard dort » — a shell state, before any page'],
  ['components/RecipeForm.tsx', 'the import PROGRESS panel (steps + bar)'],
  ['components/RoutinePlayer.tsx', 'the buddy’s speech bubble (hear-first)'],
  ['components/SharePreviewBar.tsx', 'the operator’s preview strip over a guest scene'],
  ['lib/aiErrorToast.tsx', 'the AI toast — its own aria-live assertive'],
])

const RAW = /role=["'](status|alert)["']/

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

describe('status rule — a status line is a StatusMessage', () => {
  it('the scan found the owners (canary)', () => {
    expect(files.some((f) => f.path === 'components/StatusMessage.tsx' && RAW.test(f.raw) === false), 'StatusMessage computes its role (no literal) — the scan reads the right file').toBe(true)
    expect(files.some((f) => f.path === 'components/EmptyState.tsx' && RAW.test(f.raw))).toBe(true)
  })

  it('no raw role=status|alert outside the owners and the listed regions', () => {
    const offenders = files
      .filter((f) => !OWNERS.has(f.path) && !ALLOWED.has(f.path) && RAW.test(f.raw))
      .map((f) => `${f.path}:${f.raw.slice(0, f.raw.search(RAW)).split('\n').length}`)
    expect(offenders, 'render <StatusMessage tone icon live as> — it carries the role; a REGION (a popover, a panel, a bubble) goes in ALLOWED with what it is').toEqual([])
  })

  it('every ALLOWED file still carries a raw role (a stale entry exempts the next arrival)', () => {
    const byPath = new Map(files.map((f) => [f.path, f.raw]))
    const stale = [...ALLOWED.keys()].filter((p) => !byPath.has(p) || !RAW.test(byPath.get(p)!))
    expect(stale, 'drop these').toEqual([])
  })
})
