import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'
import {
  SETTINGS_TREE,
  SETTINGS_SUBS,
  SETTINGS_FOCUS,
  SUB_LABEL_KEY,
  LEGACY_TAB,
  LEGACY_SUB,
  RETIRED_SUB_IDS,
  SUB_GOTO,
  subOfFocus,
  visibleSubs,
  visibleSections,
  settingsHref,
  type SettingsTabId,
} from './settingsNav'
import { FR } from '../i18n'
import { EN } from '../i18n.en'

// THE RÉGLAGES TAXONOMY, held by a test (sibling of guideLinks.test.ts, which
// walks the guide's links against it). SETTINGS_TREE is the one map of what
// Réglages holds where; this file is what makes the NEXT reshuffle safe: move a
// card, retire a pill, and everything that still spells the old address — a
// spec, a component, a label key, a legacy fold — is named here, red, before the
// user finds it. Written with the 28 → 14 agglomeration (2026-09-08), and run
// against it: each rule below was watched fail on the pre-merge spellings first.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')
const rel = (f: string) => relative(rootDir, f).split(sep).join('/')

const TABS = Object.keys(SETTINGS_TREE) as SettingsTabId[]
const isLiveSub = (tab: string, sub: string) => ((SETTINGS_SUBS as Record<string, readonly string[]>)[tab] ?? []).includes(sub)

describe('SETTINGS_TREE is well-formed', () => {
  it('every section key is unique across the whole tree (it is a DOM id)', () => {
    const seen = new Map<string, string>()
    const dupes: string[] = []
    for (const tab of TABS) {
      for (const [sub, sections] of Object.entries(SETTINGS_TREE[tab])) {
        for (const s of sections as readonly { key: string }[]) {
          const at = `${tab}/${sub}`
          if (seen.has(s.key)) dupes.push(`${s.key} in ${seen.get(s.key)} and ${at}`)
          seen.set(s.key, at)
        }
      }
    }
    expect(dupes, 'a section key mints id="op-<key>" — two cards with one key is two elements with one id').toEqual([])
  })

  it('every pill has at least one section, and every section an access level', () => {
    for (const tab of TABS) {
      for (const [sub, sections] of Object.entries(SETTINGS_TREE[tab])) {
        expect((sections as readonly unknown[]).length, `${tab}/${sub} is an empty pill`).toBeGreaterThan(0)
        for (const s of sections as readonly { key: string; access: string }[]) {
          expect(['device', 'household', 'operator'], `${s.key} access`).toContain(s.access)
        }
      }
    }
  })

  it('every pill has a label key that exists in BOTH languages', () => {
    for (const tab of TABS) {
      for (const sub of SETTINGS_SUBS[tab]) {
        const key = (SUB_LABEL_KEY[tab] as Record<string, string>)[sub]
        expect(key, `${tab}/${sub} has no SUB_LABEL_KEY`).toBeTruthy()
        expect((FR.operator as Record<string, unknown>)[key], `t.operator.${key} (fr) for ${tab}/${sub}`).toBeTypeOf('string')
        expect((EN.operator as Record<string, unknown>)[key], `t.operator.${key} (en) for ${tab}/${sub}`).toBeTypeOf('string')
      }
    }
  })

  it('SETTINGS_FOCUS and subOfFocus agree, for every section', () => {
    for (const [key, keys] of Object.entries(SETTINGS_FOCUS)) {
      const [tab, sub] = key.split('/')
      for (const k of keys) expect(subOfFocus(tab, k), `subOfFocus(${tab}, ${k})`).toBe(sub)
    }
  })

  it('SUB_GOTO keys name live pills', () => {
    for (const key of Object.keys(SUB_GOTO)) {
      const [tab, sub] = key.split('/')
      expect(isLiveSub(tab, sub), `SUB_GOTO["${key}"] names no live pill`).toBe(true)
    }
  })
})

