import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { OPERATOR_HELP } from './operatorHelp'
import { openTags } from './buildGuardScan'

// Réglages' « ? » answers on EVERY card, or says out loud why one is silent.
//
// The defect this was written for shipped and stood for months without anyone being
// able to SEE it: `lib/operatorHelp` had an entry per settings section, `HelpTitle`
// makes a heading tappable while help mode is armed… and nothing in Réglages ever
// called `toggle()`. The registry was unreachable for as long as it existed. That was
// fixed 2026-09-09 (the « ? » now rides the lens row) — and the moment it became
// reachable, five of the most-used cards in Réglages turned out to say NOTHING when
// tapped: « Rendez-vous », « La maisonnée », « Tablettes jumelées », « Corvées »,
// « Routines (mode enfant) ».
//
// The cause is one word doing two jobs. `OperatorSection`'s `helpKey` is BOTH the
// help-registry key AND the `?focus=` anchor id, and the component renders a
// `HelpTitle` only when `help` AND `helpKey` are both passed. So a section that wants
// an anchor passes `helpKey` alone and is silently inert in help mode — and in a diff
// "no help written yet" looks exactly like "anchor only, on purpose". That ambiguity
// is the same one `COMPONENTS.md` carried until `*(no specimen: <reason>)*` made the
// exemption say its name.
//
// So: every `helpKey` is one of two things, and both are stated.
//   1. it names an OPERATOR_HELP entry → the call site MUST also pass `help`
//   2. it does not → it is listed in ANCHOR_ONLY below WITH the reason
//
// The four anchor-only cards are not oversights: each carries an always-on `hint`
// paragraph that already IS the explanation, and a bubble repeating it is the
// always-on-hint smell LEAN.md names (and `babillard-section-help-not-inline`).
const ANCHOR_ONLY: Record<string, string> = {
  aisleOrder: 'the always-on hint already says it: drag the aisles into YOUR store’s order',
  health: 'the always-on hint already says it: what is plugged in, and what hides when it is not',
  takeout: 'the always-on hint already says it: everything Babillard keeps, in one JSON file',
  claimTablet: 'the always-on lead already walks the pairing, step by step',
  buildInfo: '« Version » + « Dernière mise à jour » — two read-only lines that explain themselves',
}

// The tag walk lives in buildGuardScan (shared + tested): a naive slice to the first
// '>' is wrong here, because attribute values hold arrow functions and whole JSX
// subtrees. Three guards walked a wrong shape before that module existed — one of
// them reported GREEN over the very defect it was written for.
const DIR = join(process.cwd(), 'src/components/operator')
const FILES = [
  ...readdirSync(DIR)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => join(DIR, f)),
  join(process.cwd(), 'src/pages/Operator.tsx'),
]

type Site = { file: string; key: string; hasHelp: boolean }
const sites: Site[] = []
for (const file of FILES) {
  for (const tag of openTags(readFileSync(file, 'utf8'), 'OperatorSection')) {
    const key = /helpKey="([^"]+)"/.exec(tag)?.[1]
    if (!key) continue
    sites.push({ file: file.split(/[\\/]/).slice(-1)[0], key, hasHelp: /(^|\s)help=\{/.test(tag) })
  }
}

describe('Réglages help coverage', () => {
  // (The tag walk's own trap fixture moved to buildGuardScan.test.ts with the walk.)
  it('finds every OperatorSection that declares a helpKey', () => {
    // A floor, not an exact count: it only has to prove the walk didn't collapse.
    expect(sites.length).toBeGreaterThanOrEqual(40)
  })

  it('a helpKey with a registry entry is passed `help`, or its heading is inert', () => {
    const inert = sites
      .filter((s) => s.key in OPERATOR_HELP && !s.hasHelp)
      .map((s) => `${s.file} helpKey="${s.key}"`)
    expect(
      inert,
      `these Réglages cards have help copy written but never render it — OperatorSection ` +
        `needs BOTH help and helpKey to make the heading tappable, so arming the « ? » leaves ` +
        `them silent: ${inert.join(', ')}`,
    ).toEqual([])
  })

  it('a helpKey with no registry entry says why it is anchor-only', () => {
    const unexplained = sites
      .filter((s) => !(s.key in OPERATOR_HELP) && !(s.key in ANCHOR_ONLY))
      .map((s) => `${s.file} helpKey="${s.key}"`)
    expect(
      unexplained,
      `these helpKeys name no OPERATOR_HELP entry, so arming the « ? » does nothing on them. ` +
        `Either write the entry, or add the key to ANCHOR_ONLY in this file with the reason a ` +
        `bubble would be wrong (usually: an always-on hint already carries the explanation): ` +
        `${unexplained.join(', ')}`,
    ).toEqual([])
  })

  it('ANCHOR_ONLY holds no stale key', () => {
    const used = new Set(sites.map((s) => s.key))
    const stale = Object.keys(ANCHOR_ONLY).filter((k) => !used.has(k) || k in OPERATOR_HELP)
    expect(
      stale,
      `these ANCHOR_ONLY exemptions no longer apply (the section is gone, or it grew real ` +
        `help copy): ${stale.join(', ')}`,
    ).toEqual([])
  })
})
