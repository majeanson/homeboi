// The Réglages navigation taxonomy as PLAIN DATA — THE one source for what lives
// where. pages/Operator.tsx builds its pill rows and section stacks from this;
// OperatorSection derives its DOM anchor from it; lib/guideLinks.test.ts validates
// every guide « Régler » URL against it; e2e/settings-aliases.spec.ts walks its
// retired ids. No React in here on purpose: vitest and Playwright import it directly.
//
// THE MODEL (2026-09-08, the 28 → 14 agglomeration): a SECTION is the stable
// thing — one OperatorSection card with a helpKey (`recipeTags`, `ambient`,
// `guest`…). A SUB is packaging: which sections stack under one pill today. Links,
// hints, tours and specs should therefore name the SECTION (`?focus=<key>`), and
// the sub is DERIVED (`subOfFocus`). Re-shuffling the pills — the next time
// someone says « far too many » — is then an edit to SETTINGS_TREE plus a line in
// LEGACY_SUB, and nothing else moves: the anchors, the guest/kiosk gating, the
// pill order and the guide's validation all read from here.
//
// Every section declares WHO may use it (`access`), and the viewer's pill row and
// stacks derive from that rather than from a hand-kept allowlist:
//   · `device`    — writes only this browser's localStorage (theme, lens, voice,
//                   idle, calm, the board layout). A read-only LINK guest may use it:
//                   the household never sees it (see the isGuest() note in CLAUDE.md
//                   — gating these is what once hid the whole guide from the demo).
//   · `household` — reads or writes /api/* for the household. A paired kiosk may;
//                   a guest may not.
//   · `operator`  — the signed-in operator only: member admin, pairing, guest links,
//                   the household export. A kiosk's pill still shows when the sub
//                   has other sections; only the operator cards drop out of it.
// A sub is offered to a viewer iff at least one of its sections is — so the guest
// still gets « Affichage & veille » (its device cards) even though « Photos de la
// maison » stacks there too and stays hidden from them.

export type SettingsAccess = 'device' | 'household' | 'operator'

export interface SettingsSection {
  /** The card's ANCHOR id — the `?focus=` value, minted as `id="op-<key>"` by
   *  OperatorSection. It is the card's helpKey, except where a helpKey is shared
   *  by several cards (`guest` names five): that card then passes an explicit
   *  `anchor` prop naming this key instead (`guestLinks`). */
  readonly key: string
  readonly access: SettingsAccess
}

const s = (key: string, access: SettingsAccess): SettingsSection => ({ key, access })