describe('the legacy folds point forward', () => {
  it('every LEGACY_SUB target is a live pill, and no retired id is still live', () => {
    for (const [tab, folds] of Object.entries(LEGACY_SUB)) {
      for (const [oldSub, host] of Object.entries(folds ?? {})) {
        expect(isLiveSub(tab, host), `LEGACY_SUB.${tab}.${oldSub} → "${host}" is not a live pill`).toBe(true)
        expect(isLiveSub(tab, oldSub), `LEGACY_SUB.${tab}.${oldSub} is listed as retired but is still a live pill`).toBe(false)
      }
    }
  })

  it('every LEGACY_TAB target names a live tab and (when given) a live pill', () => {
    const tabs = new Set<string>(['decouvrir', ...TABS])
    for (const [old, entry] of Object.entries(LEGACY_TAB)) {
      expect(tabs.has(entry.tab), `LEGACY_TAB.${old} → tab "${entry.tab}"`).toBe(true)
      if (entry.sub) expect(isLiveSub(entry.tab, entry.sub), `LEGACY_TAB.${old} → "${entry.tab}/${entry.sub}" is not live`).toBe(true)
      for (const [s, target] of Object.entries(entry.bySub ?? {})) {
        expect(isLiveSub(target.tab, target.sub), `LEGACY_TAB.${old}.bySub.${s} → "${target.tab}/${target.sub}" is not live`).toBe(true)
      }
    }
  })

  it('no retired tab id shadows a live tab', () => {
    for (const old of Object.keys(LEGACY_TAB)) expect((TABS as string[]).includes(old), `LEGACY_TAB.${old} is a live tab`).toBe(false)
  })
})

describe('who sees what — derived from access, never an allowlist', () => {
  const guest = { guest: true, operator: false }
  const kiosk = { guest: false, operator: false }
  const operator = { guest: false, operator: true }

  it('a link guest gets exactly the device-local cards, and only pills that hold one', () => {
    for (const tab of TABS) {
      for (const sub of visibleSubs(tab, guest)) {
        const shown = visibleSections(tab, sub, guest)
        expect(shown.length, `${tab}/${sub} offered to a guest with nothing to show`).toBeGreaterThan(0)
        for (const s of shown) expect(s.access, `${s.key} shown to a guest`).toBe('device')
      }
    }
    // The four things the demo must keep (CLAUDE.md « The demo is a guest link »):
    // the board layout, the display knobs, the read-aloud voice, calm mode.
    for (const k of ['boardLayout', 'display', 'voice', 'calm']) {
      const home = TABS.find((tab) => subOfFocus(tab, k))!
      const sub = subOfFocus(home, k)!
      expect(visibleSections(home, sub, guest).map((s) => s.key), `${k} reachable by a guest`).toContain(k)
    }
  })

  it('a paired kiosk sees everything but the operator-only cards', () => {
    for (const tab of TABS) {
      for (const sub of SETTINGS_SUBS[tab]) {
        const all = visibleSections(tab, sub, operator)
        const seen = visibleSections(tab, sub, kiosk)
        expect(seen.map((s) => s.key)).toEqual(all.filter((s) => s.access !== 'operator').map((s) => s.key))
      }
    }
    // Its own diagnostics stay reachable — a wall tablet debugs its own keyboard.
    expect(visibleSections('settings', 'tablets', kiosk).map((s) => s.key)).toContain('kbDebug')
    expect(visibleSections('settings', 'tablets', kiosk).map((s) => s.key)).not.toContain('takeout')
  })

  it('the operator sees every section of every pill', () => {
    for (const tab of TABS) {
      expect(visibleSubs(tab, operator)).toEqual([...SETTINGS_SUBS[tab]])
      for (const sub of SETTINGS_SUBS[tab]) {
        expect(visibleSections(tab, sub, operator).length).toBe((SETTINGS_TREE[tab] as Record<string, readonly unknown[]>)[sub].length)
      }
    }
  })
})

