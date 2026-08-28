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
  'todo_templates', // soft-ref'd by events.bring_template_id + todos.source_template_id → after both (mig 0117 gave it is_sample)
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

  // Recipes (media-free: image = NULL). ids referenced by the meals below. A small
  // book — several dishes so the recipe list, collections, and « préféré » tag all
  // read full, not a lonely pair.
  const rSpag = newId()
  const rTacos = newId()
  const rPoulet = newId()
  const rMuffins = newId()
  const rSoupe = newId()
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
  const pouletIngredients = [
    '1 poulet entier (environ 1,5 kg)',
    '2 c. à soupe de beurre mou',
    '1 citron',
    '4 pommes de terre',
    '3 carottes',
    'Sel, poivre, thym',
  ]
  const pouletSteps = [
    'Chauffer le four à 200 °C.',
    'Frotter le poulet de beurre, sel, poivre et thym; glisser le citron dedans.',
    'Entourer des légumes en morceaux et rôtir 1 h 15, en arrosant à mi-cuisson.',
  ]
  const muffinsIngredients = [
    '3 bananes bien mûres',
    '75 ml (1/3 tasse) de beurre fondu',
    '150 g (3/4 tasse) de sucre',
    '1 œuf',
    '190 g (1 1/2 tasse) de farine',
    '1 c. à thé de bicarbonate de soude',
  ]
  const muffinsSteps = [
    'Écraser les bananes, mélanger au beurre, au sucre et à l’œuf.',
    'Incorporer la farine et le bicarbonate.',
    'Répartir dans les moules et cuire 20 min à 180 °C.',
  ]
  const soupeIngredients = [
    'Restes de poulet cuit',
    '1,5 L de bouillon de poulet',
    '200 g de nouilles aux œufs',
    '2 carottes',
    '2 branches de céleri',
    'Persil',
  ]
  const soupeSteps = [
    'Faire mijoter le bouillon avec les carottes et le céleri 15 min.',
    'Ajouter les nouilles et le poulet, cuire 8 min et parsemer de persil.',
  ]

  // ── Extended demo: Le cercle (extended family + tree), a pet + its vet, a home
  // carnet with its upkeep, recipe hearts, a « mot », a trip — so a curious user
  // finds every section alive, not just the board. ids up front so the edges /
  // hearts / carnet-content below can reference them. All media-free.
  const diane = newId() // grandmother (contact)
  const robert = newId() // grandfather (contact)
  const sophie = newId() // aunt (contact — Maman's sister)
  const emma = newId() // cousin (contact — Sophie's daughter)
  const moustache = newId() // the cat (pet)
  const biscuit = newId() // the dog (pet)
  const vetBiz = newId() // the vet (business)
  const plombier = newId() // the plumber (business)
  const pharmacie = newId() // the pharmacy (business)
  const dentisteBiz = newId() // the dental clinic (business)
  const garageBiz = newId() // the garage / mechanic (business)
  const ecoleBiz = newId() // the school (business)
  const julie = newId() // the neighbour (contact)
  const camille = newId() // the babysitter (contact)
  const tplDepart = newId() // « Avant de partir » departure checklist (todo_templates)
  const tplSoccer = newId() // « Sac de soccer » bring-list (todo_templates, ref'd by an event)
  const maison = newId() // the home carnet
  const auto = newId() // the car carnet

  // Days, DST-aware, anchored to today. A full week+ ahead so the plan / agenda /
  // « À venir » all read like a real, busy household rather than a couple of rows.
  const d0 = localDayStart(new Date(ts * 1000))
  const d1 = addLocalDays(d0, 1)
  const d2 = addLocalDays(d0, 2)
  const d3 = addLocalDays(d0, 3)
  const d4 = addLocalDays(d0, 4)
  const d5 = addLocalDays(d0, 5)
  const d6 = addLocalDays(d0, 6)
  const d7 = addLocalDays(d0, 7)
  const d10 = addLocalDays(d0, 10)
  const d12 = addLocalDays(d0, 12)
  const at = (day: number, hours: number) => localTimeOnDay(day, hours * 3600)
  // Half-hour helper for the many timed events below (16h30 = atHalf(d, 16, 30)).
  const atHalf = (day: number, hours: number, mins: number) => localTimeOnDay(day, hours * 3600 + mins * 60)

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
    P(
      `INSERT INTO recipes (id, household_id, title, ingredients_json, steps_json, servings, prep_min, cook_min, notes, tags_json, lang, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fr', ?, ?, ?)`,
    ).bind(
      rPoulet,
      h,
      'Poulet rôti aux légumes',
      JSON.stringify(pouletIngredients),
      JSON.stringify(pouletSteps),
      4,
      15,
      75,
      'Garde la carcasse pour la soupe du lendemain.',
      JSON.stringify(['souper', 'préféré']),
      ts,
      ts,
      S,
    ),
    P(
      `INSERT INTO recipes (id, household_id, title, ingredients_json, steps_json, servings, prep_min, cook_min, tags_json, lang, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'fr', ?, ?, ?)`,
    ).bind(
      rMuffins,
      h,
      'Muffins aux bananes',
      JSON.stringify(muffinsIngredients),
      JSON.stringify(muffinsSteps),
      12,
      10,
      20,
      JSON.stringify(['dessert', 'enfants']),
      ts,
      ts,
      S,
    ),
    P(
      `INSERT INTO recipes (id, household_id, title, ingredients_json, steps_json, servings, prep_min, cook_min, tags_json, lang, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'fr', ?, ?, ?)`,
    ).bind(
      rSoupe,
      h,
      'Soupe poulet et nouilles',
      JSON.stringify(soupeIngredients),
      JSON.stringify(soupeSteps),
      6,
      10,
      25,
      JSON.stringify(['réconfort']),
      ts,
      ts,
      S,
    ),

    // meals — the way a busy household actually keeps a plan: a hero supper most
    // nights, a couple of lunches + breakfasts, two kid-suggested picks, and a tail
    // that thins out as the days get further away. It reaches into the SECOND week
    // on purpose — the grid's default window is 10 days (« Jours affichés »), so a
    // plan stopping at day 6 left the demo household with an empty third of a grid.
    // It still stops short of the window's end, because a real plan does.
    // `date` = local midnight; position 0-based per (date, slot). Several link a
    // recipe so the peek → cook mode works.
    ...[
      // today
      { day: d0, slot: 'breakfast', title: 'Crêpes' },
      { day: d0, slot: 'lunch', title: 'Sandwichs au jambon' },
      { day: d0, slot: 'supper', title: 'Spaghetti maison', cook: papa, recipe: rSpag },
      { day: d0, slot: 'supper', title: 'Salade César', pos: 1 },
      // tomorrow
      { day: d1, slot: 'breakfast', title: 'Gruau et fruits' },
      { day: d1, slot: 'supper', title: 'Tacos au poulet', cook: maman, recipe: rTacos },
      // the week ahead
      { day: d2, slot: 'lunch', title: 'Restes de tacos' },
      { day: d2, slot: 'supper', title: 'Poulet rôti aux légumes', cook: papa, recipe: rPoulet },
      { day: d3, slot: 'supper', title: 'Saumon & riz', suggested: lea },
      { day: d4, slot: 'supper', title: 'Pâté chinois', cook: maman },
      { day: d5, slot: 'supper', title: 'Pizza maison', suggested: lea },
      { day: d6, slot: 'supper', title: 'Soupe poulet et nouilles', recipe: rSoupe },
      // …and into the second week, thinning out.
      { day: d7, slot: 'supper', title: 'Macaroni gratiné', cook: papa },
      { day: addLocalDays(d0, 8), slot: 'supper', title: 'Restes du congélo' },
    ].map((m) =>
      P(
        `INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, recipe_id, suggested_by, position, created_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        newId(),
        h,
        m.day,
        m.slot,
        m.title,
        (m as { cook?: string }).cook ?? null,
        (m as { recipe?: string }).recipe ?? null,
        (m as { suggested?: string }).suggested ?? null,
        (m as { pos?: number }).pos ?? 0,
        ts,
        S,
      ),
    ),

    // events — a genuinely busy agenda: work, kids' activities, appointments, a couple
    // of family get-togethers and an all-day birthday. Member-attributed (member_id set;
    // contact/business null). Timed unless all_day.
    ...(
      [
        // today
        [lea, 'Garderie', at(d0, 9), 0],
        [papa, 'Réunion d’équipe', at(d0, 10), 0],
        [maman, 'Cours de yoga', at(d0, 19), 0],
        // tomorrow
        [lea, 'Soccer', at(d1, 17), 0],
        [noah, 'Cours de natation', atHalf(d1, 18, 30), 0],
        // the week ahead
        [papa, 'Rendez-vous au garage', at(d2, 8), 0],
        [lea, 'Pratique de soccer', at(d2, 17), 0],
        [maman, 'Souper chez Mamie et Papi', at(d3, 18), 0],
        [maman, 'Rendez-vous médecin', at(d4, 14), 0],
        [lea, 'Cours de piano', at(d4, 16), 0],
        [lea, 'Fête de Léa', d5, 1],
        [maman, 'Brunch chez Papi et Mamie', at(d6, 10), 0],
        [noah, 'Fête d’un ami', atHalf(d7, 13, 30), 0],
      ] as [string, string, number, number][]
    ).map(([mid, title, startAt, allDay]) =>
      P(
        `INSERT INTO events (id, household_id, member_id, title, start_at, all_day, created_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, mid, title, startAt, allDay, ts, S),
    ),

    // …plus one TODAY activity that carries a bring-list (events.bring_template_id,
    // mig 0077 → the « À apporter » preview on the departure card + scene).
    P(
      `INSERT INTO events (id, household_id, member_id, title, start_at, all_day, bring_template_id, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(newId(), h, lea, 'Soccer de Léa', at(d0, 17), tplSoccer, ts, S),

    // …and Noah's dentist visit rides its BUSINESS (the clinic has an address), so
    // the rendez-vous peek shows the « Itinéraire » one-tap directions in the demo.
    P(
      `INSERT INTO events (id, household_id, member_id, business_id, title, start_at, all_day, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(newId(), h, noah, dentisteBiz, 'Rendez-vous dentiste', at(d0, 15), ts, S),

    // list_items — a real, full grocery list. The first is attributed to Maman (added_by);
    // the rest are plain manual rows.
    P(
      `INSERT INTO list_items (id, household_id, text, source, added_by, created_at, is_sample)
       VALUES (?, ?, ?, 'manual', ?, ?, ?)`,
    ).bind(newId(), h, 'Lait', maman, ts, S),
    ...[
      'Pain', 'Pommes', 'Bananes', 'Couches', 'Yogourt', 'Fromage', 'Poulet',
      'Céréales', 'Jus d’orange', 'Pâtes', 'Sauce tomate', 'Carottes',
      'Papier essuie-tout', 'Beurre d’arachide',
    ].map((text) =>
      P(
        `INSERT INTO list_items (id, household_id, text, source, created_at, is_sample)
         VALUES (?, ?, ?, 'manual', ?, ?)`,
      ).bind(newId(), h, text, ts, S),
    ),

    // tasks (chores) with a fair rotation (faces, never counts). A household's real
    // weekly chore board — parents share the heavy ones, the kids own a light one each.
    ...(
      [
        ['Sortir les poubelles', [maman, papa], 0, '#88A36F'],
        ['Vaisselle', [papa, maman], 1, '#7BB0C9'],
        ['Lessive', [maman, papa], 0, '#B06A93'],
        ['Passer l’aspirateur', [papa, maman], 1, '#5891AC'],
        ['Nettoyer la salle de bain', [maman, papa], 0, '#88A36F'],
        ['Tondre la pelouse', [papa], 0, '#88A36F'],
        ['Litière du chat', [lea, noah], 0, '#F2A03D'],
        ['Nourrir le chien', [noah, lea], 1, '#F2A03D'],
      ] as [string, string[], number, string][]
    ).map(([title, rotation, idx, colour]) =>
      P(
        `INSERT INTO tasks (id, household_id, title, rotation_json, current_idx, colour, created_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, title, JSON.stringify(rotation), idx, colour, ts, S),
    ),

    // notes — a few fridge notes, each tinted to whoever left it.
    ...(
      [
        ['Bonne chance à ton examen !', maman],
        ['Rappel : rendez-vous chez le dentiste jeudi', papa],
        ['Merci d’avoir rangé le salon ❤️', maman],
        ['Ne pas oublier de sortir le poulet du congélateur', papa],
      ] as [string, string][]
    ).map(([text, mid]) =>
      P(
        `INSERT INTO notes (id, household_id, text, member_id, created_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, text, mid, ts, S),
    ),

    // pantry_low — "running low" flags (never a quantity — calm).
    ...['Beurre', 'Café', 'Papier hygiénique', 'Lait', 'Œufs', 'Ketchup', 'Farine'].map((item) =>
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

    // todos (« À compléter ») — standing items + a few pinned to a day. A busy family's
    // running list of small things to remember. A per-day todo on TOMORROW (day = d1)
    // surfaces on the « Demain » card (mini list + grown body), so the demo shows that
    // night-before checklist alive instead of an empty tomorrow tile.
    ...(
      [
        ['Clés + téléphone + portefeuille', null, null, 0],
        ['Boîte à lunch des enfants', maman, null, 1],
        ['Renouveler les passeports', null, null, 2],
        ['Payer les frais de garderie', papa, null, 3],
        ['Appeler le dentiste pour Noah', maman, d0, 0],
        ['Signer l’agenda de Léa', lea, d1, 0],
        ['Préparer le sac de soccer', lea, d1, 1],
        ['Inscrire Léa au camp de jour', maman, d2, 0],
      ] as [string, string | null, number | null, number][]
    ).map(([title, mid, day, pos]) =>
      P(
        `INSERT INTO todos (id, household_id, title, day, member_id, position, created_at, updated_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, title, day, mid, pos, ts, ts, S),
    ),

    // todo_templates (« Avant de partir » split, mig 0116/0117) — the reusable
    // departure checklists: the household's own leaving list + the soccer bring-list
    // an activity references below (events.bring_template_id).
    P(
      `INSERT INTO todo_templates (id, household_id, title, items_json, position, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(tplDepart, h, 'Avant de partir', JSON.stringify(['Clés de la maison', 'Gourdes remplies', 'Manteaux selon la météo', 'Collations dans le sac']), 0, ts, ts, S),
    P(
      `INSERT INTO todo_templates (id, household_id, title, items_json, position, created_at, updated_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(tplSoccer, h, 'Sac de soccer', JSON.stringify(['Souliers à crampons', 'Gourde', 'Chandail d’équipe', 'Protège-tibias']), 1, ts, ts, S),

    // …an « Avant de partir » instance already on TODAY (one row ticked) so the
    // departure board card reads alive: source_template_id marks each row as a
    // checklist instance (day-pinned, rolls off tomorrow), section = the template's
    // title (the fold header).
    ...(
      [
        ['Clés de la maison', 0, ts],
        ['Gourdes remplies', 1, null],
        ['Manteaux selon la météo', 2, null],
        ['Collations dans le sac', 3, null],
      ] as [string, number, number | null][]
    ).map(([title, pos, doneAt]) =>
      P(
        `INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at, is_sample)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, title, d0, pos, doneAt, 'Avant de partir', tplDepart, ts, ts, S),
    ),

    // ── Extended demo (parents before children for the FK batch) ──────────────

    // businesses — the household's little black book: the vet (referenced by the pets
    // below, soft ref), the plumber, pharmacy, dentist, garage and the kids' school.
    ...(
      [
        [vetBiz, 'Clinique vétérinaire du coin', 'Vétérinaire', '514-555-0199', '120 rue des Érables, Sherbrooke'],
        [plombier, 'Plomberie Gagné', 'Plombier', '514-555-0143', null],
        [pharmacie, 'Pharmacie du village', 'Pharmacie', '514-555-0177', '55 rue Principale, Sherbrooke'],
        [dentisteBiz, 'Clinique dentaire Sourire', 'Dentiste', '514-555-0122', '18 boul. Jacques-Cartier'],
        [garageBiz, 'Garage Auto Expert', 'Garage', '514-555-0188', '250 rue Industrielle'],
        [ecoleBiz, 'École Saint-Joseph', 'École', '514-555-0100', '12 rue de l’École, Sherbrooke'],
      ] as [string, string, string, string, string | null][]
    ).map(([id, name, category, phone, address]) =>
      P(
        `INSERT INTO businesses (id, household_id, name, category, phone, address, created_at, updated_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, h, name, category, phone, address, ts, ts, S),
    ),

    // contacts — the extended family + close circle (grandparents, an aunt + cousin, a
    // neighbour and the babysitter). member_id NULL (they're not household faces).
    ...(
      [
        [diane, 'Diane', 'Tremblay', 'Mamie', '1958-03-15', 'f'],
        [robert, 'Robert', 'Tremblay', 'Papi', '1955-07-22', 'm'],
        [sophie, 'Sophie', 'Tremblay', 'Tata Sophie', '1990-11-08', 'f'],
        [emma, 'Emma', 'Tremblay', null, '2016-02-19', 'f'],
        [julie, 'Julie', 'Bergeron', 'La voisine', null, 'f'],
        [camille, 'Camille', 'Roy', 'Gardienne', '2005-09-14', 'f'],
      ] as [string, string, string, string | null, string | null, string][]
    ).map(([id, first, last, nickname, birthday, gender]) =>
      P(
        `INSERT INTO contacts (id, household_id, first_name, last_name, nickname, birthday, gender, created_at, updated_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, h, first, last, nickname, birthday, gender, ts, ts, S),
    ),

    // pets — the cat and the dog, both with the vet (soft ref).
    ...(
      [
        [moustache, 'Moustache', 'Chat', '#8a8a8a', '2020-05-01'],
        [biscuit, 'Biscuit', 'Chien', '#c08a4a', '2021-08-17'],
      ] as [string, string, string, string, string][]
    ).map(([id, name, species, colour, birthday]) =>
      P(
        `INSERT INTO pets (id, household_id, name, species, colour, birthday, vet_business_id, created_at, updated_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, h, name, species, colour, birthday, vetBiz, ts, ts, S),
    ),

    // carnets — the home + the car (both flat: parent_id NULL, so the clear sweep's
    // single DELETE never hits the self-ref FK). Their content (care_log + upkeep)
    // follows. The car carries make/model/year facts so its carnet reads complete.
    P(
      `INSERT INTO carnets (id, household_id, kind, name, colour, created_at, updated_at, is_sample)
       VALUES (?, ?, 'home', ?, ?, ?, ?, ?)`,
    ).bind(maison, h, 'La maison', '#8a6f5c', ts, ts, S),
    P(
      `INSERT INTO carnets (id, household_id, kind, name, colour, facts_json, created_at, updated_at, is_sample)
       VALUES (?, ?, 'auto', ?, ?, ?, ?, ?, ?)`,
    ).bind(auto, h, 'La Sienna', '#5891AC', JSON.stringify({ make: 'Toyota', model: 'Sienna', year: '2019' }), ts, ts, S),
    // care_log — past services on each carnet (→ carnets, so after them).
    ...(
      [
        [maison, addLocalDays(d0, -14), 'Changé le filtre de la fournaise'],
        [maison, addLocalDays(d0, -60), 'Ramonage de la cheminée'],
        [auto, addLocalDays(d0, -30), 'Changement d’huile'],
        [auto, addLocalDays(d0, -120), 'Pneus d’hiver installés'],
      ] as [string, number, string][]
    ).map(([carnetId, atSec, title]) =>
      P(
        `INSERT INTO care_log (id, household_id, carnet_id, at, kind, title, created_at, updated_at, is_sample)
         VALUES (?, ?, ?, ?, 'service', ?, ?, ?, ?)`,
      ).bind(newId(), h, carnetId, atSec, title, ts, ts, S),
    ),
    // home_projects — dated upkeep + a planned project (surface on the board's « Cette
    // saison » / « Les carnets »). Tied to the home or the car carnet.
    ...(
      [
        ['upkeep', 'Nettoyer les gouttières', d5, maison, '#8a6f5c'],
        ['upkeep', 'Changer les piles des détecteurs de fumée', d7, maison, '#8a6f5c'],
        ['upkeep', 'Rotation des pneus', d4, auto, '#5891AC'],
        ['plan', 'Rénover la salle de bain', d12, maison, '#8a6f5c'],
      ] as [string, string, number, string, string][]
    ).map(([kind, title, atSec, carnetId, colour]) =>
      P(
        `INSERT INTO home_projects (id, household_id, kind, title, colour, at, carnet_id, created_at, updated_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, kind, title, colour, atSec, carnetId, ts, ts, S),
    ),

    // cercle edges — a 3-generation tree (grandparents → their two children Maman +
    // Sophie → the grandkids), the kids' pets, and a neighbour friendship. Polymorphic,
    // no DB FK; reverse_type from lib/cercleRelations INVERSES.
    link(robert, 'contact', diane, 'contact', 'spouse', 'spouse'),
    link(diane, 'contact', maman, 'member', 'parent', 'child'),
    link(diane, 'contact', sophie, 'contact', 'parent', 'child'),
    link(sophie, 'contact', emma, 'contact', 'parent', 'child'),
    link(maman, 'member', lea, 'member', 'parent', 'child'),
    link(maman, 'member', noah, 'member', 'parent', 'child'),
    link(papa, 'member', lea, 'member', 'parent', 'child'),
    link(papa, 'member', noah, 'member', 'parent', 'child'),
    link(lea, 'member', moustache, 'pet', 'owner', 'pet'),
    link(noah, 'member', biscuit, 'pet', 'owner', 'pet'),
    link(maman, 'member', julie, 'contact', 'friend', 'friend'),

    // recipe hearts (#21) — which faces love which dish (faces, never a count). Composite
    // PK, no id column; → recipes + members, so after both (inserted first).
    ...(
      [
        [rSpag, maman], [rSpag, papa], [rSpag, noah],
        [rPoulet, papa], [rPoulet, lea],
        [rMuffins, noah], [rMuffins, lea],
        [rTacos, noah],
      ] as [string, string][]
    ).map(([recipeId, mid]) =>
      P(
        `INSERT OR IGNORE INTO recipe_loves (household_id, recipe_id, member_id, created_at, is_sample) VALUES (?, ?, ?, ?, ?)`,
      ).bind(h, recipeId, mid, ts, S),
    ),

    // « mots » — notes waiting (unopened) on a kid's face. Media-free.
    ...(
      [
        [lea, maman, 'Je suis fière de toi ❤️'],
        [noah, papa, 'Bravo pour ta lecture ! 📚'],
        [lea, papa, 'Bonne partie de soccer aujourd’hui ⚽'],
      ] as [string, string, string][]
    ).map(([mid, author, text]) =>
      P(
        `INSERT INTO mots (id, household_id, member_id, author_member_id, text, created_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, mid, author, text, ts, S),
    ),

    // trips (« Voyage ») — a weekend at the lake soon, and a camping trip a bit further out.
    ...(
      [
        ['Chalet au lac', 'Lac Memphrémagog', d10, d12, [maman, papa, lea, noah], '#5891AC', 0],
        ['Camping au parc national', 'Parc national du Mont-Orford', addLocalDays(d0, 24), addLocalDays(d0, 26), [maman, papa, lea, noah], '#88A36F', 1],
      ] as [string, string, number, number, string[], string, number][]
    ).map(([title, dest, startAt, endAt, mem, colour, pos]) =>
      P(
        `INSERT INTO trips (id, household_id, title, destination, start_at, end_at, members, colour, position, created_at, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, title, dest, startAt, endAt, JSON.stringify(mem), colour, pos, ts, S),
    ),

    // undated leftovers (« À finir ») — dishes to eat first, no day chosen. No quantity
    // (calm) — dish names only.
    ...['Pâté chinois', 'Soupe aux légumes', 'Poulet à la grecque'].map((title) =>
      P(
        `INSERT INTO meal_leftovers (id, household_id, title, created_at, is_sample) VALUES (?, ?, ?, ?, ?)`,
      ).bind(newId(), h, title, ts, S),
    ),

    // work schedule windows (« L'auto ») — Papa takes the car Mon–Fri 8h–17h (holds_car),
    // Maman works Tue/Thu 9h–16h without it, so the car card shows a real weekly backdrop
    // instead of « libre toute la journée ». start/end are MINUTES from local midnight;
    // recurrence is the shared weekly Recur rule (migration 0090 folded the old `weekdays`
    // column into `recur_json`): weekdays 1..5 = Mon–Fri (0=Sun), every week.
    P(
      `INSERT INTO schedule_blocks (id, household_id, member_id, label, start_min, end_min, recur_json, holds_car, colour, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).bind(newId(), h, papa, 'Travail', 8 * 60, 17 * 60, JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }), '#5891AC', ts, S),
    P(
      `INSERT INTO schedule_blocks (id, household_id, member_id, label, start_min, end_min, recur_json, holds_car, colour, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(newId(), h, maman, 'Travail', 9 * 60, 16 * 60, JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [2, 4] }), '#B06A93', ts, S),

    // habits (« Mes habitudes ») — two household-wide, one Maman's own. No history rows
    // (habit_days): an un-touched habit reads as a neutral, un-checked today. anchor_at
    // = now so occurrences start today; recur_json NULL = every day.
    P(
      `INSERT INTO habits (id, household_id, member_id, title, icon, colour, kind, cadence, anchor_at, position, created_at, is_sample)
       VALUES (?, ?, NULL, ?, ?, ?, 'do', 'recur', ?, 0, ?, ?)`,
    ).bind(newId(), h, 'Marcher dehors', '🚶', '#88A36F', ts, ts, S),
    P(
      `INSERT INTO habits (id, household_id, member_id, title, icon, colour, kind, cadence, anchor_at, position, created_at, is_sample)
       VALUES (?, ?, NULL, ?, ?, ?, 'do', 'recur', ?, 1, ?, ?)`,
    ).bind(newId(), h, 'Lire en famille', '📖', '#B06A93', ts, ts, S),
    P(
      `INSERT INTO habits (id, household_id, member_id, title, icon, colour, kind, target, unit, cadence, anchor_at, position, created_at, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, 'count', 8, ?, 'recur', ?, 2, ?, ?)`,
    ).bind(newId(), h, maman, 'Boire de l’eau', '💧', '#5891AC', 'verres', ts, ts, S),

    // family notes (« Notes (cercle) ») — durable Maisonnée notes (member_id NULL),
    // titled + lightweight Markdown body, attributed to whoever wrote it. Media-free.
    ...(
      [
        ['Gardienne', 'Numéro de la gardienne : 514-555-0176.\nCoucher des enfants à 19 h 30.', maman],
        ['Wifi', 'Réseau : **Maison-Tremblay**\nMot de passe : `pommeverte2024`', papa],
        ['Numéros d’urgence', '- Poison : 1-800-463-5060\n- Voisine (Julie) : 514-555-0161\n- Mamie & Papi : 514-555-0134', maman],
      ] as [string, string, string][]
    ).map(([title, text, author]) =>
      P(
        `INSERT INTO family_notes (id, household_id, member_id, author_member_id, title, text, created_at, updated_at, is_sample)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), h, author, title, text, ts, ts, S),
    ),
  ]

  await env.DB.batch(stmts)
  return members.length
}