// tab → sub (pill order) → sections (stack order). The tab id IS the hub
// SectionKey (lib/guideContent), so tints, ?card= homing and this share one id
// space. « Les notes » is Comprendre-only and deliberately absent. « Découvrir »
// has no subs. Ids stay short and stable; the LABEL each pill wears is i18n
// (`SUB_LABEL_KEY` below), not the id.
export const SETTINGS_TREE = {
  board: {
    // Agenda & la semaine: the rendez-vous + « La rentrée », then the calm week
    // glance + the AI recap — everything the board's timeline is made of.
    events: [s('events', 'household'), s('schoolYear', 'household'), s('thisWeek', 'household'), s('recap', 'household')],
    layout: [s('boardLayout', 'device')],
  },
  kitchen: {
    // « Apparence » stays out of the guest's reach on purpose: it looks device-local,
    // but MeasureColorsSection PATCHes /api/household.
    apparence: [s('recipeTags', 'household'), s('recipePills', 'household'), s('measureColors', 'household')],
    meals: [s('mealSlots', 'household'), s('mealWindow', 'household')],
    reserve: [s('reserveLocations', 'household')],
  },
  liste: {
    // Magasinage: what to buy, in which aisle order, from which stores.
    // `flipp` is device-level: a bookmark lives in this phone's browser, it writes
    // nothing to the household — so a link guest may set it up too.
    shop: [s('shop', 'household'), s('aisleOrder', 'household'), s('storeFilter', 'household'), s('flipp', 'device')],
    // Historique & suivi: what was bought, and the opt-in ghost tracking.
    history: [s('history', 'household'), s('ghost', 'household')],
  },
  maison: {
    // Tâches de la maison: the kid routines, the corvées (+ projets/entretien
    // behind ChoresTabPanel's own inner tabs), the « à compléter » templates.
    routines: [s('routines', 'household'), s('chores', 'household'), s('todoTemplates', 'household')],
    // La maisonnée: who lives here, and the cercle's groups.
    members: [s('members', 'operator'), s('cercleGroups', 'operator')],
    // L'auto & horaires: the vehicles, and the per-member work hours that drive them.
    cars: [s('cars', 'household'), s('schedule', 'household')],
    annee: [s('houseDiary', 'household')],
  },
  settings: {
    // Appareils, accès & diagnostics: pairing + tablets + guest links (operator),
    // then the machinery any paired device may read about itself.
    tablets: [
      s('claimTablet', 'operator'),
      s('devices', 'operator'),
      s('guestLinks', 'operator'),
      s('health', 'household'),
      s('buildInfo', 'household'),
      s('takeout', 'operator'),
      s('micTest', 'household'),
      s('kbDebug', 'household'),
      s('aiLog', 'household'),
    ],
    // Affichage & veille: everything about how THIS device looks and rests —
    // plus the household's photo frame source, which a guest doesn't get.
    display: [s('display', 'device'), s('ambient', 'device'), s('habits', 'device'), s('photos', 'household'), s('calm', 'device')],
    // Voix & IA: the on-device read-aloud voice (a guest's), and the household's AI switch.
    ai: [s('ai', 'household'), s('voice', 'device')],
  },
} as const satisfies Record<string, Record<string, readonly SettingsSection[]>>

export type SettingsTabId = keyof typeof SETTINGS_TREE
export type SettingsSubId<T extends SettingsTabId = SettingsTabId> = keyof (typeof SETTINGS_TREE)[T] & string
/** Every section key in the tree — the exhaustive set Operator's node map is typed against. */
export type SettingsSectionKey = (typeof SETTINGS_TREE)[SettingsTabId][SettingsSubId][number]['key']

// Every themed tab's sub ids, in pill order — derived, so the ids can't drift from
// the tree. `SETTINGS_SUBS[tab]` keeps the literal-union type Operator's label map
// is checked against (a sub with no label, or a label for no sub, fails tsc).
export const SETTINGS_SUBS = Object.fromEntries(
  Object.entries(SETTINGS_TREE).map(([tab, subs]) => [tab, Object.keys(subs)]),
) as unknown as { readonly [T in SettingsTabId]: readonly SettingsSubId<T>[] }

// The i18n key (under `t.operator`) each pill wears. Kept here, beside the ids, so a
// merge renames its pill in the same edit that moves its sections.
export const SUB_LABEL_KEY = {
  board: { events: 'subAgendaWeek', layout: 'boardLayout' },
  kitchen: { apparence: 'kitchenLookTitle', meals: 'mealColors', reserve: 'reserveTitle' },
  liste: { shop: 'shopping', history: 'subHistoryTracking' },
  maison: { routines: 'subHomeTasks', members: 'members', cars: 'subCarsHours', annee: 'diaryTab' },
  settings: { tablets: 'subDevicesAccess', display: 'subDisplayIdle', ai: 'subVoiceAi' },
} as const satisfies { [T in SettingsTabId]: { [S in SettingsSubId<T>]: string } }

