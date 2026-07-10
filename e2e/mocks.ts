import type { Page } from '@playwright/test'
import { addLocalDays, localDayStart } from '../src/lib/localDay'

// Deterministic API stubs so screenshots render populated, calm surfaces with
// no backend. Shapes mirror the page-level interfaces (Board.tsx, Kitchen.tsx,
// Routines/KidView.tsx, Liste.tsx, Operator.tsx). Timestamps are fixed unix
// seconds — the server already buckets events into today/tomorrow/upcoming, so
// the client renders them under those headings regardless of the wall clock.

const DAY = 86400
// A fixed Monday-ish anchor (2026-06-08 08:00 local-ish). Only relative slotting
// and clock formatting use these; exact values don't matter for visual review.
// Exported so board specs can FREEZE the test clock to this epoch (page.clock
// .setFixedTime) — the board lifecycle (lib/itemLife) folds "past" timed items into
// a collapsed « Déjà passé » disclosure vs the REAL clock, so a spec asserting on a
// timed item (a breakfast meal, the Garderie event) is otherwise time-of-day-flaky.
// Frozen at BASE (04:00 local), every "today" item reads as upcoming-and-live.
export const BASE = 1_749_369_600 // 2025-06-08T08:00:00Z (a fixed PAST anchor, ~a year back)
// Local midnight (America/Toronto, the household TZ) of BASE's day. The meal week
// + month grids bucket meals at LOCAL midnight (src/lib/localDay addLocalDays), so
// the fixture's meal `date`s must be local-midnight-aligned or they fall off the
// grid entirely (every kitchen day would render empty).
// Exported so a spec needing another local-day-keyed fixture (school-year bounds,
// a break window…) can build off the SAME anchor as the frozen clock instead of
// re-deriving a slightly-off local midnight by hand.
export const MMID = 1_749_355_200 // 2026-06-08T00:00:00-04:00
// An ISO date N days from the real clock — for flyer run dates, since the store
// browser's current/upcoming split keys on the live Date.now() (not BASE).
const flyerIso = (days: number): string => new Date(Date.now() + days * DAY * 1000).toISOString()

const MEMBERS = [
  { id: 'm1', display_name: 'Maman', colour: '#B06A93', is_child: 0 },
  { id: 'm2', display_name: 'Papa', colour: '#5891AC', is_child: 0 },
  { id: 'm3', display_name: 'Léa', colour: '#88A36F', is_child: 1 },
  { id: 'm4', display_name: 'Noah', colour: '#F2A03D', is_child: 1 },
]

