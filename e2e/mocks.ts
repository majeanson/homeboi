import type { Page } from '@playwright/test'

// Deterministic API stubs so screenshots render populated, calm surfaces with
// no backend. Shapes mirror the page-level interfaces (Board.tsx, Kitchen.tsx,
// Routines/KidView.tsx, Liste.tsx, Operator.tsx). Timestamps are fixed unix
// seconds — the server already buckets events into today/tomorrow/upcoming, so
// the client renders them under those headings regardless of the wall clock.

const DAY = 86400
// A fixed Monday-ish anchor (2026-06-08 08:00 local-ish). Only relative slotting
// and clock formatting use these; exact values don't matter for visual review.
const BASE = 1_749_369_600 // 2026-06-08T08:00:00Z

const MEMBERS = [
  { id: 'm1', display_name: 'Maman', colour: '#B06A93', is_child: 0 },
  { id: 'm2', display_name: 'Papa', colour: '#5891AC', is_child: 0 },
  { id: 'm3', display_name: 'Léa', colour: '#88A36F', is_child: 1 },
  { id: 'm4', display_name: 'Noah', colour: '#F2A03D', is_child: 1 },
]

const BOARD = {
  syncedAt: BASE,
  scope: 'today',
  members: MEMBERS,
  today: [
    { id: 'e0', title: 'Rappel: facture', start_at: BASE + 2 * 3600, all_day: 0, member_id: null },
    { id: 'e1', title: 'Garderie', start_at: BASE + 3600, all_day: 0, member_id: 'm3' },
    { id: 'e2', title: 'Rendez-vous dentiste', start_at: BASE + 6 * 3600, all_day: 0, member_id: 'm4' },
    { id: 'e3', title: 'Soccer', start_at: BASE + 9 * 3600, all_day: 0, member_id: 'm3' },
  ],
  tomorrow: [{ id: 'e4', title: 'Épicerie', start_at: BASE + DAY + 4 * 3600, all_day: 0, member_id: 'm1' }],
  upcoming: [{ id: 'e5', title: 'Fête de Léa', start_at: BASE + 5 * DAY, all_day: 1, member_id: 'm3' }],
  tonight: { id: 'meal1', title: 'Spaghetti maison', cook_member_id: 'm2' },
  tomorrowMeal: { id: 'meal2', title: 'Tacos', cook_member_id: 'm1' },
  list: [
    // l1 carries a staged flyer deal (deal_json) — the cashier set now lives on the
    // list, so this is what drives the "show the cashier" button and the row's ✓.
    {
      id: 'l1',
      text: 'Lait',
      source: 'manual',
      added_by: 'm1',
      deal_json: JSON.stringify({ id: 101, flyerId: 5001, name: 'Lait 2% 4L', price: 4.99, wasPrice: 6.49, unitPrice: 1.25, unitLabel: '/L', unitKind: 'volume', unitApprox: false, merchant: 'Super C', image: null, validFrom: null, validTo: null }),
    },
    { id: 'l2', text: 'Pain', source: 'manual' },
    { id: 'l3', text: 'Pommes', source: 'ghost' },
    { id: 'l4', text: 'Couches', source: 'manual' },
  ],
  chores: [
    {
      id: 'c1',
      title: 'Sortir les poubelles',
      rotation_json: JSON.stringify(['m1', 'm2']),
      current_idx: 0,
      last_done_at: null,
      color: '#88A36F',
      helpers: [{ name: 'Léa', role: 'child' }],
    },
    {
      id: 'c2',
      title: 'Vaisselle',
      rotation_json: JSON.stringify(['m2', 'm1']),
      current_idx: 1,
      last_done_at: BASE - DAY,
      color: '#7BB0C9',
      helpers: [],
    },
  ],
}

const MEALS = {
  weekStart: BASE - 0 * DAY,
  days: [
    { id: 'meal1', date: BASE, title: 'Spaghetti maison', cook_member_id: 'm2' },
    { id: 'meal2', date: BASE + DAY, title: 'Tacos', cook_member_id: 'm1' },
    { id: 'meal3', date: BASE + 3 * DAY, title: 'Saumon & riz', cook_member_id: 'm2' },
  ],
}

const PANTRY = {
  low: [
    { id: 'p1', item: 'Beurre', marked_at: BASE - 2 * 3600 },
    { id: 'p2', item: 'Café', marked_at: BASE - 5 * 3600 },
    { id: 'p3', item: 'Papier hygiénique', marked_at: BASE - DAY },
  ],
}

// Cards store an emoji (the CardDeckEditor palette / DECK_EMOJIS), NOT a named
// icon — KidView renders card.icon as text, so the fixture must use real emoji.
const ROUTINE_CARDS = [
  { icon: '👕', label: 'Habille-toi', narration: "C'est l'heure de s'habiller" },
  { icon: '🥞', label: 'Déjeuner' },
  { icon: '🪥', label: 'Brosse tes dents' },
  { icon: '🎒', label: 'Sac à dos' },
]

