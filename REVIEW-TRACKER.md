# Review tracker: 7-persona review, week of 2026-11-17

Progress on the 43 items kept from the 7-persona review (2026-11-17).
**Goal: all of them done during the week.**

- Source of each item: `REVIEW-PERSONAS-2026-11-17.md` (local, **untracked**: it contains attack
  recipes, so never commit it). Its « Decisions » section is the full spec; the raw persona reports
  below it are the evidence.
- **Every item is one reviewer's verdict until it is checked in code.** Grep the claim before
  building (STATE.md's counting trap). If it is already fixed or wrong, mark it `[~]` and say why.
- Convention (STATE.md §2): `[ ]` open · `[x]` done (cite the commit) · `[~]` dropped or stale on
  re-check (say why).
- Every finished item gets its commit hash on its line, in the same commit as the work.

## P0: security (do first)
- [x] 1. SVG upload → stored XSS on `/api/img` (*verified*: `_lib/r2.ts:76,110`, `api/img/[key].ts`). Fix: raster/audio type allowlist forced on store and serve, plus `sandbox` CSP, `nosniff`, and `attachment` for non-media. **Done** (`fix(securite): un seul type de média…`): worse than reported, 12 doors took *any* type (`text/html` too). `safeMediaType` in `_lib/r2.ts` is the floor for `uploadR2Media` + `putR2Blob` (so copies and server fetches too); `/api/img` and `/api/flyer-img` re-check on serve (`mediaHeaders`), so blobs stored before the rule come out as sandboxed downloads. `withSecurityHeaders` was overwriting a handler's CSP; it now adds the app's beside it. `worker/media.d1.test.ts` + `r2.test.ts`, seen red with the allowlist planted open.
- [ ] 2. Takeout restore writes into other households (*verified*: `_lib/restore.ts` `fitRow`). Fix: force household columns to the target; shared-trip children only for owned trips; d1 test with a planted foreign id; fix `restore.test.ts:53`.
- [ ] 3. Sandbox sweep can delete a real household: reject `@babillard.invalid` in signup, operator-join and email change; add an `is_sandbox` flag.
- [ ] 4. Media-key ownership: accept only keys the household created; check before `deleteR2Blob` (notes, shared-trip-notes, cercle photoKey).
- [ ] 5. Login CSRF (JSON content-type and/or Origin check on CSRF-exempt doors) + purge `backup/<hid>/*` on household delete; no sandbox backups.
- [ ] 6. Abuse limits: rate-limit `pair/claim`; `usage_daily` on a fixed zone; per-IP account velocity.
- [ ] 7. Links & sessions: showcase privacy enforced server-side, single-use invites, revocable timed guest links, server-side logout, expiring media URLs.

## P1: bugs every user sees
- [ ] 8. Red « Micro bloqué » shown on load: show it only after a mic attempt.
- [ ] 9. Supper contradiction (Ce soir / À régler / Dîner); breakfast listed after evening yoga; « MAINTENANT » shown twice.
- [ ] 10. ＋ field doesn't run AI capture (the landing example becomes a note); the confirmation must say what was created and when.
- [ ] 11. Night shift (end < start) rejected; AM/PM time fields; « Aucun horaire » while loading.
- [ ] 12. Day picker repeats weekdays without dates; all-day « 0 h 00–0 h 00 »; `?view=week` ignored.
- [ ] 13. « # » / LaTeX in recipe titles and steps; drawings-card date stacks vertically; EN « tasks, tasks ».
- [ ] 14. Cashier card shows no price.

## P2: UX and calm
- [ ] 15. Board default layout: Today (agenda + supper + routine) first; defaults only, power-user layouts untouched.
- [ ] 16. Slim the ＋ sheet: add an « épicerie » tile; move sitter-link / planifier tiles out.
- [ ] 17. FAB covers content / focused controls (`scroll-padding`, bottom space).
- [ ] 18. Dev tools → an « Avancé » section in Réglages (no feature flag): MCP token, keyboard diagnostic, AI log, Tester l'IA, component kit, « Charger des exemples ».
- [ ] 19. One tutorial instead of a « Compris » card per tab.
- [ ] 20. Help mode: intercept every tap, bubble near the finger, stays on, help opens over the current screen.
- [ ] 21. Month view readable (names in cells, legible markers).
- [ ] 22. Contrast in twilight/night themes; extend the contrast check to every day-part.
- [ ] 23. Défi du jour off by default.
- [ ] 24. Count badges & nags: « À régler +2 » (and its Réglages link), « Compléter les familles 6 », daily décompte question, drawing ages.
- [ ] 25. Toddler board fits one screen: now / next / tonight / routine hero; no parents' text notes.
- [ ] 26. Merge the kitchen nouns (À utiliser bientôt / À écouler / Restants / La réserve / Ce qui s'achève).
- [ ] 27. Copy fixes: « Le long jeu », « En attente » (late items), « Voir plus loin », « La personne au centre », « Mon visage », « sous-onglets », « Grille ».
- [ ] 28. Rename « rappel » honestly (it only makes an item show earlier on the board).
- [ ] 29. « Placer ce soir » button on meal ideas.
- [ ] 30. Landing fixes: reachable on a device that once chose a surface; « J'ai déjà un compte » → login; localised titles; promote the privacy selling points.
- [ ] 31. Pets as rendez-vous subjects; recurrence end dates / exceptions.

## P2: accessibility. ⚠ Show Marc each change, one by one, BEFORE implementing
- [ ] 32. Settings & combobox names (`SettingsRow` label/hint; `EntityCombobox` pattern).
- [ ] 33. Structure: card headings, tabpanels, scene titles, empty regions, month grid rows and names.
- [ ] 34. Focus & keyboard: global `:focus-visible`, « Bon matin » focus, keyboard toddler-exit, nested weather button, announced reorders.
- [ ] 35. Language & names: `lang="fr-CA"`, `lang="en"` on English text, item names in repeated buttons, aria-hidden emoji, list adder in text.

## P3: engineering
- [ ] 36. Gate Dependabot auto-merge on e2e.
- [ ] 37. Quick wins: delete `functions/_middleware.ts` + its test; sunset the chores/todos/home-projects aliases; rename `home_projects` → `tasks`; `ON DELETE CASCADE` from households; ai-test operator-only.
- [ ] 38. Write-path quirks: guest fake-success, double 404 handling, outbox dropping 429/408, hidden A_REGLER/tour side effects.
- [ ] 39. Client UUIDs for creates → delete tmpIds, outbox id rewriting, healing deletes.
- [ ] 40. `shared/` module for client↔server mirrored code; delete the MIRRORED copies and their mirror tests.
- [ ] 41. Syntactic grep-guards → oxlint (jsx-a11y, restricted-syntax); keep the domain guards.
- [ ] 42. Docs diet: CLAUDE.md ~150 lines, byte budget for STATE, merge PARITY+ACTIONS, generate COMPONENTS from DevKit, drop docCounts.
- [ ] 43. Trim e2e to ~40 journeys; freeze the discovery machinery.

## Parked (not this week)
Grandparent/sitter mode · trust & business pack · Marco's kill list. See the Decisions section of the review file.

## Log
<!-- one line per session: date · items touched · commits -->
<!-- A commit cannot carry its own hash: an item is ticked in its own commit, and the hash is backfilled by the next one. -->
- 2026-11-17 · #1 SVG/HTML upload XSS closed (allowlist on store + serve, CSP kept beside the app's)