// Exported so a spec can clone it and serve a richer variant via its own route
// override (e.g. the cashier spec stages deals on several list lines for a true
// multi-tile grid — the default fixture stages just one, and the mock board is
// static so writes can't add more).
export const BOARD = {
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
  choresToday: [{ id: 'c1', title: 'Sortir les poubelles', color: '#88A36F', at: BASE, who: 'Léa', who_id: 'm3' }],
  choresUpcoming: [{ id: 'c2', title: 'Vaisselle', color: '#7BB0C9', at: BASE + 3 * DAY, who: 'Papa', who_id: 'm2' }],
  // One-off to-dos (ChoreInstance shape) — the Aujourd'hui "À faire" card + the
  // alternate board views (Now/Next, Lanes) iterate these, so absent → crash.
  todos: [
    { id: 't1', title: 'Appeler le garagiste', color: null, at: BASE, who: 'Maman', who_id: 'm1' },
    { id: 't2', title: 'Sortir le recyclage', color: '#88A36F', at: BASE, who: null, who_id: null },
  ],
  // Undated leftovers to finish — the "Restants à finir" reminder card.
  leftovers: [{ id: 'lo1', title: 'Pâté chinois' }],
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

// « Mes habitudes » — one habit of each kind, plus a week-quota one. `due_days`
// are LOCAL midnights around MMID, so a spec freezing the clock to BASE sees them
// all due today. `days: []` = nothing marked yet (the check-in scene's start
// state). A household habit (member_id null) and two of Maman's (m1) exercise the
// private-ish face filter.
const HABITS = {
  today: MMID,
  days: [] as unknown[],
  habits: [
    { id: 'hb1', member_id: null, title: 'Marcher dehors', icon: '🚶', colour: '#88A36F', kind: 'do', target: null, unit: '', cadence: 'recur', recur: null, week_times: null, reminders: [540], position: 0, archived: false, due_days: [MMID - DAY, MMID, MMID + DAY] },
    { id: 'hb2', member_id: 'm1', title: 'Boire de l’eau', icon: '💧', colour: '#5891AC', kind: 'count', target: 8, unit: 'verres', cadence: 'recur', recur: null, week_times: null, reminders: [], position: 1, archived: false, due_days: [MMID - DAY, MMID, MMID + DAY] },
    { id: 'hb3', member_id: 'm1', title: 'Cigarettes', icon: '🚬', colour: '#C87941', kind: 'limit', target: 5, unit: '', cadence: 'recur', recur: null, week_times: null, reminders: [], position: 2, archived: false, due_days: [MMID - DAY, MMID, MMID + DAY] },
    { id: 'hb4', member_id: null, title: 'Pas de chocolat', icon: '🍫', colour: '#B06A93', kind: 'avoid', target: null, unit: '', cadence: 'recur', recur: null, week_times: null, reminders: [], position: 3, archived: false, due_days: [MMID - DAY, MMID, MMID + DAY] },
    { id: 'hb5', member_id: null, title: 'Sortie à vélo', icon: '🚲', colour: '#F2A03D', kind: 'do', target: null, unit: '', cadence: 'week', recur: null, week_times: 2, reminders: [], position: 4, archived: false, due_days: [] },
  ],
}

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

// « L'année » horizon (/api/year → YearView). Two constraints the other fixtures
// don't have:
//   • The view's window is [first of THIS month, +12 months) off the live clock and
//     it isn't polled, so BASE (a year in the past) would fall outside it entirely.
//   • Its mini-month dots are keyed by LOCAL-midnight day (lib/monthgrid), so a raw
//     `now + n*86400` misses every grid cell by the clock's time-of-day and paints
//     nothing. Step the same DST-safe way the grid does.
const yearDay = (n: number): number => addLocalDays(localDayStart(new Date()), n)
const YEAR = {
  birthdays: [{ id: 'yb1', name: 'Léa', day: yearDay(12), age: 5, memberId: 'm3' }],
  events: [{ id: 'ye1', title: 'Rendez-vous chez le dentiste', day: yearDay(40) }],
  upkeep: [{ id: 'yu1', kind: 'upkeep', title: 'Pneus d’hiver', color: null, day: yearDay(120) }],
  life: [{ carnetId: 'yc1', name: 'Chauffe-eau', color: null, day: yearDay(220) }],
  trips: [{ id: 'yt1', title: 'Gaspésie', colour: '#2a8f85', start_at: yearDay(20), end_at: yearDay(27) }],
}

const DEVICES = {
  devices: [
    { id: 'd1', label: 'Tablette cuisine', last_seen_at: BASE - 600, created_at: BASE - 30 * DAY },
  ],
}

// « L'auto » (#28) read model — the board AutoCard reads today, /voiture reads a
// week. A populated model so the board's L'auto glance card and the /voiture editor
// both render with real content. `today` MUST equal a days[].day or AutoCard finds
// no day. NOTE: this also makes the board mount the AutoCard (the old empty `{}`
// fallthrough left it absent — and would in fact have CRASHED AutoCardView's
// model.days.find if it had mounted); the real shape is the safe, covered state.
const CAR = {
  cars: [{ id: 'car1', name: 'La familiale', color: '#5891AC' }],
  hasSchedule: true,
  now: BASE,
  today: MMID,
  status: { free: false, until: BASE + 9 * 3600, span: { start: BASE - 3600, end: BASE + 9 * 3600, label: 'Travail', holderId: 'm2' }, committed: true },
  membersOut: ['m2'],
  days: [
    {
      day: MMID,
      spans: [{ start: MMID + 8 * 3600, end: MMID + 17 * 3600, label: 'Travail', holderId: 'm2' }],
      rides: [{ id: 'ride1', title: 'Soccer de Léa', at: MMID + 18 * 3600, allDay: 0, carId: 'car1', passengers: ['m3'], memberId: 'm1', contactId: null, contactName: null, businessId: null, businessName: null, conflict: false }],
      override: null,
    },
    {
      day: MMID + DAY,
      spans: [{ start: MMID + DAY + 8 * 3600, end: MMID + DAY + 16 * 3600, label: 'Travail', holderId: 'm2' }],
      rides: [],
      override: null,
    },
    {
      day: MMID + 2 * DAY,
      spans: [],
      rides: [{ id: 'ride2', title: 'Rendez-vous dentiste', at: MMID + 2 * DAY + 14 * 3600, allDay: 0, carId: 'car1', passengers: ['m4'], memberId: 'm1', contactId: null, contactName: null, businessId: null, businessName: null, conflict: false }],
      override: null,
    },
  ],
}

// « À compléter » (#17) — the real todos list, served at /api/todos (board glance =
// global + today). The departure screen renders these via the shared TodoSection, so
// it populates instead of sitting on its empty state. Two standing items.
const TODOS = {
  todos: [
    { id: 'td1', title: 'Clés + téléphone + portefeuille', day: null, member_id: null, done_at: null, position: 0, section: null },
    { id: 'td2', title: 'Boîte à lunch des enfants', day: null, member_id: 'm1', done_at: null, position: 1, section: null },
  ],
}

// Reusable checklist TEMPLATES — instantiated into real todos from the TodoSection
// add field (Réglages ▸ À compléter authors them). A list with a nested ref to a
// second list, to exercise composed sections.
const TODO_TEMPLATES = {
  templates: [
    { id: 'tpl1', title: 'Avant de partir', position: 0, items: [{ kind: 'item', label: 'Vérifier les portes' }, { kind: 'item', label: 'Clés + téléphone + portefeuille' }, { kind: 'ref', refId: 'tpl2' }] },
    { id: 'tpl2', title: 'Sac des enfants', position: 1, items: [{ kind: 'item', label: 'Boîte à lunch' }, { kind: 'item', label: 'Bouteille d’eau' }] },
  ],
}

// « Le cercle » — a populated people graph so the directory, the family COLOURS, the
// Liens (ego) graph and the generational Arbre all render with real content. Members
// are the Maisonnée; contacts add an extended family + a few social ties. The named
// groups carry the colours the tree/Liste paint families with (the new family-colour
// + grouping pass — commit 0dd7b9a). Shapes mirror src/lib/cercle.ts wire types.
const CERCLE_MEMBERS = [
  { id: 'm1', displayName: 'Maman', avatarKind: 'color', avatarRef: '#B06A93', colour: '#B06A93', isChild: false, email: 'maman@exemple.ca', phone: '514-555-0101', birthday: '1988-04-12', notes: null, gender: 'f' },
  { id: 'm2', displayName: 'Papa', avatarKind: 'color', avatarRef: '#5891AC', colour: '#5891AC', isChild: false, email: null, phone: '514-555-0102', birthday: '1986-09-03', notes: null, gender: 'm' },
  { id: 'm3', displayName: 'Léa', avatarKind: 'color', avatarRef: '#88A36F', colour: '#88A36F', isChild: true, email: null, phone: null, birthday: '2017-06-25', notes: null, gender: 'f' },
  { id: 'm4', displayName: 'Noah', avatarKind: 'color', avatarRef: '#F2A03D', colour: '#F2A03D', isChild: true, email: null, phone: null, birthday: '2019-11-30', notes: null, gender: 'm' },
]
// c1–c3 are the Maisonnée's own extended family (Famille). Everyone from c4 down is
// SOCIAL: two friends who have families of their OWN (Gagnon, Roy — so Social ▸ Arbre
// has real trees to draw side by side), a hockey group of three unrelated people, one
// colleague, and a neighbour in no circle at all (« Autres personnes »).
const CERCLE_CONTACTS = [
  { id: 'c1', firstName: 'Rose', lastName: 'Tremblay', nickname: 'Mamie', photoKey: null, birthday: '1958-03-19', email: null, phone: '450-555-0201', address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'f' },
  { id: 'c2', firstName: 'Jean', lastName: 'Tremblay', nickname: 'Papi', photoKey: null, birthday: '1956-07-08', email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
  { id: 'c3', firstName: 'Marc', lastName: 'Tremblay', nickname: null, photoKey: null, birthday: '1990-12-01', email: 'marc@exemple.ca', phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
  { id: 'c4', firstName: 'Sophie', lastName: 'Gagnon', nickname: null, photoKey: null, birthday: '1989-05-22', email: null, phone: '514-555-0303', address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'f' },
  { id: 'c5', firstName: 'Thomas', lastName: 'Roy', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
  { id: 'c6', firstName: 'Luc', lastName: 'Bélanger', nickname: 'Voisin', photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
  { id: 'c7', firstName: 'Étienne', lastName: 'Gagnon', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
  { id: 'c8', firstName: 'Zoé', lastName: 'Gagnon', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'f' },
  { id: 'c9', firstName: 'Malik', lastName: 'Gagnon', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
  { id: 'c10', firstName: 'Julie', lastName: 'Roy', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'f' },
  { id: 'c11', firstName: 'Alice', lastName: 'Roy', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'f' },
  { id: 'c12', firstName: 'Karim', lastName: 'Benali', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
  { id: 'c13', firstName: 'Nadia', lastName: 'Fortin', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'f' },
  { id: 'c14', firstName: 'Pierre-Luc', lastName: 'Caron', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
  { id: 'c15', firstName: 'Éric', lastName: 'Nadeau', nickname: null, photoKey: null, birthday: null, email: null, phone: null, address: null, notes: null, tags: [], memberId: null, customFields: [], gender: 'm' },
]
// Inverse-paired links: the relationship engine stores both type + reverseType.
const L = (id: string, aK: string, aId: string, bK: string, bId: string, type: string, reverseType: string) => ({
  id, personAKind: aK, personAId: aId, personBKind: bK, personBId: bId, type, reverseType, label: null, notes: null,
})
const CERCLE_LINKS = [
  L('k1', 'member', 'm1', 'member', 'm3', 'parent', 'child'),
  L('k2', 'member', 'm1', 'member', 'm4', 'parent', 'child'),
  L('k3', 'member', 'm2', 'member', 'm3', 'parent', 'child'),
  L('k4', 'member', 'm2', 'member', 'm4', 'parent', 'child'),
  L('k5', 'member', 'm1', 'member', 'm2', 'spouse', 'spouse'),
  L('k6', 'contact', 'c1', 'member', 'm1', 'parent', 'child'),
  L('k7', 'contact', 'c2', 'member', 'm1', 'parent', 'child'),
  L('k8', 'contact', 'c1', 'contact', 'c2', 'spouse', 'spouse'),
  L('k9', 'contact', 'c3', 'member', 'm1', 'sibling', 'sibling'),
  // Social ties reach the household but never cross into Famille (best_friend and
  // colleague are not family rels), so a friend's own family stays on the Social side.
  L('k10', 'contact', 'c4', 'member', 'm1', 'best_friend', 'best_friend'),
  L('k11', 'contact', 'c5', 'member', 'm2', 'colleague', 'colleague'),
  // Sophie's family.
  L('k12', 'contact', 'c4', 'contact', 'c7', 'spouse', 'spouse'),
  L('k13', 'contact', 'c4', 'contact', 'c8', 'parent', 'child'),
  L('k14', 'contact', 'c4', 'contact', 'c9', 'parent', 'child'),
  L('k15', 'contact', 'c7', 'contact', 'c8', 'parent', 'child'),
  L('k16', 'contact', 'c7', 'contact', 'c9', 'parent', 'child'),
  // Thomas's family.
  L('k17', 'contact', 'c5', 'contact', 'c10', 'spouse', 'spouse'),
  L('k18', 'contact', 'c5', 'contact', 'c11', 'parent', 'child'),
  L('k19', 'contact', 'c10', 'contact', 'c11', 'parent', 'child'),
  // The friendships that tie those families together — what Social ▸ Arbre draws as
  // dashed connectors, and aligns the two trees on.
  L('k20', 'contact', 'c4', 'contact', 'c5', 'friend', 'friend'),
  L('k21', 'contact', 'c7', 'contact', 'c6', 'friend', 'friend'),
  L('k22', 'contact', 'c4', 'contact', 'c12', 'friend', 'friend'),
]
const CERCLE_GROUPS = [
  { id: 'g1', name: 'Famille Tremblay', kind: 'family', colour: '#C2563A', memberKeys: [{ personId: 'c1', personKind: 'contact' }, { personId: 'c2', personKind: 'contact' }, { personId: 'c3', personKind: 'contact' }] },
  // A « friends »-kind group implies a friend tie between its members (friendLinksFromGroups).
  { id: 'g2', name: 'Le hockey', kind: 'friends', colour: '#5891AC', memberKeys: [{ personId: 'c12', personKind: 'contact' }, { personId: 'c13', personKind: 'contact' }, { personId: 'c14', personKind: 'contact' }] },
  { id: 'g3', name: 'Collègues', kind: 'work', colour: '#7BB0C9', memberKeys: [{ personId: 'c15', personKind: 'contact' }] },
]
const CERCLE = { members: CERCLE_MEMBERS, contacts: CERCLE_CONTACTS, links: CERCLE_LINKS, groups: CERCLE_GROUPS }

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
  wonder: { wonder: null }, // daily-wonder band hides in screenshots; set a {source,title,explanation,imgUrl} object to exercise it
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
  habits: HABITS,
  // The calendar window (/api/month). Habits ride it as DERIVED occurrences (the
  // birthdays pattern): a household one on MMID, and one of Maman's — so a spec can
  // assert the private-ish filter applies on the grid too.
  month: {
    events: [],
    meals: [],
    chores: [],
    dayNotes: [],
    todos: [],
    homeProjects: [],
    trips: [],
    tripPlans: [],
    habits: [
      { id: 'hb1#0', habit_id: 'hb1', title: 'Marcher dehors', icon: '🚶', colour: '#88A36F', kind: 'do', member_id: null, day: MMID, done: false },
      { id: 'hb1#1', habit_id: 'hb1', title: 'Marcher dehors', icon: '🚶', colour: '#88A36F', kind: 'do', member_id: null, day: MMID - DAY, done: true },
      { id: 'hb2#0', habit_id: 'hb2', title: 'Boire de l’eau', icon: '💧', colour: '#5891AC', kind: 'count', member_id: 'm1', day: MMID, done: false },
    ],
  },
  members: { members: MEMBERS },
  'pair/devices': DEVICES,
  chores: CHORES,
  events: EVENTS,
  year: YEAR,
  health: { ai: true, aiAvailable: true },
  household: { name: 'Maison Tremblay', postal: 'H2X 1Y4', includedStores: [], aiEnabled: true },
  // « Le cercle » people graph (members + contacts + links + coloured groups).
  cercle: CERCLE,
  // Business sub-tab — isolated services directory. Empty is the calm default.
  businesses: { businesses: [] },
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
  // « Le cercle » → Famille → "Notes & recommandations" (CercleNotes + global search).
  // Empty is the normal calm state; an absent `notes` must never crash the section.
  'family-notes': { notes: [] },
  recap: { recap: 'Belle semaine : 3 soupers planifiés, 2 sorties, liste à jour.' },
  // « À régler » cross-domain scan — empty by default (the card hides; calm). Set a
  // [{kind,key,label,sub?,at?,href}] to exercise the heads-up.
  'a-regler': { signals: [] },
  // « L'auto » read model (board glance card + /voiture week). Same body for the
  // today and ?from=&to= week reads — the path is 'car' either way.
  car: CAR,
  // « À compléter » todos (#17) — board glance, day pages + the departure screen.
  todos: TODOS,
  // Reusable checklist templates (instantiated into real todos from the add field).
  'todo-templates': TODO_TEMPLATES,
  // The kept-drawing collection / gallery (#14). Two works so /drawings renders a
  // populated wall; the images resolve via /api/img/* (served a tiny SVG below).
  drawings: {
    drawings: [
      { id: 'dg1', member_id: 'm3', media_key: 'nm_g1', scene_key: 'ns_g1', created_at: BASE },
      { id: 'dg2', member_id: 'm1', media_key: 'nm_g2', scene_key: null, created_at: BASE - DAY },
    ],
  },
  // « Depuis ce matin » (A-3) — the board greeting's pull-only peek. Fields are
  // camelCase (this is a bespoke composed shape, not a raw D1 row passthrough —
  // see functions/api/today-changes.ts). One of each source, newest first, plus a
  // face-less event (decided, A-3) so the peek's calm edge (no face claimed on a
  // fact) is exercised too.
  'today-changes': {
    entries: [
      { id: 'tc1', kind: 'list_item', at: BASE + 3 * 3600, text: 'du lait', memberId: 'm2', name: 'Papa', avatarKind: 'color', avatarRef: '#5891AC', colour: '#5891AC', authorLabel: null },
      { id: 'tc2', kind: 'meal', at: BASE + 2 * 3600, text: 'une pizza', memberId: 'm3', name: 'Léa', avatarKind: 'color', avatarRef: '#88A36F', colour: '#88A36F', authorLabel: null },
      { id: 'tc3', kind: 'event', at: BASE + 3600, text: 'Dentiste', memberId: null, name: null, avatarKind: null, avatarRef: null, colour: null, authorLabel: null },
    ],
  },
}

// A tiny placeholder image for any /api/img/<key> in the offline harness (avatars,
// note/gallery drawings…) so thumbnails render instead of broken-image icons.
const IMG_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="%23fffdf7"/><text x="40" y="48" font-size="34" text-anchor="middle">🎨</text></svg>'

// signedIn defaults true (the populated household). Pass { signedIn: false } to
// simulate a brand-new visitor — used by the `/` marketing-page screenshot, since
// the smart entry only shows marketing when nobody's signed in.
// `unauthorized: true` 401s every data route (auth/me and health stay 200) —
// simulates a revoked device token / dead session for the recovery flows.
// `fresh: true` empties members + board — the just-signed-up household.
// `longText: true` stuffs every text-ish field with a long phrase + an unbreakable
// long word — a layout stress test for truncation / overflow / word-break.
export async function mockApi(
  page: Page,
  opts: {
    signedIn?: boolean
    unauthorized?: boolean
    fresh?: boolean
    longText?: boolean
    // Hold every data response this many ms so a page's <Loading/> frame is
    // capturable before data lands (auth/me + health stay instant so the shell
    // still boots signed-in).
    delay?: number
    // Fail every data GET (beyond the 401 `unauthorized` case): '500' returns a
    // server error, 'network' aborts the request (a dropped connection). auth/me +
    // health stay healthy so we land on the signed-in surface and see ITS degraded
    // state, not the recovery/login flow.
    error?: '500' | 'network'
  } = {},
) {
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
  // « Pas pressé »: a presentation flag written from the item edit scene. Tracked
  // so the board refetch keeps the row faded instead of reverting it.
  const noRushItems = new Set<string>()
  // « Mes habitudes » day marks, keyed `${habitId}:${day}` — the server upserts an
  // ABSOLUTE per-day value on (habit_id, day), so the mock does the same and the
  // check-in refetch confirms the tap instead of reverting it.
  const habitDays = new Map<string, { habit_id: string; day: number; value: number; slips: number; member_id: null; note: string }>()
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api\//, '')
    const method = route.request().method()

    // Loading lever: hold data responses so the <Loading/> frame is capturable.
    if (opts.delay && path !== 'auth/me' && path !== 'health') {
      await new Promise((r) => setTimeout(r, opts.delay))
    }

    // Error lever (beyond 401): fail every data GET. auth/me + health stay healthy so
    // the signed-in shell still boots and we capture ITS degraded state, not login.
    if (opts.error && method === 'GET' && path !== 'auth/me' && path !== 'health') {
      if (opts.error === 'network') {
        await route.abort('failed')
        return
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Erreur serveur' }) })
      return
    }

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
          if (body.id && body.non_urgent === true) noRushItems.add(body.id)
          else if (body.id && body.non_urgent === false) noRushItems.delete(body.id)
        } catch {
          /* no body */
        }
      }
      // A habit check-in tap: absolute upsert on (habit, day), like functions/api/habits.
      if (method === 'PATCH' && path === 'habits') {
        try {
          const body = JSON.parse(route.request().postData() || '{}')
          if (body.id && body.mark) {
            const { day, value, slips } = body.mark
            habitDays.set(`${body.id}:${day}`, {
              habit_id: body.id,
              day,
              value: value ?? 0,
              slips: slips ?? 0,
              member_id: null,
              note: '',
            })
          }
        } catch {
          /* no body */
        }
      }
      // Media uploads (note-media) hand back a usable key + kind so save flows
      // (drawing notes, gallery keeps) get a real key instead of a bare {ok}.
      if (path === 'note-media') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'nm_e2e', kind: 'drawing' }) })
        return
      }
      // « Vide-frigo » (#5): step 'ideas' → dish names, step 'recipes' → full recipes.
      if (path === 'empty-fridge') {
        let step = ''
        try {
          step = JSON.parse(route.request().postData() || '{}').step ?? ''
        } catch {
          /* no body */
        }
        const body =
          step === 'recipes'
            ? {
                recipes: [
                  {
                    title: 'Frittata aux épinards',
                    ingredients: ['6 œufs', '2 t. épinards', '1/2 t. crème'],
                    steps: ['Battre les œufs.', 'Ajouter les épinards.', 'Cuire au four 20 min.'],
                  },
                ],
              }
            : { ideas: ['Frittata aux épinards', 'Soupe minestrone', 'Gratin de restes', 'Quiche express', 'Sauté express'] }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    // Stored images (avatars, drawings…) — a tiny SVG so thumbnails render offline.
    if (path.startsWith('img/') || path === 'flyer-img') {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: IMG_SVG.replace(/%23/g, '#') })
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
      const empty = { ...BOARD, members: [], today: [], tomorrow: [], upcoming: [], tonight: null, tonightMeals: [], tomorrowMeal: null, todayMeals: [], dayNote: null, tomorrowMeals: [], tomorrowNote: null, list: [], chores: [], notes: [], choresToday: [], choresUpcoming: [], todos: [], leftovers: [] }
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

    // todos?date=<sec> is DAY-SCOPED: the server returns ONLY todos pinned to that day
    // (WHERE day = ?), not the standing globals the board glance (no date) mixes in. The
    // fixture's todos are all global (day null), so a date-scoped query (e.g. the Demain
    // card's embedded TodoSection) is correctly empty → it hides. Honour the param so the
    // mock matches server semantics instead of returning globals for every todos query.
    if (path === 'todos' && url.searchParams.has('date')) {
      const day = Number(url.searchParams.get('date'))
      const todos = TODOS.todos.filter((td) => td.day === day)
      await route.fulfill({ status: 200, contentType: 'application/json', body: serve({ todos }) })
      return
    }

    // Board read reflects this session's writes (cleared notes, list checks +
    // clears), so an optimistic UI's refetch confirms instead of reverting. A
    // checked row STAYS on the list with checked_at set; a cleared row is gone.
    if (path === 'board' && (dismissedNotes.size || checkedItems.size || clearedItems.size || noRushItems.size)) {
      const b = {
        ...BOARD,
        notes: BOARD.notes.filter((n) => !dismissedNotes.has(n.id)),
        list: BOARD.list
          .filter((i) => !clearedItems.has(i.id))
          .map((i) => (checkedItems.has(i.id) ? { ...i, checked_at: BASE } : i))
          .map((i) => (noRushItems.has(i.id) ? { ...i, non_urgent: 1 } : i))
          // Flagging a line « pas pressé » settles it at the BOTTOM (the real server
          // rewrites `position` on the flip) — a stable partition reproduces that.
          .sort((a, b) => (noRushItems.has(a.id) ? 1 : 0) - (noRushItems.has(b.id) ? 1 : 0)),
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
      return
    }

    // The check-in read serves this session's day marks, so a tap survives the
    // refetch that follows it (the same trick as the board's list checks above).
    if (path === 'habits' && habitDays.size) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: serve({ ...HABITS, days: [...habitDays.values()] }) })
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
export type Audience = 'parent' | 'toddler' | 'simple'
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
  // The parent board layout (bento = Grille | month = Mois | annee = L'année).
  // Defaults to bento.
  boardView?: 'bento' | 'month' | 'annee'
  // Per-device board card layout (« Disposition du babillard », lib/boardCards). Lets a
  // spec exercise a custom layout without hand-injecting the localStorage key.
  // Unset → the canonical zones/order, everything at its default size and mode.
  //
  // BOTH persisted shapes are accepted, on purpose:
  //   • v2 `{band, grid, size, mode}` — what the app writes today.
  //   • v1 `{order, hidden}` — what every ALREADY-SHIPPED device still has in its
  //     localStorage. Seeding it here is the e2e guard on `reconcile`'s migration: a
  //     silent failure would reset a household's wall tablet on upgrade.
  cardPrefs?: {
    band?: string[]
    grid?: string[]
    size?: Record<string, number | 'full'>
    mode?: Record<string, 'always' | 'auto' | 'never'>
    /** @deprecated v1 — kept so the migration stays covered. */
    order?: string[]
    /** @deprecated v1 — kept so the migration stays covered. */
    hidden?: string[]
  }
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
  // « Le point du jour » opens ITSELF on the first app open of a new local day (and
  // at a habit's reminder times), which would navigate every board spec straight off
  // /board. Answered-for-today by default — same idea as pre-seeding the tour as
  // "seen". Pass `habitCheckin: true` to leave it armed and exercise the trigger.
  habitCheckin?: boolean
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
      if (state.cardPrefs) localStorage.setItem('babillard-card-prefs', JSON.stringify(state.cardPrefs))
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
        localStorage.setItem('babillard-sections-seen', JSON.stringify(['board', 'kitchen', 'routines', 'liste', 'cercle']))
      }
      // Pre-mark the first-login guided tour seen unless a test opts in, so its
      // auto-started welcome card / spotlight never covers the elements a spec is
      // driving — the cause of the whole suite timing out once the tour shipped.
      // (Several specs already seeded this by hand; doing it here covers them all.)
      if (!state.tour) {
        localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
      }
      // Same reasoning for « Le point du jour »: its morning open would navigate a
      // board spec away before it could click anything. Off unless opted into.
      if (!state.habitCheckin) {
        localStorage.setItem(
          'babillard-habitudes-checkin',
          JSON.stringify({ autoOpen: false, reminders: false, lastShownDay: 0, fired: { day: 0, minutes: [] } }),
        )
      }
    } catch {
      /* noop */
    }
  }, s)
}