// One object that satisfies BOTH the parent RoutineRow (name/memberName/cards)
// and the toddler Routine (color/avatarPhoto/cards[].icon/doneIdx).
const ROUTINES = {
  routines: [
    {
      id: 'r1',
      name: 'Matin',
      memberName: 'Léa',
      color: '#88A36F',
      avatarPhoto: null,
      cards: ROUTINE_CARDS,
      doneIdx: [0],
    },
    {
      id: 'r2',
      name: 'Dodo',
      memberName: 'Noah',
      color: '#F2A03D',
      avatarPhoto: null,
      cards: ROUTINE_CARDS.slice(0, 3),
      doneIdx: [],
    },
  ],
}

// image null → the card shows the 🍳 placeholder (offline-safe; a remote URL
// wouldn't load in the frontend-only harness).
const RECIPES = {
  recipes: [
    {
      id: 'rc1',
      title: 'Spaghetti maison',
      ingredients: ['400 g de pâtes', '1 pot de sauce tomate', '500 g de bœuf haché', '1 oignon'],
      steps: ['Faire bouillir les pâtes 10 minutes.', 'Faire revenir le bœuf et l’oignon.', 'Ajouter la sauce et mijoter 20 minutes.'],
      servings: 4,
      notes: 'Ajoute du parmesan au service.',
      source: null,
      image: null,
      tags: ['rapide', 'préféré'],
      updatedAt: BASE - DAY,
    },
    {
      id: 'rc2',
      title: 'Tacos au poulet',
      ingredients: ['Tortillas', 'Poitrines de poulet', 'Salsa', 'Laitue', 'Fromage râpé'],
      steps: ['Cuire le poulet en lanières.', 'Garnir les tortillas.'],
      servings: 4,
      notes: null,
      source: 'https://exemple.ca/tacos',
      image: null,
      tags: ['rapide'],
      updatedAt: BASE - 2 * DAY,
    },
    {
      id: 'rc3',
      title: 'Saumon & riz',
      ingredients: ['Filets de saumon', 'Riz', 'Citron', 'Brocoli'],
      steps: ['Cuire le riz.', 'Griller le saumon.', 'Vapeur le brocoli.'],
      servings: 2,
      notes: null,
      source: null,
      image: null,
      tags: [],
      updatedAt: BASE - 3 * DAY,
    },
  ],
}

const GHOSTS = {
  ghosts: [
    { key: 'lait', label: 'Lait', status: 'due', cadenceDays: 5, lastAt: BASE - 6 * DAY, count: 12 },
    { key: 'oeufs', label: 'Œufs', status: 'soon', cadenceDays: 7, lastAt: BASE - 5 * DAY, count: 8 },
  ],
}

const GHOST_MANAGE = {
  items: [
    { key: 'lait', label: 'Lait', cadenceDays: 5, source: 'staple', muted: false, count: 12, lastAt: BASE - 6 * DAY },
    { key: 'oeufs', label: 'Œufs', cadenceDays: 7, source: 'learned', muted: false, count: 8, lastAt: BASE - 5 * DAY },
    { key: 'café', label: 'Café', cadenceDays: 14, source: 'manual', muted: true, count: 3, lastAt: null },
  ],
}

const CHORES = {
  chores: [
    { id: 'c1', title: 'Sortir les poubelles', rotation_json: JSON.stringify(['m1', 'm2']), current_idx: 0, last_done_at: null, color: '#88A36F' },
    { id: 'c2', title: 'Vaisselle', rotation_json: JSON.stringify(['m2', 'm1']), current_idx: 1, last_done_at: BASE - DAY, color: '#7BB0C9' },
  ],
}

const EVENTS = {
  events: [
    { id: 'e1', title: 'Garderie', start_at: BASE + 3600, all_day: 0, member_id: 'm3' },
    { id: 'e5', title: 'Fête de Léa', start_at: BASE + 5 * DAY, all_day: 1, member_id: 'm3' },
  ],
}

const DEVICES = {
  devices: [
    { id: 'd1', label: 'Tablette cuisine', last_seen_at: BASE - 600, created_at: BASE - 30 * DAY },
  ],
}

const AUTH_ME = {
  signedIn: true,
  email: 'famille@exemple.ca',
  household: { id: 'h1', name: 'Maison Tremblay', tier: 'free' },
}

