import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOURS } from './tourContent'
import { GUIDE } from './guideContent'
import { sectionCardFor } from './sectionCard'

// A TOUR STEP THAT SPOTLIGHTS NOTHING IS NOT A TOUR STEP — and a section with no
// tour behind its « ? » is help that means different things on different tabs.
//
// The engine is forgiving on purpose: a step whose anchor isn't on screen renders as
// a CENTRED CARD instead (TourOverlay), so a tour never dead-ends on a control the
// current state happens to hide. That kindness also hides a typo perfectly, which is
// why the rule is a build gate rather than a convention.
//
// Written 2026-09-09 for the report "the guided tour only ever approaches one
// section". Worth recording what the first draft of THIS FILE got wrong, because it
// is the failure mode the repo keeps meeting: it scanned only literal
// `data-tour="…"` attributes and duly reported three orphans — `kitchen-tabs`,
// `maison-sections`, `cercle-views`. All three exist. They are passed as `tour="…"`
// to SubTabs, which renders `data-tour={tour}` on its tablist. A guard that walks
// the wrong shape reports the wrong thing with total confidence; the scan below
// follows both spellings, and the real findings were elsewhere (Les notes had no
// tour at all, and one anchor was spotlighted by nobody).

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      out.push(...sourceFiles(p))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

const files = sourceFiles(SRC).map((f) => ({
  path: relative(SRC, f).split(sep).join('/'),
  raw: readFileSync(f, 'utf8'),
}))

// Every anchor the app declares, with the file that carries it. TWO spellings, and
// missing the second is how this test's first draft reported three false orphans:
//   · `data-tour="x"` written straight onto the element, and
//   · `tour="x"` handed to a primitive that forwards it (SubTabs renders
//     `data-tour={tour}` on its tablist) — which is how the kitchen sub-tabs, the
//     Maison section pills and the cercle view switch are all anchored.
// A guard that walks the wrong shape reports the wrong thing; this one follows both.
const anchors = new Map<string, string[]>()
const addAnchor = (id: string, path: string) => {
  const list = anchors.get(id) ?? []
  list.push(path)
  anchors.set(id, list)
}
for (const f of files) {
  for (const m of f.raw.matchAll(/data-tour="([a-z0-9-]+)"/g)) addAnchor(m[1], f.path)
  for (const m of f.raw.matchAll(/(?<![\w-])tour="([a-z0-9-]+)"/g)) addAnchor(m[1], f.path)
}

// Every surface a « ? » can be armed on — the five hub tabs plus Réglages, whose
// « ? » (and whose 34-entry registry) only became reachable on 2026-09-09.
// Each declares a GUIDE card (the `card` prop it hands HubHead / HelpHint), and by
// the app's own convention — SectionIntro has used it since #32 — a tour shares it.
const HUB_CARDS = ['board', 'kitchen', 'liste', 'notes', 'maison', 'settings'] as const
// Sub-surfaces of Maison that carry their own tour: the « ? » there offers the tour
// for the section you are actually looking at, not the tab's generic one.
const MAISON_SUB_CARDS = ['routines', 'cercle'] as const

describe('tour rule', () => {
  it('the anchor scan found the app (canary)', () => {
    // If the walk breaks, every assertion below passes vacuously.
    expect(files.length, 'no source files scanned').toBeGreaterThan(200)
    expect(anchors.size, 'no data-tour anchors found at all').toBeGreaterThan(8)
  })

  it('every tour step spotlights an anchor that EXISTS', () => {
    const orphans: string[] = []
    for (const tour of TOURS) {
      tour.steps.forEach((s, i) => {
        if (s.target && !anchors.has(s.target)) {
          orphans.push(`${tour.id} step ${i} → data-tour="${s.target}"`)
        }
      })
    }
    expect(
      orphans,
      'a step naming a missing anchor does not fail — it renders as a centred card, so the tour quietly stops pointing at anything. Add the `data-tour` attribute to the element (or fix the name)',
    ).toEqual([])
  })

  it('every hub section has its own tour, reachable from its « ? »', () => {
    const ids = new Set(TOURS.map((t) => t.id))
    const missing = [...HUB_CARDS, ...MAISON_SUB_CARDS].filter((c) => !ids.has(c))
    expect(
      missing,
      'a section whose « ? » offers no tour is the asymmetry this rule exists to prevent: help must mean the same thing on every tab',
    ).toEqual([])
  })

  it('every tour id is a real GUIDE card, so « En savoir plus » has somewhere to land', () => {
    const cards = new Set(GUIDE.map((e) => e.id))
    // `essentials` is the app-wide welcome tour: it belongs to no single section.
    const orphans = TOURS.map((t) => t.id).filter((id) => id !== 'essentials' && !cards.has(id))
    expect(orphans).toEqual([])
  })

  it('every « ? » bar names its section — no HelpHint without a card', () => {
    // The bar's doors ARE the card: no card, no tour offer and no guide offer, and
    // the « ? » silently falls back to hints-only on that surface — the asymmetry
    // this whole pass removed. Fail-closed, like write-rule: a new surface that
    // renders the bar has to say which section it is.
    const bare: string[] = []
    for (const f of files) {
      if (f.path === 'lib/helpMode.tsx') continue // the definition itself
      for (const m of f.raw.matchAll(/<HelpHint([^>]*?)\/>/g)) {
        if (!m[1].includes('card=')) bare.push(`${f.path}: <HelpHint${m[1]}/>`)
      }
    }
    expect(bare, 'pass card="<guide id>" (or a computed one, as Maison and the ＋ sheet do)').toEqual([])
  })

  it('every hub route resolves to a card that has BOTH a guide card and a tour', () => {
    // sectionCardFor is what the ＋ sheet and Maison both read; if it answers with an
    // id nothing backs, the bar offers a door onto nothing.
    const cards = new Set(GUIDE.map((e) => e.id))
    const tours = new Set(TOURS.map((t) => t.id))
    const routes: [string, string][] = [
      ['/board', ''],
      ['/kitchen', ''],
      ['/liste', ''],
      ['/notes', ''],
      ['/maison', ''],
      ['/maison', '?section=routines'],
      ['/maison', '?section=family'],
      ['/maison', '?section=social'],
      ['/maison', '?section=business'],
      ['/maison', '?section=carnets'],
    ]
    const broken = routes
      .map(([p, q]) => [`${p}${q}`, sectionCardFor(p, q)] as const)
      .filter(([, card]) => !card || !cards.has(card) || !tours.has(card))
      .map(([r, card]) => `${r} → ${card ?? '(none)'}`)
    expect(broken).toEqual([])
  })

  it('every anchor in the app is actually used by a tour', () => {
    // The mirror direction: a `data-tour` nobody spotlights is dead weight that
    // reads as coverage. (It also catches a step renamed on one side only.)
    const targeted = new Set(TOURS.flatMap((t) => t.steps.map((s) => s.target).filter(Boolean) as string[]))
    const unused = [...anchors.keys()].filter((a) => !targeted.has(a))
    expect(unused, 'these elements carry a data-tour no tour step names').toEqual([])
  })
})