describe('settingsHref names the section and derives the pill', () => {
  it('derives ?sub from ?focus', () => {
    expect(settingsHref({ tab: 'settings', focus: 'calm' })).toBe('/settings?tab=settings&sub=display&focus=calm')
    expect(settingsHref({ tab: 'maison', focus: 'chores' })).toBe('/settings?tab=maison&sub=routines&focus=chores')
  })
  it('keeps an explicit sub, and a bare tab', () => {
    expect(settingsHref({ tab: 'kitchen', sub: 'meals' })).toBe('/settings?tab=kitchen&sub=meals')
    expect(settingsHref({ tab: 'decouvrir' })).toBe('/settings?tab=decouvrir')
  })
})

// The part that survives the NEXT reshuffle: nothing in the tree of code or specs
// may still spell a retired pill. LEGACY_SUB keeps such a URL LANDING at runtime —
// this is what keeps it from being WRITTEN again. (Retired TAB ids are allowed in
// e2e/settings-aliases.spec.ts alone, whose job is to prove they still land.)
describe('nothing spells a retired pill', () => {
  const RETIRED = [...RETIRED_SUB_IDS]
  const pattern = new RegExp(`[?&]sub=(${RETIRED.join('|')})\\b`, 'g')

  const offenders = (dir: string, allow: (f: string) => boolean = () => false): string[] => {
    const out: string[] = []
    for (const f of sourceFiles(dir)) {
      const file = rel(f)
      if (allow(file)) continue
      const src = readScanned(f)
      for (const m of src.matchAll(pattern)) out.push(`${file}:${src.slice(0, m.index).split('\n').length} ${m[0]}`)
    }
    return out
  }

  it('the scanner sees a retired id (the canary)', () => {
    expect('/settings?tab=settings&sub=calm'.match(pattern)?.[0]).toBe('&sub=calm')
    expect('/settings?tab=settings&sub=display'.match(pattern)).toBeNull()
  })

  it('src/ links name live pills (or just the section)', () => {
    expect(offenders(srcDir), 'use settingsHref({ tab, focus }) — the pill is derived, and it follows the card').toEqual([])
  })

  it('e2e/ specs navigate to live pills', () => {
    expect(
      offenders(join(rootDir, 'e2e'), (f) => f === 'e2e/settings-aliases.spec.ts'),
      'a spec written against a retired pill still LANDS (LEGACY_SUB) but rots — name the live pill, or better the section via ?focus=',
    ).toEqual([])
  })
})