// Map of route suffix (after /api/) -> JSON body. Matched by pathname start so
// query strings (?view=manage, ?id=…) still hit. GET only; writes get a generic ok.
const ROUTES: Record<string, unknown> = {
  'auth/me': AUTH_ME,
  board: BOARD,
  weather: { weather: { tempC: 21, bucket: 'clear', isDay: true }, tomorrow: { bucket: 'rain', highC: 18, lowC: 11 } },
  photos: { photos: [] },
  meals: MEALS,
  pantry: PANTRY,
  'use-soon': { soon: [{ id: 'u1', item: 'Épinards', marked_at: BASE - 3 * 3600 }, { id: 'u2', item: 'Crème', marked_at: BASE - 8 * 3600 }] },
  recipes: RECIPES,
  routines: ROUTINES,
  members: { members: MEMBERS },
  'pair/devices': DEVICES,
  chores: CHORES,
  events: EVENTS,
  health: { ai: true },
  household: { postal: 'H2X 1Y4' },
  deals: {
    deals: [
      { id: 101, flyerId: 5001, name: 'Lait 2% 4L', price: 4.99, wasPrice: 6.49, unitPrice: 1.25, unitLabel: '/L', unitKind: 'volume', unitApprox: false, merchant: 'Super C', image: null, validFrom: null, validTo: BASE + 5 * DAY },
      { id: 102, flyerId: 5002, name: 'Lait 1% 2L', price: 2.99, wasPrice: null, unitPrice: 1.5, unitLabel: '/L', unitKind: 'volume', unitApprox: false, merchant: 'IGA', image: null, validFrom: null, validTo: BASE + 5 * DAY },
    ],
  },
  flyers: {
    flyers: [
      { flyerId: 5001, merchant: 'Super C', logo: null, validFrom: null, validTo: null },
      { flyerId: 5002, merchant: 'IGA', logo: null, validFrom: null, validTo: null },
    ],
  },
  flyer: {
    flyerId: 5001,
    pages: [{ id: 1, page: 1, left: 0, top: 0, right: 100, bottom: -100 }],
    items: [{ id: 101, name: 'Lait 2% 4L', price: 4.99, unitPrice: 1.25, unitLabel: '/L', unitKind: 'volume', validFrom: null, validTo: null, image: null, left: 10, top: -10, right: 40, bottom: -40 }],
  },
  ghost: GHOSTS,
  recap: { recap: 'Belle semaine : 3 soupers planifiés, 2 sorties, liste à jour.' },
}

// signedIn defaults true (the populated household). Pass { signedIn: false } to
// simulate a brand-new visitor — used by the `/` marketing-page screenshot, since
// the smart entry only shows marketing when nobody's signed in.
export async function mockApi(page: Page, opts: { signedIn?: boolean } = {}) {
  const signedIn = opts.signedIn ?? true
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api\//, '')
    const method = route.request().method()

    if (method !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    if (path === 'auth/me') {
      const body = signedIn ? AUTH_ME : { signedIn: false }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      return
    }

    // ghost?view=manage is a distinct shape.
    if (path === 'ghost' && url.searchParams.get('view') === 'manage') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GHOST_MANAGE) })
      return
    }

    // Longest-prefix match so 'pair/devices' wins over 'pair'.
    const key = Object.keys(ROUTES)
      .filter((k) => path === k || path.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0]

    if (key) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROUTES[key]) })
      return
    }

    // Unknown GET → empty object (keeps the UI from hanging on a real fetch).
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

export type Theme = 'day' | 'night'
export type Audience = 'parent' | 'toddler'
export type Lang = 'fr' | 'en'
export type Surface = 'kiosk' | 'mobile'

export interface AppState {
  theme?: Theme
  audience?: Audience
  lang?: Lang
  calm?: boolean
  // The device role. When set, the `/` smart entry treats the device as "chosen"
  // and skips the marketing page. Leave undefined to exercise a first-time visitor.
  surface?: Surface
  // The parent board layout (bento | next | lanes). Defaults to bento when unset.
  boardView?: 'bento' | 'next' | 'lanes'
}

// Seed localStorage BEFORE any document script runs, so theme-bootstrap.js picks
// the right surface on first paint (no wrong-theme flash) and main.tsx reads the
// audience/lang/calm/surface we want.
export async function seedState(page: Page, s: AppState) {
  await page.addInitScript((state) => {
    try {
      if (state.theme) localStorage.setItem('babillard-theme', state.theme)
      if (state.audience) localStorage.setItem('babillard-audience', state.audience)
      if (state.lang) localStorage.setItem('babillard-lang', state.lang)
      if (state.calm !== undefined) localStorage.setItem('babillard-calm', state.calm ? 'on' : 'off')
      if (state.surface) localStorage.setItem('babillard-surface', state.surface)
      if (state.boardView) localStorage.setItem('babillard-boardview', state.boardView)
    } catch {
      /* noop */
    }
  }, s)
}
