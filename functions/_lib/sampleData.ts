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
import { freeMemberMediaBlobs, memberRefStatements } from './members'

// The exact set of tables « clear » sweeps, in FK-safe DELETE order: a child (any
// row that references another seeded row) is deleted BEFORE its parent, because D1
// enforces REFERENCES FKs. members + recipes are the most-referenced, so they sit
// LAST; carnets/businesses/contacts/trips are parents of their content rows, so
// those content rows come first. (Seeding inserts in the reverse: parents first.)
const SAMPLE_TABLES = [
  // deepest children (reference members/recipes/carnets/…)
  'contact_links', // polymorphic edges (no DB FK, but conceptually first)
  'recipe_loves', // → recipes, members
  'mots', // → members
  'care_log', // → carnets
  'home_projects', // soft-ref carnets
  'carnets', // flat (all parent_id NULL) → after its care_log/pins
  'pets', // soft-ref businesses
  'contacts', // → members (member_id)
  'businesses',
  'trips',
  // extended (migration 0114 gave these is_sample). habit_days is NOT swept here — it
  // has no household_id column and the seed creates none (see the migration comment).
  'meal_leftovers', // → households only (recipe/source not FK)
  'schedule_blocks', // → members
  'habits', // → members (habit_days would come first, but none are seeded)
  'family_notes', // → members (member_id + author_member_id)
  // original core
  'events',
  'meals', // → recipes, so before recipes
  'list_items',
  'tasks',
  'notes',
  'pantry_low',
  'routines',
  'todos',
  'recipes', // referenced by meals + recipe_loves → after them
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
// deleteR2Blob walk is needed for the sample rows themselves.
//
// The catch: a curious operator can wire a REAL row onto a sample face while
// exploring (assign a real event to sample "Léa", leave her a mot, ❤ a recipe as
// her). That non-sample row still FK-references the sample member, so a bare
// `DELETE FROM members WHERE is_sample = 1` is rejected and the whole clear fails —
// "there's no way to delete the examples." So first detach/delete EVERY reference
// (sample or not) to each sample member, reusing the exact same cleanup as a normal
// member delete, then run the sweep in the same batch.
export async function clearSampleData(env: Env, householdId: string): Promise<void> {
  const { results: sampleMembers } = await env.DB.prepare(
    'SELECT id FROM members WHERE household_id = ? AND is_sample = 1',
  )
    .bind(householdId)
    .all<{ id: string }>()
  // mot blobs a real row may have left on a sample face (best-effort; R2 may be unset).
  for (const mm of sampleMembers) await freeMemberMediaBlobs(env, householdId, mm.id)
  await env.DB.batch([
    ...sampleMembers.flatMap((mm) => memberRefStatements(env, householdId, mm.id)),
    ...SAMPLE_TABLES.map((tbl) =>
      env.DB.prepare(`DELETE FROM ${tbl} WHERE household_id = ? AND is_sample = 1`).bind(householdId),
    ),
  ])
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

  // ── Extended demo: Le cercle (extended family + tree), a pet + its vet, a home
  // carnet with its upkeep, recipe hearts, a « mot », a trip — so a curious user
  // finds every section alive, not just the board. ids up front so the edges /
  // hearts / carnet-content below can reference them. All media-free.
  const diane = newId() // grandmother (contact)
  const robert = newId() // grandfather (contact)
  const moustache = newId() // the cat (pet)
  const vetBiz = newId() // the vet (business)
  const maison = newId() // the home carnet

  // Days, DST-aware, anchored to today.
  const d0 = localDayStart(new Date(ts * 1000))
  const d1 = addLocalDays(d0, 1)
  const d3 = addLocalDays(d0, 3)
  const d5 = addLocalDays(d0, 5)
  const d10 = addLocalDays(d0, 10)
  const d12 = addLocalDays(d0, 12)
  const at = (day: number, hours: number) => localTimeOnDay(day, hours * 3600)

  // Cercle relationship edges (polymorphic: kind ∈ member|contact|pet; no DB FK).
  // A small 3-generation tree — grandparents → Maman → the kids — plus Léa owns the
  // cat. reverse_type from lib/cercleRelations INVERSES.
  const link = (aId: string, aKind: string, bId: string, bKind: string, type: string, rev: string) =>
    P(
      `INSERT INTO contact_links (id, household_id, person_a_id, person_a_kind, person_b_id, person_b_kind, type, reverse_type, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId(), h, aId, aKind, bId, bKind, type, rev, ts, ts, S)

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
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, maman, 'Souper chez Mamie et Papi', at(d3, 18), ts, S),
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
    // a per-day todo pinned to TOMORROW (day = d1) — the night-before « À compléter »
    // that surfaces on the « Demain » card (mini list + grown body), so the demo shows
    // that checklist alive instead of an empty tomorrow tile.
    P(
      `INSERT INTO todos (id, household_id, title, day, member_id, position, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(newId(), h, 'Signer l’agenda de Léa', d1, lea, ts, ts, S),

    // ── Extended demo (parents before children for the FK batch) ──────────────

    // businesses — the vet (referenced by the pet below, soft ref).
    P(
      `INSERT INTO businesses (id, household_id, name, category, phone, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(vetBiz, h, 'Clinique vétérinaire du coin', 'Vétérinaire', '514-555-0199', ts, ts, S),

    // contacts — extended family (grandparents). member_id NULL (they're not faces).
    P(
      `INSERT INTO contacts (id, household_id, first_name, last_name, nickname, birthday, gender, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(diane, h, 'Diane', 'Tremblay', 'Mamie', '1958-03-15', 'f', ts, ts, S),
    P(
      `INSERT INTO contacts (id, household_id, first_name, last_name, nickname, birthday, gender, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(robert, h, 'Robert', 'Tremblay', 'Papi', '1955-07-22', 'm', ts, ts, S),

    // pets — the cat, with its vet (soft ref).
    P(
      `INSERT INTO pets (id, household_id, name, species, colour, birthday, vet_business_id, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(moustache, h, 'Moustache', 'Chat', '#8a8a8a', '2020-05-01', vetBiz, ts, ts, S),

    // carnets — the home carnet (flat: parent_id NULL, so the clear sweep's single
    // DELETE never hits the self-ref FK). Its content (care_log + upkeep) follows.
    P(
      `INSERT INTO carnets (id, household_id, kind, name, colour, created_at, updated_at, is_sample)
       VALUES (?, ?, 'home', ?, ?, ?, ?, ?)`,
    ).bind(maison, h, 'La maison', '#8a6f5c', ts, ts, S),
    // care_log — a past service on the home (→ carnets, so after it).
    P(
      `INSERT INTO care_log (id, household_id, carnet_id, at, kind, title, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, 'service', ?, ?, ?, ?)`,
    ).bind(newId(), h, maison, addLocalDays(d0, -14), 'Changé le filtre de la fournaise', ts, ts, S),
    // home_projects — a dated upkeep tied to the home carnet (surfaces on the board).
    P(
      `INSERT INTO home_projects (id, household_id, kind, title, colour, at, carnet_id, created_at, updated_at, is_sample)
       VALUES (?, ?, 'upkeep', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId(), h, 'Nettoyer les gouttières', '#8a6f5c', d5, maison, ts, ts, S),

    // cercle edges — a 3-generation tree + Léa owns the cat (no DB FK; polymorphic).
    link(robert, 'contact', diane, 'contact', 'spouse', 'spouse'),
    link(diane, 'contact', maman, 'member', 'parent', 'child'),
    link(maman, 'member', lea, 'member', 'parent', 'child'),
    link(maman, 'member', noah, 'member', 'parent', 'child'),
    link(papa, 'member', lea, 'member', 'parent', 'child'),
    link(papa, 'member', noah, 'member', 'parent', 'child'),
    link(lea, 'member', moustache, 'pet', 'owner', 'pet'),

    // recipe hearts (#21) — who loves the spaghetti (faces, never a count). Composite
    // PK, no id column; → recipes + members, so after both (inserted first).
    P(
      `INSERT OR IGNORE INTO recipe_loves (household_id, recipe_id, member_id, created_at, is_sample) VALUES (?, ?, ?, ?, ?)`,
    ).bind(h, rSpag, maman, ts, S),
    P(
      `INSERT OR IGNORE INTO recipe_loves (household_id, recipe_id, member_id, created_at, is_sample) VALUES (?, ?, ?, ?, ?)`,
    ).bind(h, rSpag, papa, ts, S),

    // a « mot » — Maman left a note waiting (unopened) on Léa's face. Media-free.
    P(
      `INSERT INTO mots (id, household_id, member_id, author_member_id, text, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId(), h, lea, maman, 'Je suis fière de toi ❤️', ts, S),

    // a trip (« Voyage ») — a weekend at the lake, the whole household.
    P(
      `INSERT INTO trips (id, household_id, title, destination, start_at, end_at, members, colour, position, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, 'Chalet au lac', 'Lac Memphrémagog', d10, d12, JSON.stringify([maman, papa, lea, noah]), '#5891AC', ts, S),

    // an undated leftover (« À finir ») — a dish to eat first, no day chosen. No
    // quantity (calm) — a dish name only.
    P(
      `INSERT INTO meal_leftovers (id, household_id, title, created_at, is_sample) VALUES (?, ?, ?, ?, ?)`,
    ).bind(newId(), h, 'Pâté chinois', ts, S),

    // a work schedule window (« L'auto ») — Papa takes the car Mon–Fri 8h–17h, so the
    // car card shows a real weekly backdrop instead of « libre toute la journée ».
    // start/end are MINUTES from local midnight; recurrence is the shared weekly Recur
    // rule (migration 0090 folded the old `weekdays` column into `recur_json`): weekdays
    // 1..5 = Mon–Fri (0=Sun), every week.
    P(
      `INSERT INTO schedule_blocks (id, household_id, member_id, label, start_min, end_min, recur_json, holds_car, colour, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).bind(newId(), h, papa, 'Travail', 8 * 60, 17 * 60, JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }), '#5891AC', ts, S),

    // habits (« Mes habitudes ») — one household-wide, one Maman's own. No history rows
    // (habit_days): an un-touched habit reads as a neutral, un-checked today. anchor_at
    // = now so occurrences start today; recur_json NULL = every day.
    P(
      `INSERT INTO habits (id, household_id, member_id, title, icon, colour, kind, cadence, anchor_at, position, created_at, is_sample)
       VALUES (?, ?, NULL, ?, ?, ?, 'do', 'recur', ?, 0, ?, ?)`,
    ).bind(newId(), h, 'Marcher dehors', '🚶', '#88A36F', ts, ts, S),
    P(
      `INSERT INTO habits (id, household_id, member_id, title, icon, colour, kind, target, unit, cadence, anchor_at, position, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, 'count', 8, ?, 'recur', ?, 1, ?, ?)`,
    ).bind(newId(), h, maman, 'Boire de l’eau', '💧', '#5891AC', 'verres', ts, ts, S),

    // a family note (« Notes (cercle) ») — a durable Maisonnée note (member_id NULL),
    // titled + lightweight Markdown body, attributed to Maman. Media-free.
    P(
      `INSERT INTO family_notes (id, household_id, member_id, author_member_id, title, text, created_at, updated_at, is_sample)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId(),
      h,
      maman,
      'Gardienne',
      'Numéro de la gardienne : 514-555-0176.\nCouché des enfants à 19 h 30.',
      ts,
      ts,
      S,
    ),
  ]

  await env.DB.batch(stmts)
  return members.length
}
