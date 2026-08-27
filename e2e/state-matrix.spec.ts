import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mockApi, seedState, type Audience, type Lang, type Surface, type Theme } from './mocks'
import { installVvStub, openKeyboard } from './kb'
import { worstRightBleed } from './overflow'

// The STATE MATRIX — a declarative sweep of "the app in a state": a route, an
// optional interaction that opens something (sheet / scene / editor), a lens
// combination, optionally the fake keyboard. Each state yields:
//   • a screenshot   → e2e/screenshots/matrix/<name>.png
//   • assertions     → no page error, no per-child right-edge bleed (overflow.ts),
//                      focused element above the keyboard when one is open (kb.ts)
//   • a manifest row → merged into e2e/screenshots/matrix/manifest.json by
//                      sm.teardown.ts — THE entry point for a Claude review pass:
//                      read the manifest, then read the flagged/sampled PNGs.
//
// Capture + assert, deliberately NO pixel baselines: an intentional restyle never
// breaks this suite; a structural regression (bleed, crash, hidden field) does.
// Runs ONLY under e2e/sm.config.ts (`npm run e2e:matrix`) — testIgnore'd from the
// default harness so the per-push e2e stays fast.

const OUT = join(fileURLToPath(new URL('.', import.meta.url)), 'screenshots', 'matrix')

type Entry = {
  name: string
  route: string
  /** Open the state (sheet/scene/editor) after navigation; also does any focusing. */
  setup?: (page: Page) => Promise<void>
  /** Box whose descendants must not bleed right (default '#root'; portals need their own). */
  scope?: string
  viewport?: { w: number; h: number }
  themes?: Theme[]
  audience?: Audience
  lang?: Lang
  surface?: Surface
  longText?: boolean
  fresh?: boolean
  /** A brand-new VISITOR: no session at all (the marketing door, the sign-up form). */
  signedOut?: boolean
  /** The demo sandbox session (the claim banner, the try-this card). */
  sandbox?: boolean
  /** Fake-keyboard height (px) to slide in after setup. Requires setup to focus a field. */
  keyboard?: number
  /** Fixture overrides for this entry (see mockApi `overrides`). Use it when the
   *  shared fixture is deliberately EMPTY: a budget measured against an empty state
   *  guards the wrong screen — /notes was ratcheted at 209px while showing « Aucune
   *  note pour l'instant », so the density the lean pass was FOR went unmeasured. */
  api?: Record<string, unknown>
  /** The page's FIRST content item — the thing you came to this surface to see (a
   *  list row, a card, a form's first field). Its distance from the top of the
   *  scroller is `contentTopPx`: how much chrome you scroll past before the
   *  content starts. Omit and the state is measured for text only, never budgeted. */
  content?: string
  /** Ceiling for `contentTopPx`. A RATCHET, not a taste judgement: every number
   *  here was read off a real baseline run and given ~10% tolerance, so a surface
   *  can never grow its chrome back — and a surface that legitimately leads with a
   *  hero simply carries a bigger number. Tighten it in the same commit as a lean
   *  pass; it only ever moves down. See LEAN.md. */
  budgetPx?: number
}

// « Les notes » ships with an EMPTY family-notes fixture (the behavioural specs want
// it that way), so this entry seeds its own: the tab's whole lean brief was "maximum
// note content per pixel", and an empty page cannot show whether we delivered it.
const NOTE_SEED = (id: string, title: string, text: string, position: number, at = 1_700_000_000) => ({
  id,
  member_id: null,
  author_member_id: null,
  title,
  text,
  media_kind: null,
  media_key: null,
  scene_key: null,
  position,
  created_at: at,
  updated_at: at,
})
const NOTES_FIXTURE = {
  'family-notes': {
    notes: [
      // Two on one day, one on another: the rows must show the date ONCE per run of
      // the same day, and print it again when the day changes.
      NOTE_SEED('n1', 'Couture', 'kit été rouge : short en twill, doublure coton', 0),
      NOTE_SEED('n2', 'Garderie', 'apporter les bottes de pluie lundi', 1),
      NOTE_SEED('n3', 'Épicerie', 'la marque de yogourt que Léa mange est la bleue', 2, 1_700_000_000 - 2 * 86_400),
    ],
  },
}

