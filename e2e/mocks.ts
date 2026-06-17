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
// Local midnight (America/Toronto, the household TZ) of BASE's day. The meal week
// + month grids bucket meals at LOCAL midnight (src/lib/localDay addLocalDays), so
// the fixture's meal `date`s must be local-midnight-aligned or they fall off the
// grid entirely (every kitchen day would render empty).
const MMID = 1_749_355_200 // 2026-06-08T00:00:00-04:00
// An ISO date N days from the real clock — for flyer run dates, since the store
// browser's current/upcoming split keys on the live Date.now() (not BASE).
const flyerIso = (days: number): string => new Date(Date.now() + days * DAY * 1000).toISOString()

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
  // ALL of today's suppers — "Ce soir" lists every one (two here, to exercise it).
  tonightMeals: [
    { id: 'meal1', slot: 'supper', title: 'Spaghetti maison', cook_member_id: 'm2', position: 0 },
    { id: 'meal5', slot: 'supper', title: 'Salade César', cook_member_id: null, position: 1 },
  ],
  tomorrowMeal: { id: 'meal2', title: 'Tacos', cook_member_id: 'm1' },
  // The full per-day meal table + day memo (new board fields; the Now/Next and
  // per-person Lanes views read these). Absent → those views must not crash.
  // Time-ordered (breakfast → supper) with a slot holding two meals.
  todayMeals: [
    { id: 'meal4', slot: 'breakfast', title: 'Crêpes', cook_member_id: null, position: 0 },
    { id: 'meal1', slot: 'supper', title: 'Spaghetti maison', cook_member_id: 'm2', position: 0 },
    { id: 'meal5', slot: 'supper', title: 'Salade César', cook_member_id: null, position: 1 },
  ],
  dayNote: { id: 'dn1', text: 'Sans gluten ce soir', member_id: 'm1' },
  tomorrowMeals: [{ id: 'meal2', slot: 'supper', title: 'Tacos', cook_member_id: 'm1' }],
  tomorrowNote: null,
  list: [
    // l1 carries a staged flyer deal (deal_json) — the cashier set now lives on the
    // list, so this is what drives the "show the cashier" button and the row's ✓.
    {
      id: 'l1',
      text: 'Lait',
      source: 'manual',
      added_by: 'm1',
      deal_json: JSON.stringify({ id: 101, flyerId: 5001, name: 'Lait 2% 4L', price: 4.99, wasPrice: 6.49, unitPrice: 1.25, unitLabel: '/L', unitKind: 'volume', unitApprox: false, merchant: 'Super C', logo: null, premium: true, image: null, validFrom: null, validTo: null }),
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
  notes: [{ id: 'n1', text: 'Bonne chance à ton examen !', member_id: 'm1', created_at: BASE }],
  // A recurring chore due today (Léa's turn) + one coming up later this week.
  choresToday: [{ id: 'c1', title: 'Sortir les poubelles', color: '#88A36F', at: BASE, who: 'Léa' }],
  choresUpcoming: [{ id: 'c2', title: 'Vaisselle', color: '#7BB0C9', at: BASE + 3 * DAY, who: 'Papa' }],
}

const MEALS = {
  weekStart: MMID,
  windowDays: 10, // full 10-day countdown block (see functions/api/meals.ts)
  days: [
    // Linked to the saved recipe rc1 (recipe_id) — the grid's 📖 opens it exactly.
    { id: 'meal1', date: MMID, slot: 'supper', title: 'Spaghetti maison', cook_member_id: 'm2', recipe_id: 'rc1', position: 0 },
    // A SECOND supper in the same slot (N per slot) — the grid lists both, each
    // with its own ✕ / ↑↓.
    { id: 'meal5', date: MMID, slot: 'supper', title: 'Salade César', cook_member_id: null, position: 1 },
    { id: 'meal2', date: MMID + DAY, slot: 'supper', title: 'Tacos', cook_member_id: 'm1', position: 0 },
    // A kid-suggested supper (Léa, m3) sitting in a slot that was empty — shows the
    // "💡 Léa" note in the parent week. cook is null until a parent decides.
    { id: 'meal3', date: MMID + 3 * DAY, slot: 'supper', title: 'Saumon & riz', cook_member_id: null, suggested_by: 'm3', position: 0 },
    // A déjeuner (breakfast) side slot on day one.
    { id: 'meal4', date: MMID, slot: 'breakfast', title: 'Crêpes', cook_member_id: null, position: 0 },
  ],
  // The last few days of non-leftover meals (deduped by title) — the Restants
  // "Suggestions" quick-pick source (see functions/api/meals.ts `recent`).
  recent: [
    { id: 'meal1', date: MMID, slot: 'supper', title: 'Spaghetti maison', cook_member_id: 'm2', recipe_id: 'rc1', position: 0 },
    { id: 'meal5', date: MMID, slot: 'supper', title: 'Salade César', cook_member_id: null, position: 1 },
    { id: 'meal4', date: MMID, slot: 'breakfast', title: 'Crêpes', cook_member_id: null, position: 0 },
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
      timeOfDay: 'morning',
      cards: ROUTINE_CARDS,
      doneIdx: [0],
    },
    {
      id: 'r2',
      name: 'Dodo',
      memberName: 'Noah',
      color: '#F2A03D',
      avatarPhoto: null,
      timeOfDay: 'evening',
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
      ingredients: ['400 g de pâtes', '1 pot de sauce tomate', '500 g de bœuf haché', '1 oignon', '15 ml (1 c. à soupe) d’huile d’olive', '1 c. à thé de sel', '1/4 c. à thé de poivre'],
      steps: ['Faire bouillir les pâtes 10 minutes.', 'Faire revenir le bœuf et l’oignon.', 'Ajouter la sauce et mijoter 20 minutes.'],
      servings: 4,
      prepMin: 15,
      cookMin: 30,
      totalMin: null,
      notes: 'Ajoute du parmesan au service.',
      source: null,
      image: null,
      tags: ['rapide', 'préféré'],
      updatedAt: BASE - DAY,
    },
    // Sectioned recipe ("## " markers) + a named yield unit — exercises the
    // grouped sheet/cook-mode rendering and the "24 biscuits" servings label.
    {
      id: 'rc4',
      title: 'Biscuits glacés',
      ingredients: [
        '## Biscuits',
        '250 g de farine',
        '125 g de beurre mou',
        '100 g de sucre',
        '1 œuf',
        '## Glaçage',
        '120 g de sucre en poudre',
        '30 ml de lait',
      ],
      steps: [
        '## Biscuits',
        'Crémer le beurre et le sucre.',
        'Incorporer l’œuf, puis la farine.',
        'Cuire 12 minutes à 180 °C.',
        '## Glaçage',
        'Fouetter le sucre en poudre et le lait.',
        'Étaler sur les biscuits refroidis.',
      ],
      servings: 24,
      servingsUnit: 'biscuits',
      prepMin: 20,
      cookMin: 12,
      totalMin: null,
      notes: null,
      source: null,
      image: null,
      tags: ['dessert'],
      updatedAt: BASE - DAY / 2,
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
    // Tracked but nowhere near renewal — rendered as a quiet untagged chip.
    { key: 'cafe', label: 'Café', status: 'later', cadenceDays: 14, lastAt: BASE - 2 * DAY, count: 3 },
  ],
}

// list?view=history — everything the household has added/bought before; feeds
// the add bar's typeahead chips. 'Beurre' also sits on the done shelf above.
const LIST_HISTORY = {
  items: [
    // Beurre carries its last flyer synonyms — a quick-add re-add must restock them.
    { key: 'beurre', text: 'Beurre', count: 5, lastAt: BASE - 3600, searchTerms: '["beurre","butter"]' },
    { key: 'yogourt grec', text: 'Yogourt grec', count: 4, lastAt: BASE - 2 * DAY, searchTerms: null },
    { key: 'bananes', text: 'Bananes', count: 3, lastAt: BASE - 4 * DAY, searchTerms: null },
  ],
}

const GHOST_MANAGE = {
  // Tracking is conscious: only staples + operator-added rows appear as items;
  // frequent untracked buys are offered separately as opt-in candidates.
  items: [
    { key: 'lait', label: 'Lait', cadenceDays: 5, source: 'staple', muted: false, count: 12, lastAt: BASE - 6 * DAY },
    { key: 'oeufs', label: 'Œufs', cadenceDays: 7, source: 'staple', muted: false, count: 8, lastAt: BASE - 5 * DAY },
    { key: 'café', label: 'Café', cadenceDays: 14, source: 'manual', muted: true, count: 3, lastAt: null },
  ],
  candidates: [
    { key: 'yogourt', label: 'Yogourt grec', count: 4, cadenceDays: 9 },
    { key: 'bananes', label: 'Bananes', count: 3, cadenceDays: 6 },
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
  'meal-ideas': {
    ideas: [
      { id: 'idea1', title: 'Soupe poulet-nouilles', recipe_id: null, suggested_by: null, created_at: BASE - DAY },
      // A recipe-linked idea (rc1) — shows the 📖 marker in the pool.
      { id: 'idea2', title: 'Spaghetti maison', recipe_id: 'rc1', suggested_by: 'm3', created_at: BASE - 2 * DAY },
    ],
  },
  pantry: PANTRY,
  'use-soon': { soon: [{ id: 'u1', item: 'Épinards', marked_at: BASE - 3 * 3600 }, { id: 'u2', item: 'Crème', marked_at: BASE - 8 * 3600 }] },
  // Per-day kitchen memos (La cuisine grid). One note on day-one so the feature
  // renders; an empty/absent `notes` must never crash the page (Kitchen guards it).
  'day-notes': { notes: [{ id: 'dn1', date: BASE, text: 'Sans gluten ce soir', member_id: 'm1' }] },
  // AI-failure journal (Réglages). Empty is the normal, healthy state.
  'ai-errors': { errors: [] },
  recipes: RECIPES,
  'recipe-tags': {
    presets: [],
    used: [
      { tag: 'rapide', count: 2 },
      { tag: 'préféré', count: 1 },
      { tag: 'Collation', count: 1 },
    ],
    colors: { rapide: '#88a36f' },
  },
  routines: ROUTINES,
  members: { members: MEMBERS },
  'pair/devices': DEVICES,
  chores: CHORES,
  events: EVENTS,
  health: { ai: true },
  household: { postal: 'H2X 1Y4', includedStores: [] },
  deals: {
    deals: [
      { id: 101, flyerId: 5001, name: 'Lait 2% 4L', price: 4.99, wasPrice: 6.49, unitPrice: 1.25, unitLabel: '/L', unitKind: 'volume', unitApprox: false, merchant: 'Super C', logo: null, premium: true, image: null, validFrom: null, validTo: BASE + 5 * DAY },
      { id: 102, flyerId: 5002, name: 'Lait 1% 2L', price: 2.99, wasPrice: null, unitPrice: 1.5, unitLabel: '/L', unitKind: 'volume', unitApprox: false, merchant: 'IGA', logo: null, premium: true, image: null, validFrom: null, validTo: BASE + 5 * DAY },
    ],
  },
  flyers: {
    // Dates are relative to the real clock (the store browser splits current vs
    // upcoming by Date.now(), which these tests don't freeze): two flyers in effect
    // this week + one IGA flyer Flipp already published for next week (future start).
    flyers: [
      { flyerId: 5001, merchant: 'Super C', logo: null, premium: true, validFrom: flyerIso(-1), validTo: flyerIso(5) },
      { flyerId: 5002, merchant: 'IGA', logo: null, premium: true, validFrom: flyerIso(-1), validTo: flyerIso(5) },
      { flyerId: 5003, merchant: 'IGA', logo: null, premium: false, validFrom: flyerIso(7), validTo: flyerIso(13) },
    ],
  },
  flyer: {
    flyerId: 5001,
    postal: 'H2X1Y4',
    // ISO strings (not the unix-seconds BASE) so the viewer's date header renders a
    // real range, like the live feed — the rest of the mock uses seconds for slotting.
    validFrom: '2026-06-11T00:00:00-04:00',
    validTo: '2026-06-17T23:59:59-04:00',
    // Page 1 carries the item; page 2 is an empty cover/feature page (no item
    // clippings) — premium flyers open on one of these, and the viewer must SKIP
    // it instead of rendering a blank white box (the "blank pages" bug).
    pages: [
      { id: 1, page: 1, left: 0, top: 0, right: 100, bottom: -100 },
      { id: 2, page: 2, left: 100, top: 0, right: 200, bottom: -100 },
    ],
    // A tiny inline SVG so the clipping renders in the offline screenshot.
    items: [{ id: 101, name: 'Lait 2% 4L', price: 4.99, unitPrice: 1.25, unitLabel: '/L', unitKind: 'volume', validFrom: null, validTo: null, image: 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 viewBox%3D%220 0 60 60%22%3E%3Crect width%3D%2260%22 height%3D%2260%22 fill%3D%22%23cfe8d6%22%2F%3E%3Ctext x%3D%2230%22 y%3D%2235%22 font-size%3D%2210%22 text-anchor%3D%22middle%22%3E🥛%3C%2Ftext%3E%3C%2Fsvg%3E', left: 10, top: -10, right: 40, bottom: -40 }],
  },
  ghost: GHOSTS,
  recap: { recap: 'Belle semaine : 3 soupers planifiés, 2 sorties, liste à jour.' },
}

// signedIn defaults true (the populated household). Pass { signedIn: false } to
// simulate a brand-new visitor — used by the `/` marketing-page screenshot, since
// the smart entry only shows marketing when nobody's signed in.
// `unauthorized: true` 401s every data route (auth/me and health stay 200) —
// simulates a revoked device token / dead session for the recovery flows.
// `fresh: true` empties members + board — the just-signed-up household.
// `longText: true` stuffs every text-ish field with a long phrase + an unbreakable
// long word — a layout stress test for truncation / overflow / word-break.
export async function mockApi(page: Page, opts: { signedIn?: boolean; unauthorized?: boolean; fresh?: boolean; longText?: boolean } = {}) {
  const signedIn = opts.signedIn ?? true
  // Deep-replace user-content strings with a worst-case value: a real long phrase
  // (wrap stress) plus an unbreakable word (word-break / overflow stress).
  const LONG = 'à la bolognaise maison avec béchamel gratinée Supercalifragilisticexpialidocieux'
  const TEXT_KEYS = new Set(['display_name', 'title', 'text', 'name', 'label', 'merchant', 'memberName'])
  const longify = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(longify)
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        o[k] = typeof val === 'string' && TEXT_KEYS.has(k) && val ? `${val} ${LONG}` : longify(val)
      }
      return o
    }
    return v
  }
  // Silence on-device read-aloud (src/lib/speak.ts). Toddler surfaces narrate on
  // every tap via window.speechSynthesis, which routes through the OS voice and is
  // audible while e2e drives the browser. No-op ONLY `speak` (and `cancel`) — leave
  // getVoices()/hasVoiceFor() intact so the 🔊 affordances render identically in
  // screenshots; we suppress the audio, not the feature.
  await page.addInitScript(() => {
    try {
      const ss = window.speechSynthesis
      if (ss) {
        ss.speak = () => {}
        ss.cancel = () => {}
      }
    } catch {
      /* no speech support — nothing to silence */
    }
  })
  const serve = (body: unknown) => JSON.stringify(opts.longText ? longify(body) : body)
  // A little server-side state so optimistic flows that DELETE then refetch read
  // back the change (else the board GET would resurrect a just-cleared note).
  const dismissedNotes = new Set<string>()
  // The list is one active list: a check is a MARK (the item stays, checked_at
  // set), and "Clear checked" removes the ticked ones. Track both so the board
  // refetch confirms the optimistic UI rather than reverting it.
  const checkedItems = new Set<string>()
  const clearedItems = new Set<string>()
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api\//, '')
    const method = route.request().method()

    if (opts.unauthorized && path !== 'auth/me' && path !== 'health') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Non autorisé' }) })
      return
    }

    if (method !== 'GET') {
      // Record a note clear so the next board read reflects it (realistic soft-delete).
      if (method === 'DELETE' && path === 'notes') {
        try {
          const body = JSON.parse(route.request().postData() || '{}')
          if (body.id) dismissedNotes.add(body.id)
        } catch {
          /* no body */
        }
      }
      // Record list writes so the next board read confirms the optimistic UI: a
      // check marks in place (checked_at), clearChecked removes the ticked rows.
      if (method === 'PATCH' && path === 'list') {
        try {
          const body = JSON.parse(route.request().postData() || '{}')
          if (body.clearChecked) {
            const ids = Array.isArray(body.ids) ? body.ids : [...checkedItems]
            ids.forEach((id: string) => {
              clearedItems.add(id)
              checkedItems.delete(id)
            })
          } else if (body.id && body.checked === true) checkedItems.add(body.id)
          else if (body.id && body.checked === false) checkedItems.delete(body.id)
        } catch {
          /* no body */
        }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    if (path === 'auth/me') {
      const body = signedIn ? AUTH_ME : { signedIn: false }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      return
    }

    if (opts.fresh && path === 'members') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: [] }) })
      return
    }
    if (opts.fresh && path === 'board') {
      const empty = { ...BOARD, members: [], today: [], tomorrow: [], upcoming: [], tonight: null, tonightMeals: [], tomorrowMeal: null, todayMeals: [], dayNote: null, tomorrowMeals: [], tomorrowNote: null, list: [], chores: [], notes: [], choresToday: [], choresUpcoming: [] }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty) })
      return
    }

    // ghost?view=manage is a distinct shape.
    if (path === 'ghost' && url.searchParams.get('view') === 'manage') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GHOST_MANAGE) })
      return
    }

    // list?view=history is a distinct shape (the add bar's typeahead haystack).
    if (path === 'list' && url.searchParams.get('view') === 'history') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_HISTORY) })
      return
    }

    // Board read reflects this session's writes (cleared notes, list checks +
    // clears), so an optimistic UI's refetch confirms instead of reverting. A
    // checked row STAYS on the list with checked_at set; a cleared row is gone.
    if (path === 'board' && (dismissedNotes.size || checkedItems.size || clearedItems.size)) {
      const b = {
        ...BOARD,
        notes: BOARD.notes.filter((n) => !dismissedNotes.has(n.id)),
        list: BOARD.list
          .filter((i) => !clearedItems.has(i.id))
          .map((i) => (checkedItems.has(i.id) ? { ...i, checked_at: BASE } : i)),
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
      return
    }

    // Longest-prefix match so 'pair/devices' wins over 'pair'.
    const key = Object.keys(ROUTES)
      .filter((k) => path === k || path.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0]

    if (key) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: serve(ROUTES[key]) })
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
  // Pretend this device holds a (possibly revoked) device token — pairs with
  // mockApi({ unauthorized: true }) to exercise the pairing-lost recovery.
  paired?: boolean
  // The per-section first-visit welcome cards (SectionIntro). Suppressed by
  // default so screenshots/interaction specs see the real section content, not a
  // first-run card on top — same idea as pre-seeding the tour as "seen". Pass
  // `intros: true` to leave them un-dismissed and exercise the feature.
  intros?: boolean
  // The first-login guided tour (lib/tour.tsx) auto-starts for a signed-in parent
  // when it isn't marked seen — and its centred welcome card sits OVER the page,
  // so every spec that clicks something would time out. Pre-mark it seen by
  // default; pass `tour: true` to leave it un-seeded and exercise the tour itself.
  tour?: boolean
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
      // Pin the day-part ambient drift OFF (feature #1): otherwise the board palette
      // tints by wall-clock time, making every screenshot non-deterministic. Tests
      // assert the fixed day/night palette; the drift is covered by unit tests.
      localStorage.setItem('babillard-daypart-auto', '0')
      if (state.paired) {
        localStorage.setItem('babillard-device-token', 'e2e-device-token')
        localStorage.setItem('babillard-device-household', 'h1')
      }
      // Pre-dismiss the per-section welcome cards unless a test opts in, so they
      // never sit on top of the content a screenshot/interaction spec is after.
      if (!state.intros) {
        localStorage.setItem('babillard-sections-seen', JSON.stringify(['board', 'kitchen', 'routines', 'liste']))
      }
      // Pre-mark the first-login guided tour seen unless a test opts in, so its
      // auto-started welcome card / spotlight never covers the elements a spec is
      // driving — the cause of the whole suite timing out once the tour shipped.
      // (Several specs already seeded this by hand; doing it here covers them all.)
      if (!state.tour) {
        localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
      }
    } catch {
      /* noop */
    }
  }, s)
}
