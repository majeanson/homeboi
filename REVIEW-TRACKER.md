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
- [x] 1. SVG upload → stored XSS on `/api/img` (*verified*: `_lib/r2.ts:76,110`, `api/img/[key].ts`). Fix: raster/audio type allowlist forced on store and serve, plus `sandbox` CSP, `nosniff`, and `attachment` for non-media. **Done** `78d57234`: worse than reported, 12 doors took *any* type (`text/html` too). `safeMediaType` in `_lib/r2.ts` is the floor for `uploadR2Media` + `putR2Blob` (so copies and server fetches too); `/api/img` and `/api/flyer-img` re-check on serve (`mediaHeaders`), so blobs stored before the rule come out as sandboxed downloads. `withSecurityHeaders` was overwriting a handler's CSP; it now adds the app's beside it. `worker/media.d1.test.ts` + `r2.test.ts`, seen red with the allowlist planted open.
- [x] 2. Takeout restore writes into other households (*verified*: `_lib/restore.ts` `fitRow`). Fix: force household columns to the target; shared-trip children only for owned trips; d1 test with a planted foreign id; fix `restore.test.ts:53`. **Done** `fa11e2f4`: three holes, not one: a scoped row's foreign id, a child row hung on a foreign parent, and a trip's rows on *any* living trip. The scope column is now forced; children need a parent this restore inserted; a trip row needs an owned trip or a membership that existed before the wipe (« owned trips only » would have lost the household's own place on friends' trips, which the wipe takes too). `author_household_id` stays (attribution, not scope). Found on the way: a trip *member*'s same-household restore always remapped every id (the friend's trip collided), now fixed. `worker/restore.d1.test.ts`, each of the three plants seen red.
- [x] 3. Sandbox sweep can delete a real household: reject `@babillard.invalid` in signup, operator-join and email change; add an `is_sandbox` flag. **Done** `378aece0`: verified: sweep, cap and stale count keyed on `operators.email LIKE` only; signup and operator-join took the domain (the only email change is the claim, which refused it). `isReservedEmail` (any `.invalid`) at all three doors; migration 0157 `households.is_sandbox` (set by the mint, cleared by the claim, backfilled only where *every* operator is a sandbox) is all the sweep reads; `is_sandbox` joins the restore's `HOUSEHOLD_KEEP` (a sandbox dump restored into a real household would have flagged it). `worker/demo.d1.test.ts`, three plants seen red. The four task-merge drills now copy the household through `householdRowFor` (an old schema has no `is_sandbox`).
- [x] 4. Media-key ownership: accept only keys the household created; check before `deleteR2Blob` (notes, shared-trip-notes, cercle photoKey). **Done** `93b836e6`: verified (`notes.ts` took any string, even `backup/…`). Migration 0158 `media_owners`: `putR2Blob` records the request's household (so every upload, server fetch and copy); `deleteR2Blob(env, key, hh?)` frees a blob only by deleting *this* household's ledger row, so a foreign or unknown key fails as an orphan, never as a loss (enforced at the one function, so all 70 delete sites are covered, not just the three named). Accept side: notes (incl. the AI transcription) and shared-trip notes refuse unowned keys; cercle `photoKey` is shape-checked only, because a family-share import legitimately writes the sender's `fs_` keys. Backfill: scalar columns + every key-shaped leaf of the JSON columns (d1-tested on planted legacy rows). Shared-trip clears free the note's *author's* blob. Known leak: a legacy key the backfill cannot see stays in R2 when its row goes. `worker/media.d1.test.ts`, three plants seen red.
- [x] 5. Login CSRF (JSON content-type and/or Origin check on CSRF-exempt doors) + purge `backup/<hid>/*` on household delete; no sandbox backups. **Done** `b8afb6e8`: verified: `readJson` parsed any body, so a cross-site text/plain form could sign the visitor into the attacker's account. Both checks in `worker/index.ts`: the eight browser doors want this origin (`Origin`, else `Sec-Fetch-Site`; loopback passes for the Vite proxy), and the six that read a body take `application/json` only (415). `mcp` and `remarks/shipped` are not browser doors and are untouched. `deleteHousehold` lists and deletes `backup/<hid>/` after its batch; the nightly lists `is_sandbox = 0` only. `auth`/`leave`/`nightly` d1 tests, four plants seen red.
- [x] 6. Abuse limits: rate-limit `pair/claim`; `usage_daily` on a fixed zone; per-IP account velocity. **Done** `2969c732`: all three verified. `pair/claim` takes `overAuthLimit` (per address + per household key). `usage_daily`'s day is `DEFAULT_TZ`'s, so a household changing its zone no longer opens a fresh day. Migration 0159 `ip_daily` (salted hash of the address, never the address; pruned nightly after two days): 5 account creations (signup + operator-join, counted only once validation passed, so typos are free) and 20 demo mints per address per day; past the demo cap, the read-only showcase rather than an error. `worker/abuse.d1.test.ts`, four plants seen red.
- [x] 7. Links & sessions: showcase privacy enforced server-side, single-use invites, revocable timed guest links, server-side logout, expiring media URLs. **Marc's calls (2026-11-17):** media *scoped, not expiring*; logout = per-session denylist; showcase = match the UI hides. **4 of 5 in** `fb9532a4`: a guest reads no mots (`notes` GET + board poll; it used to drop only the addressed ones); operator invites are single-use (nonce turned over in the join's own transaction, so a race cannot double-join; copy updated); a guest link is never returned without its row (`guest/start`, `demo`); « Se déconnecter » revokes this cookie (0160 `revoked_sessions`, checked in the operator read itself, pruned nightly; sessions now carry a nonce so two sign-ins in one second are distinct). `worker/links.d1.test.ts`, plants seen red (the row-mandatory change has no failure-path test: a D1 insert cannot be made to fail from the harness). **5th** (`fix(securite): une image ne s'ouvre qu'à sa maisonnée…`): `/api/img` serves an owned blob only to its household (session cookie, or the kiosk/guest token mirrored into a `bb_media` cookie scoped to `/api/img`, since an `<img>` cannot send the header), to anyone while a live share of that household names it, to co-travellers on a shared trip, and a live trip's cover to anyone (invite preview). 404 otherwise. Unowned legacy blobs are served as before; URLs stay stable so the offline cache is untouched. `media.d1`/`sharedTrip.d1` + `device.test.ts`, five plants seen red.

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
- 2026-11-17 · #2 restore confined to the target household (scope forced, children + trip rows gated)
- 2026-11-17 · #3 demo sweep keyed on households.is_sandbox (0157); `.invalid` refused at signup/join/claim
- 2026-11-17 · #4 R2 ownership ledger (0158): deleteR2Blob frees only the household's own blobs; notes/trip notes refuse foreign keys
- 2026-11-17 · #5 same-origin + JSON on the exempt browser doors; backups purged on delete, none for sandboxes
- 2026-11-17 · #6 pair/claim limited; budget day on DEFAULT_TZ; ip_daily (0159) caps accounts 5/day and demos 20/day per address
- 2026-11-17 · #7 (4/5): guests read no mots; single-use invites; guest rows mandatory; per-session logout (0160). Media scoping next
- 2026-11-17 · #7 done: /api/img scoped to the owning household, live shares and co-travellers (bb_media cookie for kiosks/guests)