// Retired ?sub= ids WITHIN a still-current tab → the sub that hosts them now, so
// every bookmark, guide link and spec written against an old pill keeps landing.
// Forward-only, like migrations: an id that ever existed stays here. (Retired TAB
// ids are LEGACY_TAB in pages/Operator.tsx — a different, older fold.)
//   · 2026-07-08 (C-15): kitchen's three colour subs → « Apparence ».
//   · 2026-09-08 (28 → 14): every other entry.
export const LEGACY_SUB: { readonly [T in SettingsTabId]?: Readonly<Record<string, SettingsSubId<T>>> } = {
  board: { thisweek: 'events' },
  kitchen: { tags: 'apparence', pills: 'apparence', measure: 'apparence' },
  liste: { aisles: 'shop', stores: 'shop', ghost: 'history' },
  maison: { chores: 'routines', todos: 'routines', cercle: 'members', schedule: 'cars' },
  settings: { guest: 'tablets', system: 'tablets', ambient: 'display', photos: 'display', calm: 'display', voice: 'ai' },
}

// Every retired TAB id → the themed tab (and sub) that hosts it now, so ANY old
// /settings?tab=… link still lands. `bySub` handles the three old tabs whose subs
// split across themes (agenda, display, ai): the raw ?sub= picks the real target.
// Targets name LIVE subs (guideLinks.test.ts checks); a retired sub in the URL is
// LEGACY_SUB's job, applied by Operator after this fold.
//   · the 9 old task tabs, then the 12 previously-retired ids;
//   · 'cercle' and 'routines' briefly graduated to real tabs, then were demoted
//     back to aliases when Le cercle + Routines merged into ONE Maison tab.
export const LEGACY_TAB: Readonly<
  Record<string, { tab: SettingsTabId | 'decouvrir'; sub?: string; bySub?: Readonly<Record<string, { tab: SettingsTabId; sub: string }>> }>
> = {
  guide: { tab: 'decouvrir' },
  household: { tab: 'maison', sub: 'members' },
  devices: { tab: 'settings', sub: 'tablets' },
  agenda: {
    tab: 'board',
    sub: 'events',
    bySub: { cars: { tab: 'maison', sub: 'cars' }, schedule: { tab: 'maison', sub: 'cars' } },
  },
  chores: { tab: 'maison', sub: 'routines' },
  recipes: { tab: 'kitchen', sub: 'apparence' },
  shopping: { tab: 'liste', sub: 'shop' },
  display: { tab: 'settings', sub: 'display', bySub: { layout: { tab: 'board', sub: 'layout' } } },
  ai: { tab: 'settings', sub: 'ai', bySub: { thisweek: { tab: 'board', sub: 'events' } } },
  guest: { tab: 'settings', sub: 'tablets' },
  auto: { tab: 'maison', sub: 'cars' },
  todos: { tab: 'maison', sub: 'routines' },
  meals: { tab: 'kitchen', sub: 'meals' },
  reserve: { tab: 'kitchen', sub: 'reserve' },
  ghost: { tab: 'liste', sub: 'history' },
  calm: { tab: 'settings', sub: 'display' },
  photos: { tab: 'settings', sub: 'display' },
  week: { tab: 'board', sub: 'events' },
  'ai-log': { tab: 'settings', sub: 'tablets' },
  cercle: { tab: 'maison', sub: 'members' },
  routines: { tab: 'maison', sub: 'routines' },
}

/** Every retired sub id, flat — what a guard greps a spec or a link for. */
export const RETIRED_SUB_IDS: ReadonlySet<string> = new Set(
  Object.values(LEGACY_SUB).flatMap((m) => Object.keys(m ?? {})),
)

// ?focus= targets — which section keys are anchored under each `tab/sub`
// (`id="op-<key>"` from OperatorSection). Derived: every section in the tree. A
// guide « Régler » link into a stacked sub names one of these so it lands on the
// exact card (guideLinks.test.ts insists on it once a sub stacks two or more).
export const SETTINGS_FOCUS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(SETTINGS_TREE).flatMap(([tab, subs]) =>
    Object.entries(subs).map(([sub, sections]) => [`${tab}/${sub}`, (sections as readonly SettingsSection[]).map((x) => x.key)]),
  ),
)

// Flat set of every focusable key — what OperatorSection checks before minting an anchor.
export const FOCUSABLE_HELP_KEYS: ReadonlySet<string> = new Set(Object.values(SETTINGS_FOCUS).flat())

