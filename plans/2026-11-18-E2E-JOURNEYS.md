# #43 — the e2e suite as ~40 journeys (APPROVED by Marc, 2026-11-18)

Review #43: trim `e2e/` from **221 spec files / ~1 218 tests** to about 40 user journeys, and
freeze the discovery machinery. Approved 2026-11-18: the grouping as below; journeys 39–40 stay as they are (sweeps, not journeys); the freeze is a ceiling test (`src/lib/discoveryFreeze.test.ts`).

## How a journey works

- **One spec file per journey**, named for what a person does (`journey-list.spec.ts`: « add,
  tick, swipe, clear, shop at the till »). It walks the flow end to end in a few tests, on the
  phone viewport, with the kiosk and the toddler lens where the journey has them.
- **The specs it absorbs are folded, not copied.** Each old spec is read; a test that pins a
  regression nothing else catches becomes one step or one assertion in the journey. A test that a
  unit test, a d1 test, a lint rule or the state matrix already holds is dropped, and the commit
  names which guard holds it.
- **Pure layout pins** (spacing, one heading, « fits at 360px ») move into the state matrix's
  per-state budgets (`e2e:matrix`, weekly in CI) rather than a test each.
- **Kept apart, unchanged:** the three harnesses with their own config: `sw` (the offline shell
  on the PROD bundle), `stranger-live` and `flipp-live` (the deployed app, weekly).
- Done one journey per commit, each green under `e2e:ci` before the next, so a regression is
  traceable to the fold that lost it.

## The journeys (each line: the journey, then the specs it absorbs)

1. **First visit & the demo**: landing-door, home-welcome, demo-sandbox, demo-claim, first-run-quiet, onboarding, stranger-quiet, install-hint
2. **Account**: password-reset, verify-email, operator-join, sessions, leave-and-legal
3. **The wall tablet**: kiosk-doors, kiosk-settings, idle-ambient
4. **Sharing & guests**: guest-scenes, guest-settings, share-links, share-doors, share-routed, share-business, partage-public, readonly-states
5. **The board at a glance**: board-compact, board-empty-cards, board-day-first, interactions-board, en-cours, pour-toi, greet-fit, card-lens-shots, house-diary, this-week-calm, calm-nags
6. **Arranging the board**: board-customize, board-edit, dnd-mirrors
7. **Capture & the ＋ sheet**: interactions-add-sheet, plus-capture, fab-hold-voice, capture-degraded, capture-offline, add-sheet-overflow, ask-sheet, sheets
8. **The calendar**: month-day-panel, month-readable, week-view, year-to-month, cold-week-anchor, calendar-delete, when-labels, schedule-night
9. **Rendez-vous**: event-form-bring, event-peek-actions, event-series-pet, birthday-gift, sa-fete
10. **A day's page**: day-plan-lean, day-meal-tap, past-day-meal-doors
11. **Tasks**: tasks-view, task-card, task-effort, task-look, subject-tasks, todo-overdue, upkeep-overdue
12. **Mots on the fridge**: mots-fridge, notes, souvenirs, photo-keep
13. **Family notes**: note-editor, cercle-notes-card
14. **Drawings**: drawings, drawing-zoom, drawing-age
15. **Habits & the défi**: habits, defi
16. **Planning meals**: kitchen-meal-plan, kitchen-inline-plan, meals, meal-order, plan-tonight, unplaced-meals, grid-side-meal-drag, interactions-kitchen
17. **Recipes**: recipe-ingredient-pick, recipe-leftovers, recipe-live, recipe-original-lazy, recipe-photo-import, recipe-read-review, recipe-tag-slots, recipe-url-import, recipe-versions, recipes-lean-header
18. **Cooking**: cook-stepper
19. **The pantry & « À régler »**: pantry-advanced, a-regler-snooze
20. **Flyers & deals**: flipp-sheet, flipp-import
21. **La liste**: interactions-list, liste-advanced, liste-swipe-delete, quickadd-remove, aisle-sort, list-row-fit, delete-confirm
22. **At the till**: cashier, cashier-priceless
23. **The cercle**: cercle-crud, cercle-drag-group, cercle-visual, contact-photos, family-import, intake, postbox
24. **Carnets**: carnet-scene, carnet-restore
25. **Routines**: interactions-routines, routine-builder, routine-run-solid, routine-timer, routine-tips, routine-aids-fold, stickers, moments-rehomed
26. **Play & the car**: play-and-car
27. **Voyage**: voyage, voyage-share, voyage-undated, trips-index
28. **Virements**: virements
29. **Réglages**: interactions-settings, config-panels-board, config-panels-kitchen, config-panels-liste, config-panels-maison, config-panels-system, settings-advanced, settings-aliases, settings-delete-undo, settings-sections, settings-tree, ai-toggle, sound-toggle
30. **Finding things & landing on them**: interactions-navigation, nav-tabs, nav-restructure, guide-deeplink, door-landing, door-sweep, embedded-door, stale-link, search, search-landing, back-closes-overlay
31. **Discovery (frozen)**: help, help-every-tap, tour-nav, section-intro, lexicon, empty-doors
32. **The toddler & simple lenses**: toddler-board, toddler-kitchen, toddler-liste, toddler-maison, toddler-notes, toddler-one-screen, lens-gates
33. **Remarques**: remarks
34. **Takeout & restore**: takeout-restore
35. **Offline, errors & recovery**: offline-boot, offline-outbox, recovery, error-paths, degraded-states, gap-states, data-staleness, realtime, midsession, pull-to-refresh
36. **The keyboard on a phone**: keyboard, kb-latch, composer-fit, focus-not-obscured, footer-clearance, sheet-scroll-lock, zoom-overlay-portal, hub-width
37. **Fit, overflow & lean**: layout-overflow, hscroll, rail-keyboard, longtext, spacing, segmented, row-labels, lean-forms, lean-scenes, tap-budget, section-add
38. **Accessibility**: a11y-keyboard, a11y-language, a11y-names, a11y-structure, axe, contrast, action-menu-keys
39. **Whole-app sweeps**: coverage, realdata, console-clean, devkit
40. **Visual record (on demand)**: screenshots, state-matrix, states, scenes

**Kept apart (own harness):** sw, stranger-live, flipp-live

## Freezing the discovery machinery

Until usage data says otherwise: no new guide card, tour or help registry. Proposed guard: a unit
test that holds the guide cards, the tours and the `*Help.ts` registries at **at most today's
number** (a ceiling, never written in prose), so adding one means merging into an existing card
or raising the ceiling in a commit that argues for it. Existing help keeps working; journey 31
keeps one test per channel (guide link, « ? » hint, tour start).