// Business and Carnets both ship an EMPTY shared fixture (« calm default »), so both
// were budgeting their own empty state until the guard below started refusing that.
// Two rows each: enough for the row rhythm to be visible and measured, no more.
const BUSINESS_FIXTURE = {
  businesses: {
    businesses: [
      { id: 'b1', name: 'Clinique vétérinaire Papineau', category: 'veterinaire', phone: '514-555-0142', email: null, address: null, website: null, notes: null, photoKey: null, colour: null },
      { id: 'b2', name: 'Plomberie Lachance', category: 'plombier', phone: '514-555-0188', email: null, address: null, website: null, notes: null, photoKey: null, colour: null },
    ],
  },
}
const CARNET = (id: string, name: string, kind: string, sort: number) => ({
  id,
  parentId: null,
  kind,
  name,
  mediaKey: null,
  color: '#8a7fd0',
  facts: null,
  installedAt: null,
  lifespanMonths: null,
  linkId: null,
  notes: null,
  sort,
})
const CARNETS_FIXTURE = {
  carnets: {
    carnets: [CARNET('c1', 'La maison', 'home', 0), CARNET('c2', "L'auto", 'auto', 1)],
    soon: [],
  },
}

// « Planifier une journée » (/kitchen/day/:date) — the one screen where a whole day
// is composed, and it was missing from this sweep entirely, which is how it grew four
// hand-rolled headings and two full-width add bars unmeasured. The shared `month`
// fixture is empty, so seed the day it exists to show: two TIMED rendez-vous (enough
// for « Le fil du jour » to draw the ribbon, the busy-day shape), one of them carrying
// a note (migration 0121), an all-day row for the bucket below the ribbon, and a
// corvée. The todos fixture already pins two items to today.
const TODAY_MIDNIGHT = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
})()
const DAY_FIXTURE = {
  month: {
    events: [
      { id: 'de1', title: 'Dentiste — Léa', at: TODAY_MIDNIGHT + 9 * 3600, all_day: 0, member_id: 'm3', day: TODAY_MIDNIGHT, notes: 'apporter la carte d’assurance maladie · 3e étage' },
      { id: 'de2', title: 'Soccer', at: TODAY_MIDNIGHT + 18 * 3600, all_day: 0, member_id: 'm1', day: TODAY_MIDNIGHT },
      { id: 'de3', title: 'Collecte des ordures', at: TODAY_MIDNIGHT, all_day: 1, member_id: null, day: TODAY_MIDNIGHT },
    ],
    meals: [],
    chores: [{ id: 'dc1', title: 'Vider le lave-vaisselle', color: '#88A36F', who: 'Papa', day: TODAY_MIDNIGHT }],
    dayNotes: [],
    todos: [],
    homeProjects: [],
    trips: [],
    tripPlans: [],
    habits: [],
  },
}

// « Voyage » — the shared `trips` route has no fixture at all (the behavioural specs
// stub it per test), so this seeds one trip with a couple of infos: enough for the
// scene to render its real body instead of its « aucun voyage » face.
const TRIP_FIXTURE = {
  trips: {
    trips: [
      {
        id: 'tp1',
        title: 'Gaspésie',
        destination: 'Percé',
        start_at: TODAY_MIDNIGHT + 20 * 86_400,
        end_at: TODAY_MIDNIGHT + 27 * 86_400,
        members: ['m1', 'm3'],
        media_kind: null,
        media_key: null,
        colour: '#2a8f85',
        notes: null,
        position: 0,
        created_at: 1_700_000_000,
        updated_at: null,
      },
    ],
  },
  'trip-notes': {
    notes: [
      { id: 'tn1', trip_id: 'tp1', category: 'transport', label: 'Vol AC 8712', text: 'départ 7 h 40, porte B12', media_kind: null, media_key: null, scene_key: null, member_id: null, date: null, position: 0, created_at: 1_700_000_000, updated_at: null },
      { id: 'tn2', trip_id: 'tp1', category: 'lodging', label: 'Chalet du phare', text: '2 chambres · arrivée après 16 h', media_kind: null, media_key: null, scene_key: null, member_id: null, date: null, position: 1, created_at: 1_700_000_000, updated_at: null },
    ],
  },
}

const PHONE = { w: 390, h: 844 }
const WALL = { w: 1280, h: 800 }
const KB = 336

const openAddSheet = async (page: Page) => {
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
}

// Drill the ＋ sheet into ONE composer — the « generous inside » states. The sweep
// used to photograph the sheet's CHOOSER only, so the surfaces where a labeled CTA
// squeezed the field down to ~60px of text were never in a picture. (The numeric
// half of that guard is e2e/composer-fit.spec.ts's typing-width floor; these are
// the states a review pass actually LOOKS at.)
const openComposer = (mode: string) => async (page: Page) => {
  await openAddSheet(page)
  const tile = page.locator(`.sheet.show .cat-pick[data-mode="${mode}"]`)
  await expect(tile).toHaveCount(1)
  await tile.click()
  await expect(page.locator('.sheet.show .addsheet__panel .edit-field__input').first()).toBeVisible()
}