// The PROSE layer — the part every earlier reshuffle rotted. A hint, a guide point
// or a confirm string says « Réglages ▸ Tablettes » and nobody re-reads it when the
// pill becomes « Appareils & accès »; the 2026-09-08 sweep found breadcrumbs still
// naming pills retired THREE restructures ago (« Réglages ▸ Guide », « ▸ Courses »,
// « ▸ Le cercle »). So: every « Réglages ▸ A ▸ B » / « Settings ▸ A ▸ B » in a
// user-facing string names a live tab (A) and, when it goes on, a live pill of that
// tab (B) — in either language. A third segment (a card title, an inner tab) is
// free: cards don't move, pills do. A two-segment crumb may name a pill directly
// (« Réglages ▸ Magasinage ») when that label belongs to exactly one tab.
describe('prose breadcrumbs name live Réglages destinations', () => {
  const tabLabels = new Map<string, string>() // label → tab id (both languages)
  const navKey: Record<string, string> = { liste: 'list', notes: 'notes', maison: 'maison' }
  const opKey: Record<string, string> = { decouvrir: 'secDiscover', board: 'secBoard', kitchen: 'secKitchen', settings: 'secSystem' }
  for (const L of [FR, EN]) {
    for (const [tab, k] of Object.entries(opKey)) tabLabels.set((L.operator as unknown as Record<string, string>)[k], tab)
    for (const [tab, k] of Object.entries(navKey)) tabLabels.set((L.nav as unknown as Record<string, string>)[k], tab)
  }
  const pillLabels = new Map<string, Set<string>>() // tab → its pill labels (both languages)
  const pillOwners = new Map<string, Set<string>>() // pill label → tabs that own it
  for (const tab of TABS) {
    const set = new Set<string>()
    for (const sub of SETTINGS_SUBS[tab]) {
      const k = (SUB_LABEL_KEY[tab] as Record<string, string>)[sub]
      for (const L of [FR, EN]) {
        const label = (L.operator as unknown as Record<string, string>)[k]
        set.add(label)
        if (!pillOwners.has(label)) pillOwners.set(label, new Set())
        pillOwners.get(label)!.add(tab)
      }
    }
    pillLabels.set(tab, set)
  }

  const CRUMB = /(?:Réglages|Settings) ▸ ([^▸.;:'"«»()\n]+?)(?: ▸ ([^▸.;:'"«»()\n]+?))?(?: ▸ ([^▸.;:'"«»()\n]+?))?(?=[.;:'"«»(),\n]|$| —| -|$)/g
  const clean = (x: string | undefined) => (x ?? '').trim().replace(/\s+$/, '')

  // A crumb inside a sentence runs straight into the prose (« Réglages ▸ Magasinage
  // et il reste… »), so a segment is matched by live-label PREFIX: the label, then
  // either the end or a word boundary. Longest label first, so « Voix & IA » beats
  // « Voix ».
  const startsWithLabel = (segment: string, labels: Iterable<string>): string | undefined =>
    [...labels].sort((x, y) => y.length - x.length).find((l) => segment === l || segment.startsWith(l + ' '))
  // Returns a problem or null for one crumb.
  const check = (a: string, b: string | undefined): string | null => {
    const tabLabel = startsWithLabel(a, tabLabels.keys())
    if (tabLabel) {
      const tab = tabLabels.get(tabLabel)!
      if (!b) return null
      return startsWithLabel(b, pillLabels.get(tab)!) ? null : `« ${tabLabel} ▸ ${b} » — no pill of ${tab} starts it`
    }
    const pill = startsWithLabel(a, pillOwners.keys())
    const owners = pill ? pillOwners.get(pill)! : undefined
    if (owners && owners.size === 1 && !b) return null
    if (owners && owners.size > 1) return `« ${pill} » is a pill of several tabs — name the tab`
    return `« ${a} » is neither a tab nor a pill`
  }

  const scan = (src: string): string[] => {
    const out: string[] = []
    for (const m of src.matchAll(CRUMB)) {
      const problem = check(clean(m[1]), m[2] ? clean(m[2]) : undefined)
      if (problem) out.push(`${src.slice(0, m.index).split('\n').length}: ${problem}`)
    }
    return out
  }

  it('the scanner reads a crumb and knows a retired pill from a live one (the canary)', () => {
    expect(scan('x « Réglages ▸ Tablettes ». y').length).toBe(1)
    expect(scan('x Réglages ▸ Système ▸ Appareils & accès. y')).toEqual([])
    expect(scan('x Settings ▸ System ▸ Devices & access: y')).toEqual([])
    expect(scan('x dans Réglages ▸ Magasinage : y')).toEqual([])
    expect(scan('x Réglages ▸ Maison ▸ Tâches de la maison ▸ Entretien montrent y')).toEqual([])
    expect(scan('x Réglages ▸ Guide.').length).toBe(1)
  })

  it('i18n (fr + en), the guide and the help registries only name live destinations', () => {
    const files = ['src/i18n.ts', 'src/i18n.en.ts', 'src/lib/guideContent.ts', 'src/lib/operatorHelp.ts', ...sourceFiles(srcDir).filter((f) => /[a-zA-Z]Help\.ts$/.test(f)).map((f) => rel(f))]
    const problems: string[] = []
    for (const f of new Set(files)) {
      // Strings only: readScanned blanks comments, and a comment's crumb is not a hint.
      for (const p of scan(readScanned(join(rootDir, f)))) problems.push(`${f}:${p}`)
    }
    expect(problems, 'a breadcrumb names a retired tab or pill — re-point it at the live one (DISCOVERY.md carries the map)').toEqual([])
  })
})

