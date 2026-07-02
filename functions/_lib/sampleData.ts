// Sample/demo data for a first-time household (onboarding Phase 1). A brand-new
// account is otherwise two rows (household + operator) and an empty board, which
// undercuts the welcome tour — it points at a ＋ and a nav bar with nothing behind
// them. So we seed a small, calm, MEDIA-FREE demo family (no R2 blobs → clearing
// is a pure DB delete, and no bucket dependency). Every row is tagged
// `is_sample = 1` (migration 0096) so « Vider les exemples » removes only the demo,
// never a row the operator added while exploring.
//
// Content is transcribed from the e2e/promo fixture (e2e/mocks.ts) so it reads as a
// real Québécois household. Calm-safe: ordinary rows into existing tables, no
// counts/ranks/streaks. Dates are anchored to "today" (DST-aware, America/Toronto)
// so the board is alive whenever the account is created.
import type { Env } from './env'
import { newId, nowSec, localDayStart, addLocalDays, localTimeOnDay } from './ids'

// The exact set of tables « clear » sweeps, in FK-safe DELETE order: children
// (rows that reference a member or recipe) FIRST, then recipes, then members LAST.
// Several tables carry a FK to members(id) / recipes(id) that IS enforced, so
// deleting members before the meals/events/notes/routines/todos that reference them
// fails — order matters. (Seeding inserts in the reverse: members + recipes first.)
const SAMPLE_TABLES = [
  'events',
  'meals', // → recipes, so before recipes
  'list_items',
  'tasks',
  'notes',
  'pantry_low',
  'routines',
  'todos',
  'recipes', // referenced by meals → after meals
  'members', // referenced by everyone → last
] as const