const openNoteEditor = async (page: Page) => {
  // NOT « Nouvelle note »: that button is advanced-mode chrome (lib/notesMode), and
  // Les notes defaults to its lean READING face. ?add=1 is the canonical door in
  // both faces — the same one advanced's own button navigates to.
  await page.goto('/notes?add=1')
  await expect(page.locator('.note-editor')).toBeVisible()
  await page.locator('.note-editor__body').click()
}

// CHROME BUDGETS (`budgetPx`) — baselined 2026-08-26 at 390px from a real run,
// each set to its own measured `contentTopPx` + ~10% (min +16px) for font and
// rounding drift. They are a RATCHET: a surface may never push its content further
// down than the day its number was set, and the number only ever moves DOWN, in the
// same commit as the lean pass that earns it. Raising one is allowed but must be
// deliberate and said out loud in the commit — silently re-baselining is the exact
// drift this exists to stop. See LEAN.md.
//
// Read them as a worklist, not a verdict. maison-family and maison-social were the
// two worst (540 / 392px); working them 2026-08-26 is what the distinction is FOR.
// Famille lost 54px with nothing removed — « Anniversaires à venir » is content and
// keeps its place at the top (a birthday is time-sensitive; the directory below it
// is reference), so the tile was laid sideways instead of being cut or demoted.
// Social was left alone at 392px: its three bands are the section pills, the view
// switch and the focus lens — all controls, none removable without losing a door.
// A number with nothing behind it gets ratcheted and left, never trimmed to look
// good. The number is a signal; the screenshot beside it is the judgement.
const MATRIX: Entry[] = [
  // — the six hub tabs at rest, phone, both themes —
  { name: 'board', route: '/board', content: '.wg-slot', budgetPx: 235 },
  { name: 'kitchen', route: '/kitchen', content: '.kitchen__meal-list, .kitchen__week', budgetPx: 160 },
  { name: 'liste', route: '/liste', content: '.list-rows > *', budgetPx: 218 },
  { name: 'notes', route: '/notes', content: '.cnote', budgetPx: 217, api: NOTES_FIXTURE },
  { name: 'maison', route: '/maison', content: '.routine-card, .cercle-row', budgetPx: 244 },
  { name: 'settings', route: '/settings', content: '.operator__section, .operator__tabs', budgetPx: 90 },
  // — signature opened states —
  { name: 'board-addsheet', route: '/board', setup: openAddSheet, scope: '.sheet.show' },
  // The composers themselves. « Restants » carries the app's longest CTA
  // (« ＋ À finir bientôt ») and a combobox caret — the row that started the
  // 2026-08-26 pass; « À compléter » adds a scope row and a second CTA under the
  // same field.
  { name: 'kitchen-composer-restants', route: '/kitchen', setup: openComposer('leftovers'), scope: '.sheet.show', themes: ['day'] },
  { name: 'board-composer-todo', route: '/board', setup: openComposer('todo'), scope: '.sheet.show', themes: ['day'] },
  {
    name: 'kitchen-ideas',
    route: '/kitchen',
    setup: async (page) => {
      await page.locator('.kitchen__ideas-opener .btn--primary').click()
      await expect(page.locator('.ideas-drawer .scene__body')).toBeVisible()
    },
    scope: '.ideas-drawer .scene__body',
  },
  { name: 'note-editor', route: '/notes', setup: openNoteEditor, scope: '.note-editor' },
  // — THE SUB-SURFACES. The matrix used to stop at each hub tab's DEFAULT sub-tab,
  //   which is why every one of the 2026-08 lean passes found its fat somewhere the
  //   sweep had never looked: the garde-manger's three stacked composers, the recipe
  //   book's permanent filter rows, the five Maison sections, and the heavy form
  //   scenes. Phone + day only — these are measured for chrome, not for theming.
  { name: 'kitchen-meals', route: '/kitchen?tab=meals', content: '.kitchen__meal-list, .kitchen__week', budgetPx: 160, themes: ['day'] },
  { name: 'kitchen-pantry', route: '/kitchen?tab=pantry', content: '.kitchen__soon li, .kitchen__low li', budgetPx: 249, themes: ['day'] },
  { name: 'kitchen-recipes', route: '/kitchen?tab=recipes', content: '.recipe-card', budgetPx: 214, themes: ['day'] },
  { name: 'kitchen-history', route: '/kitchen?tab=history', content: '.kitchen__history .kitchen__week', budgetPx: 200, themes: ['day'] },

  { name: 'maison-routines', route: '/maison?section=routines', content: '.routine-card', budgetPx: 244, themes: ['day'] },
  { name: 'maison-family', route: '/maison?section=family', content: '.cercle-row', budgetPx: 535, themes: ['day'] },
  { name: 'maison-social', route: '/maison?section=social', content: '.cercle-row', budgetPx: 432, themes: ['day'] },
  { name: 'maison-business', route: '/maison?section=business', content: '.cercle-row', budgetPx: 194, themes: ['day'], api: BUSINESS_FIXTURE },
  { name: 'maison-carnets', route: '/maison?section=carnets', content: '.cercle-row', budgetPx: 194, themes: ['day'], api: CARNETS_FIXTURE },

  { name: 'settings-board', route: '/settings?tab=board&lens=regler', content: '.operator__section', budgetPx: 308, themes: ['day'] },
  { name: 'settings-systeme', route: '/settings?tab=settings&lens=regler', content: '.operator__section', budgetPx: 308, themes: ['day'] },

  // — THE FORM SCENES. Four of these opened as a wall of fields before the lean
  //   pass; the budget is what keeps them from filling back up.
  { name: 'form-event', route: '/event/new', content: '.edit-field__input, .input', budgetPx: 33, themes: ['day'] },
  { name: 'form-chore', route: '/chore/new', content: '.edit-field__input, .input', budgetPx: 33, themes: ['day'] },
  { name: 'form-person', route: '/cercle/person/new', content: '.cf__input', budgetPx: 156, themes: ['day'] },
  { name: 'form-pet', route: '/cercle/pet/new', content: '.input', budgetPx: 32, themes: ['day'] },
  { name: 'form-recipe', route: '/kitchen/recipe/new', content: '.recipe-title-input', budgetPx: 32, themes: ['day'] },
  { name: 'form-habit', route: '/habitude/new', content: '.edit-field__input, .input', budgetPx: 33, themes: ['day'] },
  { name: 'departure', route: '/board/departure', content: '.todo-sec, .departure__wx', budgetPx: 32, themes: ['day'] },
  // « Planifier une journée » — the day scene. `content` is the day's first ACTUAL
  // row (a rendez-vous, in the ribbon or the bucket below it), so the number answers
  // the question that matters here: how far do you scroll before the day itself
  // starts? The weather strip and the day's own note headline sit above it and are
  // content too — they are what the budget deliberately allows for.
  { name: 'day-plan', route: `/kitchen/day/${TODAY_MIDNIGHT}`, content: '.day-plan__sec .act', budgetPx: 178, themes: ['day'], api: DAY_FIXTURE },
  { name: 'day-plan-wall', route: `/kitchen/day/${TODAY_MIDNIGHT}`, surface: 'kiosk', viewport: WALL, content: '.day-plan__sec .act', budgetPx: 178, themes: ['day'], api: DAY_FIXTURE },

  // — THE SCENES THE SWEEP HAD NEVER OPENED. `day-plan` was found by asking what this
  //   table does NOT list (LEAN.md), and the same question turned up seventeen more:
  //   the recipe you actually read, the book you pick it from, cook mode, the in-store
  //   cashier surface, the flyer browser, the list-row editor, « Mes habitudes », the
  //   routine builder and its player, « Notre monde », a carnet, the drawings wall,
  //   the postbox, « Jouer », the home-project form and global search. Every one is a
  //   door someone opens weekly; none had a number. Phone + day: measured for chrome.
  { name: 'search', route: '/search?q=spag', content: '.search__row', budgetPx: 167, themes: ['day'] },
  { name: 'recipe-view', route: '/kitchen/recipe/rc1', content: '.recipe-view__img, .recipe-view__ings li', budgetPx: 230, themes: ['day'] },
    // « Mon livre de cuisine » is a picture BOOK — a designed cover page you turn, not
  // a list with a first row; it is here for the screenshot + bleed + crash guards, and
  // deliberately carries no contentTopPx (there is nothing to measure chrome against).
  { name: 'recipe-book', route: '/kitchen/book', themes: ['day'] },
  { name: 'cook', route: '/kitchen/recipe/rc1/cook', content: '.cook__full-ings li, .cook__ing-box', budgetPx: 140, themes: ['day'] },
  // « À la caisse » is deliberately NOT budgeted: its tiles are vertically CENTRED (a
  // thumb target at the till), so `contentTopPx` there measures how few staged deals
  // the fixture holds — one — not how much chrome the surface spends. A budget read
  // off that number would guard the fixture. Screenshot + bleed + crash guards only,
  // until the shared list fixture stages more than a single deal.
  { name: 'cashier', route: '/liste/cashier', content: '.cashier__tile, .bigcard', themes: ['day'] },
  // « Les circulaires » opens on an EMPTY search (nothing to browse until you type),
  // so measure the half that has rows: « Par magasin », the flyer list.
  {
    name: 'circulaires',
    route: '/liste/circulaires',
    setup: async (page) => {
      await page.getByRole('tab', { name: /magasin/i }).click()
      await expect(page.locator('.flyer-store').first()).toBeVisible()
    },
    content: '.flyer-store',
    budgetPx: 104,
    themes: ['day'],
  },
  { name: 'quickadd', route: '/liste/quick', content: '.list-row', budgetPx: 92, themes: ['day'] },
  { name: 'list-item', route: '/liste/item/l1', content: '.li-edit__field, .li-edit__row', budgetPx: 40, themes: ['day'] },
  // 288px, and NOT fat — the third case this table exists to distinguish. What sits
  // above the first habit is the « qui es-tu aujourd'hui » face row (the lens the whole
  // scene answers through) and « Le défi du jour » (a thing you DO today, drawn here as
  // the morning ritual). Both are content. Budgeted so they can't grow; not cut.
  { name: 'habitudes', route: '/board/habitudes', content: '.habitudes__item', budgetPx: 317, themes: ['day'] },
  // The routine PLAYER is a pre-reader's picture screen (one big card, centred): the
  // empty space IS the design, exactly like maison-toddler. Screenshot + guards only.
  { name: 'routine-run', route: '/routine/r1/run', themes: ['day'] },
  { name: 'routine-form', route: '/routine/r1', content: '.edit-field__input, .input', budgetPx: 33, themes: ['day'] },
  { name: 'form-home-project', route: '/home-project/new', content: '.edit-field__input, .input', budgetPx: 33, themes: ['day'] },
  { name: 'carnet', route: '/cercle/carnet/c1', content: '.carnet-block, .carnet-chose', budgetPx: 194, themes: ['day'], api: CARNETS_FIXTURE },
  { name: 'monde', route: '/cercle/monde', content: '.scene__body > *', budgetPx: 16, themes: ['day'] },
  { name: 'courrier', route: '/courrier', content: '.cf__field, .intake__h', budgetPx: 127, themes: ['day'] },
  { name: 'drawings', route: '/drawings', content: '.drawgallery__item', budgetPx: 89, themes: ['day'] },
  { name: 'jouer', route: '/jouer', content: '.play-door', budgetPx: 84, themes: ['day'] },
  // …and the rest of the router's scenes, so "what this table does NOT list" is a
  // question with a short answer. « Voyage » needs its own fixture (the shared trips
  // route is empty); the others read caches the default fixture already fills.
  { name: 'voyage', route: '/voyage/tp1', content: '.voyage-note, .voyage__day, .sec-label', themes: ['day'], api: TRIP_FIXTURE },
  { name: 'price-match', route: '/liste/deals/l1', content: '.pm__deal, .bigcard, .scene__body > *', budgetPx: 32, themes: ['day'] },
  { name: 'multicook', route: '/kitchen/cook/multi?r=rc1,rc2', content: '.mcook__step, .cook__full-ings li, .scene__body > *', budgetPx: 178, themes: ['day'] },
  { name: 'person-edit', route: '/cercle/person/c1', content: '.cf__input', budgetPx: 156, themes: ['day'] },
  { name: 'intake', route: '/intake', content: '.cf__input, .intake__h', budgetPx: 146, themes: ['day'] },
  // « La fenêtre famille » and « Bienvenue » are GUEST-link scenes: with an ordinary
  // operator fixture they land on their empty state, and the matrix's own guard refuses
  // to budget one (rightly — see LEAN.md). Reported-only until a guest fixture exists.
  { name: 'family-window', route: '/family', content: '.scene__body > *, .page > *', themes: ['day'] },
  { name: 'welcome', route: '/welcome', content: '.scene__body > *, .page > *', themes: ['day'] },
  { name: 'voiture', route: '/voiture', content: '.voiture__day, .voiture__week > *', budgetPx: 189, themes: ['day'] },

  // — THE TWO LENSES CLAUDE.md CALLS STANDING RULES, and which the sweep had only
  //   ever seen on the board. « Every UI change must be tablet-friendly, especially
  //   for Toddler mode » and « desktop-friendly too » — yet toddler and the 1280px
  //   wall each had exactly ONE entry here. A pre-reader's screen and a wall tablet
  //   read nothing like a phone: the toddler lens is picture-first with big targets
  //   (so chrome costs it more), and the wall has room to spare (so chrome there is
  //   cheap but bleed is not). Both get the same contentTopPx treatment as the rest.
  //   Réglages is absent from the toddler set on purpose: the lens hides it and
  //   /settings redirects (a locked kiosk is a one-way door).
  { name: 'board-toddler', route: '/board', audience: 'toddler', content: '.today-hero, .kid__main > *', budgetPx: 16 },
  { name: 'kitchen-toddler', route: '/kitchen', audience: 'toddler', content: '.kid-head, .kid-pick', budgetPx: 48, themes: ['day'] },
  { name: 'liste-toddler', route: '/liste', audience: 'toddler', content: '.bigtiles', budgetPx: 208, themes: ['day'] },
  { name: 'notes-toddler', route: '/notes', audience: 'toddler', content: '.cercle-kid__grid, .cercle-kid > *', budgetPx: 32, themes: ['day'], api: NOTES_FIXTURE },
  { name: 'maison-toddler', route: '/maison', audience: 'toddler', content: '.kid__faces, .kid__main > *', budgetPx: 238, themes: ['day'] },

  // board-kiosk (334px) and maison-toddler (216px) are the two biggest numbers in
  //   this table and NEITHER is fat: a wall tablet is read from across a room, so its
  //   greeting is deliberately large type, and the toddler Maison is a centred
  //   picture screen whose empty space IS the design for a pre-reader's thumb. Budgeted
  //   so they cannot GROW; not cut. The number is a signal, the screenshot is the
  //   judgement (LEAN.md).
  { name: 'board-kiosk', route: '/board', surface: 'kiosk', viewport: WALL, content: '.wg-slot', budgetPx: 368 },
  { name: 'kitchen-wall', route: '/kitchen', surface: 'kiosk', viewport: WALL, content: '.kitchen__meal-list, .kitchen__week', budgetPx: 205, themes: ['day'] },
  { name: 'liste-wall', route: '/liste', surface: 'kiosk', viewport: WALL, content: '.list-rows > *', budgetPx: 264, themes: ['day'] },
  { name: 'notes-wall', route: '/notes', surface: 'kiosk', viewport: WALL, content: '.cnote', budgetPx: 277, themes: ['day'], api: NOTES_FIXTURE },
  { name: 'maison-wall', route: '/maison', surface: 'kiosk', viewport: WALL, content: '.routine-card, .cercle-row', budgetPx: 291, themes: ['day'] },
  { name: 'settings-wall', route: '/settings', surface: 'kiosk', viewport: WALL, content: '.operator__section, .operator__tabs', budgetPx: 78, themes: ['day'] },
  { name: 'board-en', route: '/board', lang: 'en', themes: ['day'] },
  // — data extremes —
  { name: 'liste-longtext', route: '/liste', longText: true },
  // — FIRST RUN: the whole walk a brand-new household takes. `fresh` empties every
  //   household array (mocks.ts), so these are the screens a real first day shows —
  //   the front door, the sign-up, then each tab with genuinely nothing in it. An
  //   empty tab that dead-ends (no door, no words) is the bug this set exists to find.
  { name: 'first-home', route: '/', signedOut: true, themes: ['day'] },
  { name: 'first-signup', route: '/signup', signedOut: true, themes: ['day'] },
  { name: 'board-fresh', route: '/board', fresh: true, themes: ['day'] },
  { name: 'first-kitchen', route: '/kitchen', fresh: true, themes: ['day'] },
  { name: 'first-liste', route: '/liste', fresh: true, themes: ['day'] },
  { name: 'first-notes', route: '/notes', fresh: true, themes: ['day'] },
  { name: 'first-maison', route: '/maison', fresh: true, themes: ['day'] },
  { name: 'first-settings', route: '/settings', fresh: true, themes: ['day'] },
  // — THE DEMO: what a curious visitor actually gets. The sandbox is an ordinary
  //   operator session marked by its email, so the board wears the claim banner.
  { name: 'demo-board', route: '/board', sandbox: true, themes: ['day'] },
  // — keyboard-open states (the stub from kb.ts; setup must leave a field focused) —
  { name: 'note-editor-kb', route: '/notes', setup: openNoteEditor, scope: '.note-editor', keyboard: KB, themes: ['day'] },
  {
    name: 'board-addsheet-kb',
    route: '/board',
    setup: async (page) => {
      await openAddSheet(page)
      await page.locator('.sheet.show input:visible, .sheet.show textarea:visible, .sheet.show [contenteditable]:visible').first().click()
    },
    scope: '.sheet.show',
    keyboard: KB,
    themes: ['day'],
  },
]