/** The sub that holds a section today — so a link may say `?focus=` alone and let the
 *  sub follow the section wherever the next reshuffle puts it. */
export function subOfFocus(tab: string, focus: string): string | undefined {
  const subs = SETTINGS_TREE[tab as SettingsTabId] as Record<string, readonly SettingsSection[]> | undefined
  if (!subs) return undefined
  return Object.keys(subs).find((sub) => subs[sub].some((x) => x.key === focus))
}

/** The sections of `tab/sub` this viewer may see. `guest` = a read-only link guest
 *  (device-local cards only); `operator` = the signed-in operator (everything);
 *  neither = a paired kiosk (everything but the operator-only cards). */
export function visibleSections(
  tab: SettingsTabId,
  sub: string,
  viewer: { guest: boolean; operator: boolean },
): readonly SettingsSection[] {
  const subs = SETTINGS_TREE[tab] as Record<string, readonly SettingsSection[]>
  const all = subs[sub] ?? []
  if (viewer.guest) return all.filter((x) => x.access === 'device')
  if (!viewer.operator) return all.filter((x) => x.access !== 'operator')
  return all
}

/** The subs of `tab` this viewer gets a pill for — those with ≥ 1 visible section. */
export function visibleSubs<T extends SettingsTabId>(tab: T, viewer: { guest: boolean; operator: boolean }): SettingsSubId<T>[] {
  return SETTINGS_SUBS[tab].filter((sub) => visibleSections(tab, sub, viewer).length > 0)
}

/** Build a /settings URL. Prefer naming the SECTION (`focus`) over the sub: the sub is
 *  then derived, and the link survives the next pill reshuffle untouched. */
export function settingsHref(
  target: { tab: SettingsTabId | 'decouvrir'; sub?: string; focus?: string; lens?: 'comprendre' | 'regler' },
): string {
  const p = new URLSearchParams()
  p.set('tab', target.tab)
  if (target.lens) p.set('lens', target.lens)
  const sub = target.sub ?? (target.focus && target.tab !== 'decouvrir' ? subOfFocus(target.tab, target.focus) : undefined)
  if (sub) p.set('sub', sub)
  if (target.focus) p.set('focus', target.focus)
  return `/settings?${p.toString()}`
}

// « Voir dans l'app » — the standard way back from a Réglages sub to the live
// surface it configures (the board▸Disposition ↔ /board?edit=1 mirror,
// generalized). Key is `<tab>/<sub>`; subs with no obvious live counterpart
// (pairing, display machinery…) simply have no entry.
export const SUB_GOTO: Readonly<Record<string, string>> = {
  'board/events': '/board',
  'board/layout': '/board?edit=1',
  'kitchen/apparence': '/kitchen',
  'kitchen/meals': '/kitchen',
  'kitchen/reserve': '/kitchen',
  'liste/shop': '/liste',
  'liste/history': '/liste',
  'maison/routines': '/maison',
  'maison/members': '/maison?section=family',
  'maison/cars': '/voiture',
  'settings/display': '/board',
}

// Every path prefix a guide route/point link may target — mirrors the route
// table in src/router.tsx (keep in sync when adding a scene). guideLinks.test.ts
// rejects any guide link whose path doesn't start with one of these, so a typo'd
// or retired route fails the build instead of 404ing a curious parent.
export const ROUTE_PREFIXES: readonly string[] = [
  '/board',
  '/kitchen',
  '/maison',
  '/notes',
  '/liste',
  '/settings',
  '/search',
  '/drawings',
  '/voyage',
  '/voiture',
  '/jouer',
  '/event/new',
  '/chore/new',
  '/home-project/new',
  '/routine',
  '/habitude',
  '/cast',
  '/share',
  // The frozen /cercle/* scene paths — old family-share links out in the wild
  // still point at these (person/family/pet builders, a carnet, Notre monde,
  // the vCard import), even though the /cercle hub tab itself is gone.
  '/cercle/person',
  '/cercle/family',
  '/cercle/pet',
  '/cercle/carnet',
  '/cercle/monde',
  '/cercle/import',
]
