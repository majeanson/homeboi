import { describe, it, expect } from 'vitest'
import { GUIDE, GUIDE_CARD_ALIAS, CONCEPT_THEMES, FEATURE_MAP_TILES } from './guideContent'
import { SETTINGS_SUBS, SETTINGS_FOCUS, SUB_GOTO, ROUTE_PREFIXES } from './settingsNav'
import { ADD_MODES } from './addSheet'

// The other half of the guide-orphan kill (helpRegistry.test.ts guards the
// feature→guide direction). Since the 2026-07 rework every card is a LAUNCHER
// too — `route` (« Ouvrir »), `settings` (« Régler »), per-point `route`
// (« Essayer ») — and each of those is a plain string a refactor can silently
// strand. This walks EVERY link the guide can emit and fails the build naming
// the dead one: /settings URLs against the settingsNav taxonomy, live routes
// against ROUTE_PREFIXES (a mirror of router.tsx), ?plus= against ADD_MODES,
// aliases against their hosts, and [[card:]] tokens against live+alias ids.

const guideById = new Map(GUIDE.map((e) => [e.id, e]))
const SETTINGS_TABS = new Set(['decouvrir', ...Object.keys(SETTINGS_SUBS)])

// Parse a link into pathname + params (the links are app-relative).
const parse = (link: string) => {
  const u = new URL(link, 'http://app')
  return { path: u.pathname, params: u.searchParams }
}

// One message-producing validator shared by every link source below.
const checkLink = (link: string, where: string): string | null => {
  const { path, params } = parse(link)
  if (path === '/settings') {
    const tab = params.get('tab')
    const sub = params.get('sub')
    const focus = params.get('focus')
    const card = params.get('card')
    if (tab && !SETTINGS_TABS.has(tab)) return `${where}: unknown settings tab "${tab}" in "${link}"`
    if (sub) {
      if (!tab) return `${where}: ?sub without ?tab in "${link}"`
      const subs: readonly string[] = SETTINGS_SUBS[tab as keyof typeof SETTINGS_SUBS] ?? []
      if (!subs.includes(sub)) return `${where}: sub "${sub}" is not in tab "${tab}" in "${link}"`
    }
    if (focus) {
      if (!tab || !sub) return `${where}: ?focus needs ?tab and ?sub in "${link}"`
      const keys = SETTINGS_FOCUS[`${tab}/${sub}`] ?? []
      if (!keys.includes(focus)) return `${where}: focus "${focus}" is not anchored under "${tab}/${sub}" in "${link}"`
    }
    if (card && !guideById.has(card) && !GUIDE_CARD_ALIAS[card]) return `${where}: unknown card "${card}" in "${link}"`
    return null
  }
  // Exact or segment-prefix match — "/listex" must NOT pass on "/liste".
  if (!ROUTE_PREFIXES.some((p) => path === p || path.startsWith(p + '/')))
    return `${where}: route "${path}" matches no ROUTE_PREFIXES entry (link "${link}")`
  const plus = params.get('plus')
  if (plus && plus !== '1' && !(ADD_MODES as readonly string[]).includes(plus))
    return `${where}: ?plus="${plus}" is not an AddSheetMode in "${link}"`
  return null
}

describe('guide links resolve (the guide is a launcher now)', () => {
  it('every card route / settings / point route lands somewhere real', () => {
    const problems: string[] = []
    for (const e of GUIDE) {
      if (e.route) {
        const p = checkLink(e.route, `card "${e.id}" route`)
        if (p) problems.push(p)
      }
      if (e.settings) {
        if (!e.settings.startsWith('/settings')) problems.push(`card "${e.id}" settings "${e.settings}" must be a /settings URL`)
        const p = checkLink(e.settings, `card "${e.id}" settings`)
        if (p) problems.push(p)
      }
      e.points.forEach((pt, i) => {
        if (!pt.route) return
        const p = checkLink(pt.route, `card "${e.id}" point ${i}`)
        if (p) problems.push(p)
      })
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('every GUIDE_CARD_ALIAS lands on a real host card and point', () => {
    const problems: string[] = []
    for (const [old, alias] of Object.entries(GUIDE_CARD_ALIAS)) {
      const host = guideById.get(alias.id)
      if (!host) problems.push(`alias "${old}" → unknown card "${alias.id}"`)
      else if (alias.base < 0 || alias.base >= host.points.length)
        problems.push(`alias "${old}" → base ${alias.base} out of range on "${alias.id}" (${host.points.length} points)`)
      if (guideById.has(old)) problems.push(`alias "${old}" shadows a LIVE card of the same id`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('every [[card:…]] token in guide prose names a live or aliased card', () => {
    // The tokens live inside Bi strings anywhere in the card data — scan the
    // serialized whole rather than enumerating fields.
    const tokens = JSON.stringify(GUIDE).matchAll(/\[\[card:([a-z0-9-]+)(?:\|[^\]]*)?\]\]/g)
    const problems: string[] = []
    for (const m of tokens) {
      const id = m[1]
      if (!guideById.has(id) && !GUIDE_CARD_ALIAS[id]) problems.push(`[[card:${id}]] names no live or aliased card`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('the settingsNav taxonomy is self-consistent', () => {
    const problems: string[] = []
    for (const key of [...Object.keys(SETTINGS_FOCUS), ...Object.keys(SUB_GOTO)]) {
      const [tab, sub] = key.split('/')
      const subs: readonly string[] = SETTINGS_SUBS[tab as keyof typeof SETTINGS_SUBS] ?? []
      if (!subs.includes(sub)) problems.push(`settingsNav key "${key}" names no real tab/sub`)
    }
    for (const [key, to] of Object.entries(SUB_GOTO)) {
      const p = checkLink(to, `SUB_GOTO["${key}"]`)
      if (p) problems.push(p)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('every theme tile route resolves (the feature map is a launcher too)', () => {
    const problems: string[] = []
    for (const th of CONCEPT_THEMES) {
      const p = checkLink(th.route, `theme "${th.key}"`)
      if (p) problems.push(p)
    }
    for (const tile of FEATURE_MAP_TILES) {
      const p = checkLink(tile.route, `tile "${tile.key}"`)
      if (p) problems.push(p)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('every concept card sits in a CONCEPT_THEMES bucket (else invisible)', () => {
    const themed = new Set(CONCEPT_THEMES.flatMap((th) => th.ids))
    const orphans = GUIDE.filter((e) => e.group === 'concepts' && !themed.has(e.id)).map((e) => e.id)
    expect(orphans, `concept cards missing from every theme bucket: ${orphans.join(', ')}`).toEqual([])
    const dead = [...themed].filter((id) => !guideById.has(id))
    expect(dead, `CONCEPT_THEMES lists retired ids: ${dead.join(', ')}`).toEqual([])
  })
})
