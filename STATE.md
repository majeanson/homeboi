# STATE.md — where Babillard is, what's left, and how we've been working

> **What this file is.** The single front door. Nine other root markdown files hold real,
> careful detail; none of them answers "what should I do next?", which is why that
> question has to be asked out loud every session. This file answers it, and points at
> the detail rather than repeating it.
>
> **It is kept SHORT on purpose** (2026-09-17). It had grown to 4 289 lines, of which the
> only open work started at line 3 490 — so the question it exists to answer was behind
> 81 % of the file. What shipped, and every closed finding, went to git — where the
> `bmad/` planning folder followed it on the same day. A line budget is enforced by
> `src/lib/docBudget.test.ts` (lines and bytes), and it is a ratchet: it may fall, never rise.
>
> **Written 2026-08-27**, after a four-wave sweep (commits `8e526e3`, `e76bfe1`,
> `375856c`, `31598dd`). Everything below was verified against code or a command run
> that day — **not** read off another document. That distinction is the whole point:
> see [§5](#5-process-review--fresh-eyes).
>
> **Keep it living.** When a wave lands, update §1's numbers and §4's ranking here, in
> the same commit. If this file goes stale it becomes the fourteenth problem. And when
> the NEXT session's first §3 entry lands, CUT the current ones — git keeps them, and
> that is what keeps this file short.

---

## 1. Snapshot

| | |
| --- | --- |
| **What it is** | A calm household command-center for a cheap always-on wall tablet. Single-page React app + one Cloudflare Worker (static assets + `/api/*`) + D1 + Workers AI + R2. FR-CA first. |
| **Code** | ~210k lines across 1 223 `.ts`/`.tsx` files (`src/`, `functions/`, `worker/`, `shared/`) |
| **Schema** | 162 forward-only migrations (0150 = une seule table de tâches; 0157–0162 = the review week: `is_sandbox`, `media_owners`, `ip_daily`, `revoked_sessions`, clean recipe titles, `home_projects` → `tasks`) |
| **Tests** | 3 625 unit tests in 302 files (2026-11-19) · ~600 real-runtime cases in 65 files (`npm run test:d1`, the Worker in workerd against a real D1) · 50 Playwright spec files: 38 journeys, the sweeps, 4 harnesses (#43, 2026-11-18) |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget · **test:d1** · knip) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Second interface** | `/api/mcp` — read-only over the household — of its dozen tools, most proxy a GET handler that already exists, so the caps, the recurrence expansion and the time zone are decided once and inherited. |
| **Households in production** | **Six** real, re-counted in D1 on 2026-09-29 — Marc's (4 members), four other real accounts from the invite gate, and the legacy read-only demo singleton — plus two live 24 h sandboxes. **Zero signups in the five days since the gate opened (09-24)**: the door works (the weekly stranger walk is green), nobody has come through it yet — and whether nobody CAME is now answerable: the nightly mail counts trials opened, kept and refused at the cap, and direct signups (0141, `_lib/strangers.ts`) |

*(Numbers rot: re-run the commands before quoting them.)*

### Health signals

- `npm run typecheck` · `npm run lint` (oxlint, since 2026-11-05) · `npm test` · `npm run test:d1` · `npm run build` · `npm run check:bundle` · `npm run knip` — green 2026-11-05, and all seven gate the deploy.
- `npm run e2e:ci` — CI's E2E job is the standing whole-suite signal, and it chains off
  CI, so **a red CI means no E2E ran at all** (that hid three commits' worth of failures
  for a day). One process OOMs on Marc's machine (2026-09-22); `npm run e2e:local` does not — 8
  shards in turn, a Vite each, CI's strictness: 2 199 passed, 55 min, ≥ 5.3 GB free (2026-11-16).
- `npm run e2e:sw` — 5 passed (the kiosk's offline reboot, against the real PROD bundle).
- `npm run check:bundle` — the door's static closure is **9 chunks / 522 KB** (was 70 /
  1 131 before the hub went lazy); every chunk within budget; the SW precache covers all
  offline-needed chunks and skips build metadata.
- **The build-gating invariants** are the codebase's best feature (§5), and the list is
  long enough that it belongs where it is enforced rather than here: every one lives in
  `src/lib/*.test.ts`, `functions/_lib/*.test.ts`, `scripts/*.test.mjs` or
  `scripts/check-bundle.mjs`, each with a header saying what it caught. Three joined on 2026-09-19: `csrfExempt`
  (a ratchet on the CSRF-exempt set — it found `pair/poll` sitting there answering GET
  only), `ci-untrusted` (no `${{ github.event… }}` may reach a `run:` block — it found an
  existing one in `sw-repro.yml`), and `deployHook` (the polarity of the only inbound
  shared-secret gate). The rule that matters is §5's: **a guard that has never been red
  proves nothing** — plant the defect, watch it fail, restore.
- **`data_invariants` is a new TIER of guard**, not another entry on that list: every
  test above reads source, and this one reads ROWS (`functions/_lib/invariants.ts`, via
  the MCP tool or `worker/invariants.d1.test.ts`). It is read-only and per-household, and
  it distinguishes « not checked » from « fine » on purpose.

## 2. The document map

**Nine** root `.md` files beside this one and `README.md`. They are **not**
interchangeable. Read this table before opening any of them.

> **The checkbox convention** (repo-wide, adopted 2026-08-28 — this is the canonical
> statement; the ledgers carry a copy):
>
> | | |
> | --- | --- |
> | `- [ ]` | **open work.** Someone still has to do it. Nothing else uses this. |
> | `- [x]` | done — with the file:line or commit that settles it |
> | `- [~]` | reviewed and parked, **with the why** — so it isn't re-litigated |
> | `❓` | an open **question**, not a task |
> | ⚪ | an **idea pool** entry — uncommitted, never a queue |
>
> Templates (`PARITY.md`'s checklist and Definition of Done) and idea pools carry **no
> checkboxes at all**. Before this, `- [ ]` meant three different things and any count
> of "open items" read **75** when the true number was 17 — a mis-count that opened at
> least one session on the wrong work. `grep -rc -- "- [ ] " *.md` is now
> a number you can trust, so it is run, not written down here (review #42 dropped the written
> counts and the test that chased them: `REVIEW-PASS.md`'s banner once claimed 15 for twelve
> days against a single box). Today there are none: `REVIEW-TRACKER.md` closed 2026-11-18.
>
> **A written box is the RARE case, not the backlog.** Most of what is worth doing lives
> in judgement: the idea pools, a parity scoring pass, a device pass, the next
> sweep of screenshots. Read §4 before picking work.
>
> **What `[~]` may NOT be used for:** a bullet that still says "Still open: …" is open
> work, not a park. Four were flipped back from `[~]` to `[ ]` on the day the convention
> shipped, for exactly that reason.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. §4 is what is open. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `PARITY.md` | **Playbook** | The dimensions D1–D17, the door taxonomy, the undo tiers and the new-entity/new-action checklist (merged with `ACTIONS.md` in review #42; the old matrices are in git). A template: copy, don't tick. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed features, walked with Marc 2026-09-25: 7 accepted and shipped, 4 dismissed. Closed. |
| ~~`bmad/`~~ | **Deleted 2026-09-17** | The planning folder and the archive: brief, PRD, architecture, the idea pools, every finished ledger, and this file's own past. ~10 000 lines of documents about an app that is built. **In git, not in the tree** — `git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it. Code comments still cite its tags (`NFR-CALM-1`, `PRD C5`, `bmad/08 E-36`); they are labels now, not pointers (see CLAUDE.md ▸ Requirement tags). |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
the old `ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### La revue à sept personas : 43 points, tous fermés — 2026-11-17 → 11-18
Seven personas (parent, shift nurse, grandmother, a11y, engineering, security, product) reviewed the app; Marc kept 43 items, and `REVIEW-TRACKER.md` carries each with its commit (the raw review stays untracked: it holds attack recipes). **P0 security**: an upload allowlist on store and serve (SVG/HTML XSS), restore confined to its household, the sandbox sweep keyed on `is_sandbox` (0157), an R2 ownership ledger (0158), same-origin + JSON on the exempt doors, per-address caps (0159), single-use invites, per-session logout (0160), `/api/img` scoped to its household. **P1/P2**: ＋ runs capture, night shifts, `TimeField`, the day first on a fresh board, one tutorial, help mode under the finger, a readable month, day-part contrast, the toddler first screen, the kitchen nouns, pets in « Pour qui ? », and four a11y passes approved by Marc one by one. **P3**: client UUIDs (`newRowId`), `shared/`, grep guards → oxlint AST rules, the docs diet (`docBudget`), and the e2e suite folded from 221 specs to 50 files with no test dropped. **Parked by Marc**: `ON DELETE CASCADE` (#37), the grandparent/sitter mode, the trust & business pack, the kill list.

### Le plan de solidification — vagues 0 à 8
Waves 0–5 closed 2026-11-05 (their story is in git: `git log --grep=vague`). Waves 6–8 landed mostly with the review week: the shared e2e fixture, mocks typed on `Wire`, `routeSweep`, `routesTable`, `d1Coverage` at 0, the coverage floor, the strict tsconfig flags, axe with `e2e/axe-allow.json`, PARITY's dimensions held by guards. What the plan still names is in §4.

## 4. What still needs improvement — consolidated and ranked

**Ouvert depuis le plan de solidification (2026-11-05)**, chacun tenu par un cliquet ou un test :
- [x] Une seule notion de tâche (`plans/2026-11-06-TACHE-UNIFIEE.md`), phase 1 : les corvées passent par `_lib/upkeep.ts` (`choreSchedule`, `taskSchedule-rule`). Rien de visible. Phases 2, 3, 3b et 4 livrées (§3), la fusion des tables comprise (0150, 2026-11-08). Les vues sont alignées (2026-11-08, §3). `kind` → `plan | upkeep | NULL`, un seul geste et un seul jour (0153, 2026-11-10, §3) : plus rien ne distingue une ancienne corvée d’un ancien à-faire.
- [x] Les specs passent à `app.boot` : plus aucun `boot` local, et `waitForTimeout` tombe de 199 à 80 (`e2e-rule.test.ts`, BOOT_MAX 0). Une photo ou une mesure finale attend `settled()` (`e2e/measure.ts`) : la page a cessé de bouger. Ceux qui restent sont une durée voulue : un appui maintenu, ou la preuve que rien n'arrive, chacun avec sa raison en commentaire. 6.1 et 6.2 (2026-11-06) : `interactions.spec` et `config-panels.spec` sont découpés par surface (12 fichiers, 129 titres identiques, `e2e/interact.ts`). `ROUTES: Partial<Wire>` tient 64 fixtures par `tsc`, et les 64 handlers GET y sont liés par `okWire('route', body)` (`functions/_lib/json.ts`) : `tsc` refuse une clé perdue et, à toute profondeur, une clé inconnue de `Wire`, et `mocksContract.test.ts` compte les routes non liées (0, `UNBOUND_MAX`). Reste invisible : une colonne ajoutée à un `SELECT` sans toucher son `Row`, puisque `.all<Row>()` est un cast ; `any` et `unknown` arrêtent aussi le contrôle à leur profondeur. Les routes GET sans fixture passent de 35 à 15, chacune nommée avec sa raison (`mocksContract.test.ts`). Un GET inconnu répond toujours `{}`, et `e2e/unknownGets.reporter.ts` fait échouer une exécution sur un chemin hors de `e2e/unknown-gets.json` (2 chemins, plafond dans `docCounts`).
- [x] Les 17 routes sans test positif sur vrai D1 en ont un, et `UNTESTED_MAX` est à 0 (`worker/d1Coverage.test.ts`) : une route sans test sur vrai D1 fait maintenant échouer le build. `functions/test/fakes.ts` scripte le modèle derrière `runModel`, donc le compteur `usage_daily` reste le vrai, et `fetch` ; un appel non scripté fait échouer le test (`worker/aiRoutes.d1.test.ts`, `worker/outbound.d1.test.ts`, 68 tests). Correction de cette case : `AI: ''` et `BROWSER: ''` ne faisaient rien, `wrangler.toml` l'emporte, et `env.AI` était le vrai binding, qui lance « needs to be run remotely ». Un vrai bogue trouvé : `recap` envoyait les soupers à venir dans le bilan de la semaine passée (`functions/api/recap.ts`, même borne que les événements). Le chiffre « 67 » d'avant était faux : la regex ne lisait pas les 45 clés raccourcies de TABLE, le vrai compte était 97.
- [x] `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes` sont allumés dans les trois tsconfig. oxlint reste en `correctness` : `suspicious` + `perf` donnent 8 441 faux positifs d'une seule règle, et `iframe-missing-sandbox` casserait le lecteur PDF de `CarnetDocs`. Décision prise, à ne pas rouvrir sans nouvelle mesure. `exhaustive-deps` est passé en erreur le 2026-11-06 : la revue de fin a trouvé cet item du plan oublié, et un vrai bogue dedans (`tagSlots` absent du mémo de la cuisine).
- [x] 7.1 : les 13 modules ont leurs tests, chacun vu rouge. `@testing-library/react` est là, et `npm run test:coverage` tient un plancher par dossier (`src/lib` 62,58 % de lignes) dans `vitest.config.ts`. Hors CI : personne n'a demandé d'en faire une barrière. Deux vrais bogues trouvés : un instantané effacé à la perte d'auth se réécrivait (`persist`), une écriture retenue partait deux fois au démontage (`toast`).

> **No open box.** The review week's 43 (`REVIEW-TRACKER.md`) closed 2026-11-18. La dernière d'ici s'est fermée le 2026-11-06. Avant elles, 2026-09-29 : §K's six waves and §L are all closed; what is left is §M
> (needs a device) and F37's review (~12-29). New work starts from what real households do.
>
> **The standing work since 2026-11-05 is `plans/2026-11-05-SOLIDIFY.md`** — nine waves of
> UI/UX unification, generalization and test hardening (§3 has the latest wave). It is a
> plan with no boxes on purpose: each wave's items are verified in code when picked up, and
> a wave is done when its guards are green AND were red once. Read it before any UI work.

> **Everything except §K is closed.** The argument, the measurements and the several
> findings that turned out to be wrong are in git (`git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it.). One line each here,
> with the verdict:

| § | What it was | Verdict |
| --- | --- | --- |
| **A** | Verified correctness — the `useWrite` sweep, `/share`'s lost writes | ✅ done 2026-08-27 |
| **B** | The friction pool (the friction audit), tiers 1–3 | ✅ closed 2026-08-28; four of five tier-3 items were already stale |
| **C** | Section debt (`REVIEW-PASS.md`), swept four times | ✅ closed 2026-09-09, 31 → 0 |
| **C-bis … C-undecies** | Eleven rounds reported from the device, 2026-08-28 → 09-03 — list items resurrecting, dead calendars, the day scene's shape, the photo→recipe read | ✅ all closed; the durable ones became guards (`tmpIds`, `healOnError`, `repairImperialFromMetric`) |
| **D** | Judgement calls waiting on Marc | ✅ all answered — pinch-zoom off, calendars retired, the supper hero left alone. **Declined, not deferred: do not re-propose without a new observation** |
| **E** | Tooling gaps found during the cleanup | ✅ closed — `knip` wired into CI, its signal configured down from 58 findings to 7 |
| **G · H · I · J** | Four passes that LOOKED: the 100-screenshot review, what the sweep could not see, the frames re-read, and fresh eyes on the a11y census | ✅ all closed; `color-contrast` went 78 states → 0, and the sweep learned to prune, shoot below the fold, and rebase its fixtures |
| **L** | The public-app hardening pass — thirteen items, 2026-09-16/17 | ✅ 31 boxes closed, 1 parked. Sessions, rate limits, a real-D1 harness, the door's eager graph, password-gated doors, security headers, nightly alerts, a restore door, the weekly stranger walk, the household timezone, Dependabot |

**§L's last thread — the CSP is ENFORCED (2026-09-22), the report-only twin dropped 2026-09-25.** The week of reports found one
thing, and not ours: the edge injects inline scripts into the door, so `script-src` keeps `'unsafe-inline'` and every other
directive is enforced (`securityHeaders.ts` carries the why). `frame-ancestors` now also admits marcportal.com (2026-10-15).

### K. Towards a public app — the plan, written 2026-09-16 (start here)

**Marc: « a way towards being a public app soon ish (months away prob) ».** Decisions
taken the same day, which shape everything below: **no zoom, ever** — the layout must use
the space on every media type (§D); **signup stays invite-gated** until the last wave;
**email goes through Resend**, which Marc's portal project (`anthropicJoffre`, its
`backend/src/utils/emailService.ts`) already uses — an account exists, a Worker calls the
REST API with plain `fetch`, no SDK.

Six waves, in order. Each wave ends with the standing gates (typecheck · test · build ·
the matrix run · a PARITY row or a footnoted ➖ · STATE.md updated in the same commit).
The boxes below are OPEN WORK and count in §2's number; flip them with the commit that
settles them. A wave's findings get their own boxes under it when the wave starts.

**Wave 0 — the wide-screen pass. ✅ CLOSED 2026-09-16**, and the expectation going in was
wrong in the good direction: six surfaces already sat in a centred column or a sidebar
layout, and only three tabs stretched edge to edge. Marc's call was **HYBRID — width
where the shape earns it, a reading column where it does not, and centre the tab bar**,
applied as four surface-agnostic `@media (min-width: 1100px)` rules. The matrix grew
`TABLET` (820×1180) and `DESKTOP` (1440×900, surface `mobile` — a laptop operator, not
the wall) plus 17 states. One thing no 390px frame could ever have shown came out of it:
the board's « Faire » pill at **2.03:1** on a marigold member, which `tintInk()`
(`lib/routineTod`) now answers. Two things were seen and PARKED with the why (the ＋ FAB
over the fourth column; Maison's empty lower third, which is the fixture's size). The
five boxes and their measurements are in git.

**Wave 1 — the stranger's demo walk. ✅ CLOSED.** Walked twice on production by
Playwright, as a stranger, on a laptop and an iPhone. **The clock was never the problem**
(landing 0.4–0.8 s, mint → board 0.8–1.2 s, the first write settled in 70 ms); the first
screen was. The first walk could not get past it: a brand-new device landed on
« Le point du jour » with the welcome dialog over it and the tour pulling the router back,
because two shell automations both fire on a fresh device — fixed `b2bc7ee6`, the first
day belongs to the welcome, and `journey-first-visit.spec.ts` replays production's timing
(an instant stub let the OLD code pass). The second walk found three more: the marketing
page opened the household realtime socket with NO credential (a 401 handshake forever in
a visitor's console — the socket follows the SESSION now), Découvrir greeted a fresh
sandbox with « Quoi de neuf » about a rename it had never seen, and the first-ever undo
toast covering the row you just added — **accepted by Marc, « they can close the toast »:
declined, not deferred.** The 24 h sandbox sweep was confirmed in production D1 on
2026-09-22: zero aged sandboxes, zero orphaned households.

**Wave 2 — a fresh household, a small phone, a slow connection. ✅ CLOSED.** The fresh
household was already photographed; what had not happened was LOOKING at those frames
with the question. **320px** was the find — the first frames ever shot there had EVERY
tab's title cut (« Bon apr », « La li… »), and it was never the font: a fixed 197px
four-disc header cluster left ~83px for the title, so below 340px the decorative section
avatar hides. Cold start was measured on production under CDP throttling, then re-measured
after the hub went lazy: **78 requests → 17, and the slow-link headline 11.2 s → 7.1 s.**
The last 55 KB came off 2026-09-22; the install prompt shipped. **Re-measured 2026-09-25**
(`npm run perf:door`, presets in its header): **15 requests / 305 KB** on the wire (was 78 /
487), one parallel wave, no chained round trip — bandwidth-bound; the levers left are bytes.

**Wave 3 — password reset. ✅ CLOSED 2026-09-23, verified against production.** Walked end to end on real rows. `reset.ts` bumps `session_version`, so a reset signs out every other device, and the nightly cron can now reach a human by mail.

**Wave 4 — a household can leave, and knows the terms. ✅ SHIPPED 2026-09-22.**
`DELETE /api/household` behind three locks — operator scope, the password (`_lib/sudo`),
and the household's NAME retyped, which is the half a password cannot be: a password is
typed while thinking about something else, a name has to be read off the screen. Folded
under the export, because the first thing to offer someone leaving is their own things.
No undo tier, recorded as a ➖ with the argument (PARITY ¹¹¹). `deleteDemoHousehold` became
`deleteHousehold` in the same commit. `/confidentialite` + `/conditions` ship FR and EN
from the marketing footer and from Réglages, written to be TRUE rather than reassuring —
every claim checked against code that day — and living in their own lazy page, not in
`i18n.ts`. `CONTACT_EMAIL` is the contact door — **set in production** (`app_health`
reports it, 2026-09-29), so the Law 25 prerequisite held when signup opened. Guards: `worker/leave.d1.test.ts` (5, including the
neighbouring household left untouched) + `e2e/journey-account.spec.ts` (6).

**Wave 5 — bounds, then the gate opens.** Both bounds shipped 2026-09-23.

**Daily spend limits (0137)** — two resources cost money per use and nothing counted
them: not one AI endpoint called the rate limiter, and a demo sandbox is a real operator
session, so one unauthenticated POST bought a credential `/api/transcribe` (16 MB of
audio per call) accepted without limit. R2 is rented and the sweep reclaims it; neurons
are burned. **Every** household is capped now, not only sandboxes — a runaway loop in a
real household had no ceiling either (1 000 calls / 2 GB a day against 60 / 50 MB). R2
already had its seam (`uploadR2Media`); AI got one (`_lib/runModel.ts`, 13 raw call sites
converted), and the lint rule `babillard/metered-door` keeps both unavoidable. The counter is a single
atomic UPSERT — the naive read-then-write it replaced was planted and counted **1 of 20**
concurrent charges.

**Email verification (0138)** — gates the two doors that reach outside the household
(invite a co-operator, issue a guest link) and nothing else. Fails open where it must:
no mail wired → stamped verified at signup, and the gate no-ops. Existing accounts were
backfilled. Single use proven red; the redeem page survives StrictMode's double mount.

**The examples story is settled (2026-09-23, §3)** — which this box partly waited on: a
stranger now meets ONE story (try → keep, or sign up → an empty household).

- [x] **Open signup — OPEN 2026-09-24**: `SIGNUP_OPEN = "1"` (`_lib/signupGate.ts`), after
      the prep commit `f56bbb9e` split the invite from `LOGIN_PASSWORD`, which stays set.
- [x] **Retire the shared password — DONE 2026-09-25.** Production counted **zero** rows with
      `password_hash IS NULL`; the legacy branch is gone from `login.ts` + `_lib/sudo.ts` (a hash-less
      row is refused; « Mot de passe oublié » is its way in) and the invite code is `INVITE_CODE`.
- [x] **`LOGIN_PASSWORD` is gone from production** — confirmed absent from `wrangler secret
      list` on 2026-09-29; nothing had read that name since `3e16adba`.

**« L'autre parent » (F37) — KEPT, review ~2026-12-29 (Marc, 09-29).** Never used yet (one
operator per real household), kept for the first real couple now that signup is open. At
review, count `operators` per household; still one everywhere → retire it like the calendars.

**Capacity, for the record:** ~100 households on the free tier with realtime on, then
Workers AI neurons are the ceiling, then Workers Paid at $5/month buys hundreds. Not a
blocker at any wave above.

### M. Known limits after the 2026-09-24 pass — not boxes; each needs a device or evidence

- **Keyboard, needs Marc's phone.** Two suspects the code cannot settle: iOS still
  reporting a shrunken viewport after dismissal (the tab bar stays hidden — the
  diagnostic shows `open=true ae=BODY`), and a stranded pan after close (`open=false
  vvT>0`). Réglages ▸ Système ▸ Avancé ▸ « diagnostic clavier », on the screen
  where it happens. Fixed blind and proven by the fake-vv e2e: dialogs and sheets fit the
  visible band, a tall textarea follows its caret line, date/time inputs are pinned,
  « above the band » is corrected too (`997306a5`, `2d9ab542`).
- **Photo read.** An eight-card corpus (`8b059a2c` → `7b20ee09`): the transcriber's
  misspellings (« Broccoli », « SOUPES ») are the model's and the verify screen's to
  catch; the second model still runs in ~3 reads of 16; a bare part label heads a
  section only with a layout signal (blank line, first after the heading, or a common
  part word). The transcript rides in `recipe-vision`'s response so a miss is read at
  the source, not guessed. Re-render the corpus when a new card style fails.

### F. Not a backlog — do not mine these for work

The `bmad/` idea pools are gone with the folder (21 never-built ideas + the lifestyle brainstorms — in git if ever
wanted). `PLAN-mots-and-lifecycle-followups.md` was walked 2026-09-25 and CLOSED (its table carries every verdict and commit). A new idea starts a new pool.

---

## 5. Process review — the lessons that keep earning their keep

Written 2026-08-27 as a long retrospective; its action items are done (the `useWrite`
test, one checkbox convention, the friction tier-1, the finished ledgers moved out). What
remains is the part later sessions keep needing, kept short — git has the full text.

**What works.** Invariants as tests (the build-gating greps in §1 — the pattern that
should absorb every prose rule). Comments that carry the *why*, rejected alternatives
included. Push-to-main behind a ~2m20s gate. Verdicts recorded (`[~]` with the reason)
so a question is not re-litigated.

**What to keep doing.**

0. **A guard that has never been red proves nothing.** `nested-interactive` reported
   green over the very defect it was written for (it walked JSX by indentation; prettier
   put `<div` alone on its line). Plant the violation, watch it fail, restore — **and
   check the plant landed**: on 2026-09-24 two of three `sed` plants were no-ops and
   "proved" a rule until the mutation was re-applied through an exact-match edit.
1. **Ledgers rot faster than they are ticked.** A third of the work picked up on
   2026-08-27 was already done. Before starting an item, grep the claim in code; before
   committing, grep the repo for the other docs naming it.
2. **A review pass after the work is not ceremony.** Three defects in fresh code were
   found by re-reading it cold, not by a red test (an undo painted under the scene that
   offered it, a mis-destructured payload, a frozen nested scroller).
3. **Sweep the rule, not the site.** Fixing « Réglages writes via `api()` » literally
   left `/share` losing data for weeks; a 30-second grep would have found it.
4. **Verify before offering, not just before building.** An option built from the
   documents (« the schema migration window ») had shipped two months earlier.
5. **Effort goes where the harm is, not where the documents point.** §4's ranking is
   the correction; audits are produced faster than they are acted on, so the constraint
   is decisions, not information.
6. **Prose rules drift; only tests hold.** For every cross-cutting rule in `CLAUDE.md`,
   ask whether a test could hold it. For `useWrite` the answer was yes, and it did.
