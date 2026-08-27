import { describe, it, expect } from 'vitest'
import { GUIDE, GUIDE_CARD_ALIAS } from './guideContent'
import { ADD_HELP } from './addHelp'
import { BOARD_HELP } from './boardHelp'
import { CERCLE_HELP } from './cercleHelp'
import { KITCHEN_TAB_HELP } from './kitchenTabHelp'
import { LISTE_HELP } from './listeHelp'
import { NOTES_HELP } from './notesHelp'
import { OPERATOR_HELP } from './operatorHelp'
import { ROUTINES_HELP } from './routinesHelp'
import { TOURS } from './tourContent'
import { WHATS_NEW } from './whatsNew'
import { type HelpEntry, useHelpMode } from './helpMode'

// P2-9 (UNIFORMIZING) — the other half of the help-orphan kill. The COMPILE
// half is useHelpMode being generic over its registry's keys, so an unregistered
// `pick('typo')` fails tsc — a claim that was quietly FALSE for a while (surfaces
// type their labeller `(k: string) => …`, which was a second inference site, so K
// collapsed to `string` and every key was accepted). It let La liste ship a ⚙ whose
// help bubble rendered nothing, and left eight AddSheet tiles in the same state.
// `NoInfer` in lib/helpMode.tsx restores it, and the last test below now HOLDS IT
// to that claim instead of trusting it. But every registry entry also carries
// a `card` (a GUIDE entry id) its « → Voir le guide » deep-link lands on — and
// that id is a plain string, so a renamed/deleted guide card silently turns
// the link into a dead end (the exact orphan bug the memory records shipping
// twice). This test walks EVERY card reference in the app — the 7 help-mode
// registries, the static tours, and « Quoi de neuf » — and fails the build
// naming the orphan. Adding a registry? Import it here; the discovery probes
// have the same guard beside their own code (discovery.test.ts).

const REGISTRIES: Record<string, Record<string, HelpEntry>> = {
  ADD_HELP,
  BOARD_HELP,
  CERCLE_HELP,
  KITCHEN_TAB_HELP,
  LISTE_HELP,
  NOTES_HELP,
  OPERATOR_HELP,
  ROUTINES_HELP,
}

const guideById = new Map(GUIDE.map((e) => [e.id, e]))

describe('help/guide integrity (P2-9)', () => {
  it('every help-registry card points at a real GUIDE entry', () => {
    for (const [name, reg] of Object.entries(REGISTRIES)) {
      for (const [key, entry] of Object.entries(reg)) {
        expect(guideById.has(entry.card), `${name}.${key} → card "${entry.card}" has no GUIDE entry`).toBe(true)
      }
    }
  })

  it('every help-registry point index exists on its GUIDE card', () => {
    for (const [name, reg] of Object.entries(REGISTRIES)) {
      for (const [key, entry] of Object.entries(reg)) {
        if (entry.point == null) continue
        const card = guideById.get(entry.card)
        expect(
          card != null && entry.point >= 0 && entry.point < card.points.length,
          `${name}.${key} → point ${entry.point} is out of range on card "${entry.card}" (${card?.points.length ?? 0} points)`,
        ).toBe(true)
      }
    }
  })

  it('every static tour step card points at a real GUIDE entry', () => {
    for (const tour of Object.values(TOURS)) {
      for (const step of tour.steps) {
        if (!step.card) continue
        expect(guideById.has(step.card), `tour "${tour.id}" step card "${step.card}" has no GUIDE entry`).toBe(true)
      }
    }
  })

  it('every « Quoi de neuf » card points at a real GUIDE entry', () => {
    for (const entry of WHATS_NEW) {
      if (!entry.card) continue
      expect(guideById.has(entry.card), `whatsNew "${entry.id}" → card "${entry.card}" has no GUIDE entry`).toBe(true)
    }
  })

  it('GUIDE ids are unique (the maps above assume it)', () => {
    expect(guideById.size, 'duplicate GUIDE entry ids').toBe(GUIDE.length)
  })

  it('no registry names an alias key — in-code refs stay PRECISE', () => {
    // GUIDE_CARD_ALIAS exists for old URLs and [[card:]] tokens only. A registry
    // entry left on a retired id would still *land* (the alias resolves it) but
    // loses its exact sub-point and quietly outsources meaning to an offset
    // table — every in-code ref must name the live host card + point itself.
    for (const [name, reg] of Object.entries(REGISTRIES)) {
      for (const [key, entry] of Object.entries(reg)) {
        expect(GUIDE_CARD_ALIAS[entry.card], `${name}.${key} → "${entry.card}" is a retired alias; point at "${GUIDE_CARD_ALIAS[entry.card]?.id}" with the precise point instead`).toBeUndefined()
      }
    }
  })

  // The COMPILE half, asserted rather than assumed. `probe` reproduces a real call
  // site exactly — a registry plus the loose `(k: string)` labeller every surface
  // writes — so this reads the key type TypeScript actually INFERS there, which is
  // where the regression lived. Widen it back to `string` and `Exact` turns false,
  // so the `true` below stops typechecking and `npm run typecheck` names this line.
  it('an unregistered pick() key is still a tsc error (the guard regressed once)', () => {
    const probe = () => useHelpMode(LISTE_HELP, (k: string) => k)
    type PickKey = Parameters<ReturnType<typeof probe>['pick']>[0]
    type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
    const narrow: Exact<PickKey, keyof typeof LISTE_HELP> = true
    expect(narrow).toBe(true)
  })
})