// How many demo rows currently exist for a household (members is the proxy — the
// seed always creates the four faces). Drives the board banner + Réglages control.
export async function countSampleData(env: Env, householdId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE household_id = ? AND is_sample = 1')
    .bind(householdId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

// Remove every seeded row for a household in one atomic batch. Hard delete — demo
// data should vanish, not leave tombstones — and media-free by construction, so no
// deleteR2Blob walk is needed.
export async function clearSampleData(env: Env, householdId: string): Promise<void> {
  await env.DB.batch(
    SAMPLE_TABLES.map((tbl) =>
      env.DB.prepare(`DELETE FROM ${tbl} WHERE household_id = ? AND is_sample = 1`).bind(householdId),
    ),
  )
}

// Seed the demo family. Idempotent: no-ops if this household already has sample
// rows (so calling it again from signup or « Charger des exemples » can't double it).
// Returns the number of members seeded (0 = skipped because data already present).
export async function seedSampleData(env: Env, householdId: string, ts = nowSec()): Promise<number> {
  if ((await countSampleData(env, householdId)) > 0) return 0

  const h = householdId
  const S = 1 // is_sample

  // Faces (m*). ids generated now so the meals/events/chores/notes/routines below
  // can reference them. avatar_kind='color' + avatar_ref=colour mirrors the real
  // members INSERT (a photo-less face shows its coloured initials disc).
  const maman = newId()
  const papa = newId()
  const lea = newId()
  const noah = newId()
  const members: [string, string, string, number, string | null, string | null, string | null, 'm' | 'f'][] = [
    [maman, 'Maman', '#B06A93', 0, 'maman@exemple.ca', '514-555-0101', '1988-04-12', 'f'],
    [papa, 'Papa', '#5891AC', 0, null, '514-555-0102', '1986-09-03', 'm'],
    [lea, 'Léa', '#88A36F', 1, null, null, '2017-06-25', 'f'],
    [noah, 'Noah', '#F2A03D', 1, null, null, '2019-11-30', 'm'],
  ]

  // Recipes (media-free: image = NULL). ids referenced by the meals below.
  const rSpag = newId()
  const rTacos = newId()
  const spagIngredients = [
    '400 g de pâtes',
    '1 pot de sauce tomate',
    '500 g de bœuf haché',
    '1 oignon',
    '15 ml (1 c. à soupe) d’huile d’olive',
    '1 c. à thé de sel',
    '1/4 c. à thé de poivre',
  ]
  const spagSteps = [
    'Faire revenir l’oignon dans l’huile.',
    'Ajouter le bœuf haché et cuire jusqu’à doré.',
    'Verser la sauce, laisser mijoter 20 min et servir sur les pâtes.',
  ]
  const tacosIngredients = [
    '500 g de poitrine de poulet',
    '1 sachet d’épices à tacos',
    '8 coquilles à tacos',
    '1 tomate',
    'Laitue râpée',
  ]
  const tacosSteps = [
    'Cuire le poulet en dés avec les épices.',
    'Garnir les coquilles de poulet, tomate et laitue.',
  ]

  // Days, DST-aware, anchored to today.
  const d0 = localDayStart(new Date(ts * 1000))
  const d1 = addLocalDays(d0, 1)
  const d3 = addLocalDays(d0, 3)
  const d5 = addLocalDays(d0, 5)
  const at = (day: number, hours: number) => localTimeOnDay(day, hours * 3600)

  // Routine cards (emoji icons; no narration/photo R2 keys → both arrays empty).
  const matinCards = [
    { icon: '👕', label: 'Habille-toi', narration: 'C’est l’heure de s’habiller' },
    { icon: '🥞', label: 'Déjeuner' },
    { icon: '🪥', label: 'Brosse tes dents' },
    { icon: '🎒', label: 'Sac à dos' },
  ]
  const dodoCards = [
    { icon: '🛁', label: 'Le bain' },
    { icon: '🪥', label: 'Brosse tes dents' },
    { icon: '📖', label: 'Une histoire' },
  ]

  const P = env.DB.prepare.bind(env.DB)
  const stmts = [
    // members
    ...members.map(([id, name, colour, isChild, email, phone, birthday, gender]) =>
      P(
        `INSERT INTO members (id, household_id, display_name, avatar_kind, avatar_ref, colour, is_child, email, phone, birthday, gender, created_at, is_sample)
         VALUES (?, ?, ?, 'color', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, h, name, colour, colour, isChild, email, phone, birthday, gender, ts, S),
    ),

    // recipes
    P(
      `INSERT INTO recipes (id, household_id, title, ingredients_json, steps_json, servings, prep_min, cook_min, notes, tags_json, lang, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fr', ?, ?, ?)`,
    ).bind(
      rSpag,
      h,
      'Spaghetti maison',
      JSON.stringify(spagIngredients),
      JSON.stringify(spagSteps),
      4,
      15,
      30,
      'Ajoute du parmesan au service.',
      JSON.stringify(['rapide', 'préféré']),
      ts,
      ts,
      S,
    ),
    P(
      `INSERT INTO recipes (id, household_id, title, ingredients_json, steps_json, servings, source, tags_json, lang, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fr', ?, ?, ?)`,
    ).bind(
      rTacos,
      h,
      'Tacos au poulet',
      JSON.stringify(tacosIngredients),
      JSON.stringify(tacosSteps),
      4,
      'https://exemple.ca/tacos',
      JSON.stringify(['rapide']),
      ts,
      ts,
      S,
    ),

    // meals — today's supper (2 rows), today's breakfast, tomorrow, and a
    // kid-suggested one a few days out. `date` = local midnight; position 0-based
    // per (date, slot). Spaghetti links its recipe so the peek → cook mode works.
    P(
      `INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, recipe_id, position, created_at, is_sample)
       VALUES (?, ?, ?, 'supper', ?, ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, d0, 'Spaghetti maison', papa, rSpag, ts, S),
    P(
      `INSERT INTO meals (id, household_id, date, slot, title, position, created_at, is_sample)
       VALUES (?, ?, ?, 'supper', ?, 1, ?, ?)`,
    ).bind(newId(), h, d0, 'Salade César', ts, S),
    P(
      `INSERT INTO meals (id, household_id, date, slot, title, position, created_at, is_sample)
       VALUES (?, ?, ?, 'breakfast', ?, 0, ?, ?)`,
    ).bind(newId(), h, d0, 'Crêpes', ts, S),
    P(
      `INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, recipe_id, position, created_at, is_sample)
       VALUES (?, ?, ?, 'supper', ?, ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, d1, 'Tacos au poulet', maman, rTacos, ts, S),
    P(
      `INSERT INTO meals (id, household_id, date, slot, title, suggested_by, position, created_at, is_sample)
       VALUES (?, ?, ?, 'supper', ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, d3, 'Saumon & riz', lea, ts, S),

    // events — a couple today, one tomorrow, and an all-day birthday soon. Member-
    // attributed (member_id set, contact/business null).
    P(
      `INSERT INTO events (id, household_id, member_id, title, start_at, all_day, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, lea, 'Garderie', at(d0, 9), ts, S),
    P(
      `INSERT INTO events (id, household_id, member_id, title, start_at, all_day, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, noah, 'Rendez-vous dentiste', at(d0, 15), ts, S),
    P(
      `INSERT INTO events (id, household_id, member_id, title, start_at, all_day, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, lea, 'Soccer', at(d1, 17), ts, S),
    P(
      `INSERT INTO events (id, household_id, member_id, title, start_at, all_day, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(newId(), h, lea, 'Fête de Léa', d5, ts, S),

    // list_items — the shared grocery list.
    P(
      `INSERT INTO list_items (id, household_id, text, source, added_by, created_at, is_sample)
       VALUES (?, ?, ?, 'manual', ?, ?, ?)`,
    ).bind(newId(), h, 'Lait', maman, ts, S),
    ...['Pain', 'Pommes', 'Couches'].map((text) =>
      P(
        `INSERT INTO list_items (id, household_id, text, source, created_at, is_sample)
         VALUES (?, ?, ?, 'manual', ?, ?)`,
      ).bind(newId(), h, text, ts, S),
    ),

    // tasks (chores) with a fair rotation (faces, never counts).
    P(
      `INSERT INTO tasks (id, household_id, title, rotation_json, current_idx, colour, created_at, is_sample)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(newId(), h, 'Sortir les poubelles', JSON.stringify([maman, papa]), '#88A36F', ts, S),
    P(
      `INSERT INTO tasks (id, household_id, title, rotation_json, current_idx, colour, created_at, is_sample)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    ).bind(newId(), h, 'Vaisselle', JSON.stringify([papa, maman]), '#7BB0C9', ts, S),

    // notes — a fridge note, tinted to Maman.
    P(
      `INSERT INTO notes (id, household_id, text, member_id, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(newId(), h, 'Bonne chance à ton examen !', maman, ts, S),

    // pantry_low — "running low" flags (never a quantity — calm).
    ...['Beurre', 'Café', 'Papier hygiénique'].map((item) =>
      P(`INSERT INTO pantry_low (id, household_id, item, marked_at, is_sample) VALUES (?, ?, ?, ?, ?)`).bind(
        newId(),
        h,
        item,
        ts,
        S,
      ),
    ),

    // routines — one per kid, emoji cards, no media.
    P(
      `INSERT INTO routines (id, household_id, member_id, name, cards_json, cards_narration_json, cards_photo_json, time_of_day, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, '[]', '[]', 'morning', ?, ?)`,
    ).bind(newId(), h, lea, 'Matin', JSON.stringify(matinCards), ts, S),
    P(
      `INSERT INTO routines (id, household_id, member_id, name, cards_json, cards_narration_json, cards_photo_json, time_of_day, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, '[]', '[]', 'evening', ?, ?)`,
    ).bind(newId(), h, noah, 'Dodo', JSON.stringify(dodoCards), ts, S),

    // todos (« À faire ») — one standing, one tied to Maman.
    P(
      `INSERT INTO todos (id, household_id, title, day, member_id, position, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, NULL, NULL, 0, ?, ?, ?)`,
    ).bind(newId(), h, 'Clés + téléphone + portefeuille', ts, ts, S),
    P(
      `INSERT INTO todos (id, household_id, title, day, member_id, position, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, NULL, ?, 1, ?, ?, ?)`,
    ).bind(newId(), h, 'Boîte à lunch des enfants', maman, ts, ts, S),
  ]

  await env.DB.batch(stmts)
  return members.length
}
