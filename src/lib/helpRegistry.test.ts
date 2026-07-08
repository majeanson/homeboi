import { describe, it, expect } from 'vitest'
import { GUIDE } from './guideContent'
import { ADD_HELP } from './addHelp'
import { BOARD_HELP } from './boardHelp'
import { CERCLE_HELP } from './cercleHelp'
import { KITCHEN_TAB_HELP } from './kitchenTabHelp'
import { LISTE_HELP } from './listeHelp'
import { OPERATOR_HELP } from './operatorHelp'
import { ROUTINES_HELP } from './routinesHelp'
import { TOURS } from './tourContent'
import { WHATS_NEW } from './whatsNew'
import type { HelpEntry } from './helpMode'

// P2-9 (UNIFORMIZING) — the other half of the help-orphan kill. The COMPILE
// half already exists: useHelpMode is generic over its registry's keys, so an
// unregistered `pick('typo')` fails tsc. But every registry entry also carries
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
})