mkdirSync(OUT, { recursive: true })

for (const entry of MATRIX) {
  for (const theme of entry.themes ?? (['day', 'night'] as Theme[])) {
    const id = `${entry.name}-${theme}`
    test(`state ${id}`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(String(e)))
      const vp = entry.viewport ?? PHONE
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width: vp.w, height: vp.h })
      if (entry.keyboard) await installVvStub(page)
      await mockApi(page, {
        longText: entry.longText,
        fresh: entry.fresh,
        sandbox: entry.sandbox,
        signedIn: entry.signedOut ? false : undefined,
        overrides: entry.api,
      })
      await seedState(page, {
        theme,
        audience: entry.audience ?? 'parent',
        lang: entry.lang ?? 'fr',
        // A brand-new VISITOR has chosen no surface — and `/` redirects straight to
        // /board the moment one is stored (router Entry: `chosen || isPaired()`), so
        // seeding it would have photographed the board and called it the front door.
        surface: entry.signedOut ? undefined : (entry.surface ?? 'mobile'),
      })
      await page.goto(entry.route)
      await page
        .locator('.hub, .page, .board-wall')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {})
      if (entry.setup) await entry.setup(page)
      if (entry.keyboard) await openKeyboard(page, entry.keyboard)
      await page.waitForTimeout(300) // settle animations/late paints

      // A BLANK capture must never pass. An empty page still has #root, so the
      // bleed check reads 0 and every other assertion holds — a cold-compile race
      // silently shipped white PNGs that looked like green states. Demand real
      // painted text before we believe (and photograph) the state.
      const painted = await page.evaluate(() => (document.body.innerText ?? '').trim().length)
      if (painted < 10) {
        await page.waitForTimeout(1200) // one grace period for a slow first paint
      }

      // Measure BEFORE asserting so a failing state still lands in the manifest
      // and on disk — a red test with no evidence is exactly what this suite
      // exists to avoid.
      const textLen = await page.evaluate(() => (document.body.innerText ?? '').trim().length)
      // …and neither may the CRASH SCREEN pass. React's error boundary renders a
      // calm "Oups — un pépin" card: plenty of painted text, no pageerror (it was
      // caught) — so a state that blew up photographed green. It is the loudest
      // possible failure; assert it explicitly.
      const crashed = await page.locator('.errboundary').count()
      const { bleed, culprit } = await worstRightBleed(page, entry.scope ?? '#root')

      // HOW MUCH CHROME BEFORE THE CONTENT. The number this whole lean programme
      // turns on: the distance from the top of the surface's scroller to the top of
      // its first content item. It is exactly what I had been eyeballing on
      // screenshots all along ("« Ce soir » at ~470px → ~380px"); as a manifest
      // column it stops being taste and starts being something that can regress
      // loudly. null when the entry declares no content selector.
      const probe = entry.content
        ? await page.evaluate((sel: string) => {
            const el = document.querySelector(sel)
            if (!el) return null
            // Measure inside the SCROLLER, not the viewport: .hub__body (hub tabs)
            // and .scene__body (scenes) are the app's real scroll containers, and a
            // viewport-relative y would drift with whatever the page had scrolled to.
            const scroller = el.closest('.hub__body, .scene__body, .recipe-modal__body') ?? document.body
            const top = scroller.getBoundingClientRect().top - (scroller === document.body ? 0 : scroller.scrollTop)
            // Did we match an EMPTY STATE rather than content? Every empty state in
            // this app carries a class with "empty" in it (.empty-state, .feed-empty,
            // .cercle-empty, .routines-empty, …), so walk up to the scroller looking
            // for one. Deliberately broad: a false positive costs one line to fix and
            // says so in the failure, while a false NEGATIVE is the silent lie this
            // exists to kill.
            let emptyVia: string | null = null
            for (let n: Element | null = el; n && n !== scroller; n = n.parentElement) {
              const hit = Array.from(n.classList).find((c) => c.includes('empty'))
              if (hit) {
                emptyVia = hit
                break
              }
            }
            return { top: Math.round(el.getBoundingClientRect().top - top), emptyVia }
          }, entry.content)
        : null
      const contentTopPx = probe ? probe.top : null
      // Which empty-state class we landed on, if any — a manifest column so a review
      // pass can see it, and a hard failure below when the entry carries a budget.
      const contentEmptyVia = probe?.emptyVia ?? null

      // A taxonomy-free companion: how much REAL text the first screen shows. A
      // leaner surface spends less of that screen on chrome, so this rises as
      // contentTopPx falls. Reported, never asserted — it is a review signal.
      const aboveFoldChars = await page.evaluate((foldY: number) => {
        let n = 0
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let node = walk.nextNode(); node; node = walk.nextNode()) {
          const text = (node.textContent ?? '').trim()
          if (!text) continue
          const parent = node.parentElement
          if (!parent) continue
          const r = parent.getBoundingClientRect()
          if (r.top < foldY && r.bottom > 0 && r.width > 0) n += text.length
        }
        return n
      }, vp.h)
      let focusedBottom: number | null = null
      if (entry.keyboard) {
        const box = await page.locator(':focus').boundingBox()
        focusedBottom = box ? box.y + box.height : null
      }
      const visible = vp.h - (entry.keyboard ?? 0)
      const kbOk = !entry.keyboard || (focusedBottom !== null && focusedBottom <= visible + 1)
      await page.screenshot({ path: join(OUT, `${id}.png`) })
      writeFileSync(
        join(OUT, `.frag-${id}.json`),
        JSON.stringify({
          name: id,
          file: `${id}.png`,
          route: entry.route,
          levers: {
            theme,
            audience: entry.audience ?? 'parent',
            lang: entry.lang ?? 'fr',
            surface: entry.surface ?? 'mobile',
            viewport: vp,
            longText: !!entry.longText,
            fresh: !!entry.fresh,
            keyboard: entry.keyboard ?? 0,
          },
          assertions: {
            pageErrors: errors,
            bleedPx: Math.round(bleed * 10) / 10,
            bleedCulprit: bleed > 1 ? culprit : undefined,
            focusedAboveKeyboard: entry.keyboard ? kbOk : undefined,
            paintedChars: textLen,
            crashed: crashed > 0 || undefined,
            contentTopPx,
            contentBudgetPx: entry.budgetPx,
            contentEmptyVia: contentEmptyVia ?? undefined,
            aboveFoldChars,
          },
          pass:
            errors.length === 0 &&
            bleed <= 1 &&
            kbOk &&
            textLen >= 10 &&
            crashed === 0 &&
            (entry.budgetPx == null || contentTopPx == null || contentTopPx <= entry.budgetPx) &&
            !(entry.budgetPx != null && contentEmptyVia),
        }),
      )

      expect(crashed, `${id}: the error boundary rendered — this state crashed`).toBe(0)
      expect(textLen, `${id}: the page painted nothing (blank capture)`).toBeGreaterThanOrEqual(10)
      expect(errors, `${id}: page errors`).toEqual([])
      expect(bleed, `${id}: "${culprit}" bleeds off the right edge`).toBeLessThanOrEqual(1)
      // A BUDGET MAY NOT BE MEASURED AGAINST AN EMPTY STATE. This is the guard for
      // the trap that made /notes meaningless: the shared fixture served zero notes,
      // the entry's selector fell back to the empty state, and the tab whose whole
      // brief was "maximum note per pixel" had its density ratcheted on a page with
      // nothing on it. The number looked perfectly reasonable, which is what made it
      // dangerous. A budget must describe the screen people actually use.
      if (entry.budgetPx != null) {
        expect(
          contentEmptyVia,
          `${id}: "${entry.content}" matched an EMPTY STATE (.${contentEmptyVia}), so this ` +
            'budget guards a screen nobody uses. Either seed the fixture for this entry ' +
            '(`api:` — see the notes entry) or drop budgetPx and leave it reported-only. ' +
            'See LEAN.md, "Check the fixture before you trust a number".',
        ).toBeNull()
      }
      // The ratchet. A surface that declares a budget may not push its content
      // further down than the day the budget was set — the failure names both
      // numbers so the fix (or a deliberate re-baseline) is obvious.
      if (entry.budgetPx != null && contentTopPx != null) {
        expect(
          contentTopPx,
          `${id}: ${contentTopPx}px of chrome before "${entry.content}" (budget ${entry.budgetPx}px). ` +
            'Either lean it back down, or re-baseline the budget deliberately — see LEAN.md.',
        ).toBeLessThanOrEqual(entry.budgetPx)
      }
      if (entry.content) {
        expect(contentTopPx, `${id}: no element matched content selector "${entry.content}"`).not.toBeNull()
      }
      if (entry.keyboard) {
        expect(focusedBottom, `${id}: a field is focused`).not.toBeNull()
        expect(focusedBottom!, `${id}: focused field above the keyboard`).toBeLessThanOrEqual(visible + 1)
      }
    })
  }
}
