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
> `src/lib/docCounts.test.ts`, and it is a ratchet: it may fall, never rise.
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
| **Code** | ~157k lines across 955 `.ts`/`.tsx` files (`src/`, `functions/`, `worker/`) |
| **Schema** | 143 forward-only migrations (0143 = la table `mots` s'en va) |
| **Tests** | 2 934 unit tests in 241 files (2026-11-05, evening) · 124 real-runtime cases in 19 files (`npm run test:d1`, the Worker in workerd against a real D1) · 179 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget · **test:d1** · knip) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Second interface** | `/api/mcp` — read-only over the household — of the 12 tools, most proxy a GET handler that already exists, so the caps, the recurrence expansion and the time zone are decided once and inherited. (This row lives HERE, not in §3: docCounts derives that number from the registry, and the claim died the first time §3 rotated.) |
| **Households in production** | **Six** real, re-counted in D1 on 2026-09-29 — Marc's (4 members), four other real accounts from the invite gate, and the legacy read-only demo singleton — plus two live 24 h sandboxes. **Zero signups in the five days since the gate opened (09-24)**: the door works (the weekly stranger walk is green), nobody has come through it yet — and whether nobody CAME is now answerable: the nightly mail counts trials opened, kept and refused at the cap, and direct signups (0141, `_lib/strangers.ts`) |

*(Numbers rot: re-run the commands before quoting them — `docCounts.test.ts` holds the derivable ones.)*

### Health signals

- `npm run typecheck` · `npm run lint` (oxlint, since 2026-11-05) · `npm test` · `npm run test:d1` · `npm run build` · `npm run check:bundle` · `npm run knip` — green 2026-11-05, and all seven gate the deploy.
- `npm run e2e:ci` — CI's E2E job is the standing whole-suite signal, and it chains off
  CI, so **a red CI means no E2E ran at all** (that hid three commits' worth of failures
  for a day). It cannot be finished on Marc's machine: two attempts died of memory
  pressure on 2026-09-22 (a V8 heap OOM, then Vite itself refusing connections mid-run).
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
> Templates (`PARITY.md` Parts 5–6, `ACTIONS.md` Part 5) and idea pools carry **no
> checkboxes at all**. Before this, `- [ ]` meant three different things and any count
> of "open items" read **75** when the true number was 17 — a mis-count that opened at
> least one session on the wrong work. `grep -rc -- "- [ ] " *.md` is now
> a number you can trust. It reads **0** — §4-K's last box (the retired
> `LOGIN_PASSWORD` secret) closed 2026-09-29. **Asserted from the boxes themselves** by
> `src/lib/docCounts.test.ts`, so this sentence cannot drift the way `REVIEW-PASS.md`'s
> banner once did — it claimed 15 for twelve days against a single box.
>
> **A written box is the RARE case, not the backlog.** Most of what is worth doing lives
> in judgement: the idea pools, the parity matrix's own cells, a device pass, the next
> sweep of screenshots. Read §4 before picking work.
>
> **What `[~]` may NOT be used for:** a bullet that still says "Still open: …" is open
> work, not a park. Four were flipped back from `[~]` to `[ ]` on the day the convention
> shipped, for exactly that reason.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. §4 is what is open. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `PARITY.md` | **Playbook** | The feature × dimension matrix + the canonical new-entity checklist. 0 open — Wave D is a `[~]` standing policy. Parts 5–6 are a template: copy, don't tick. |
| `ACTIONS.md` | **Playbook** | The action × door matrix (action × entry point × undo tier × non-touch). No open items — Part 5 is a template. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed features, walked with Marc 2026-09-25: 7 accepted and shipped, 4 dismissed. Closed. |
| ~~`bmad/`~~ | **Deleted 2026-09-17** | The planning folder and the archive: brief, PRD, architecture, the idea pools, every finished ledger, and this file's own past. ~10 000 lines of documents about an app that is built. **In git, not in the tree** — `git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it. Code comments still cite its tags (`NFR-CALM-1`, `PRD C5`, `bmad/08 E-36`); they are labels now, not pointers (see CLAUDE.md ▸ Requirement tags). |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### Le plan de solidification — vague 0 posée, vague 1 (les bogues de flux) en cours — 2026-11-05
Three read-only audits (components/CSS · flows · tests/guards) on 2026-11-05 found the drift the ~30 guards do not cover — the same concept built two to six ways (23 copied « Chargement… » lines, 8 copied avatar blocks, the `.operator__seg` settings row ×123 with no component, 0 z-index tokens, `--danger`/`--ok` used and never defined), flows that differ by section (a meal undo that drops the recipe link, sheets that ignore the phone's back button, a kiosk shown doors the server 403s), 45 e2e specs each with their own `boot`, 192 hard waits, a `health` mock drifted from its handler, nine PARITY dimensions « manual only ». **The plan is `plans/2026-11-05-SOLIDIFY.md`** — nine waves, scope-complete by Marc's word (« doesn't matter the number of days »), no business-logic change beyond the five audited flow bugs. **Wave 0.1 landed:** `oxlint` gates CI right after typecheck, CORRECTNESS category only (`.oxlintrc.json` carries each `off` with its reason — the React-Compiler rules fired 110× asking for refactors, not fixes; `unicorn` is style). The baseline found three conditional hook calls (SouvenirsCard, CoOperatorsSection, takeout — a hook after an early return), ten comma-expression statements, two useless escapes; all fixed without a behaviour change (`useMots` grew `enabled` so the guest branch keeps its hook AND its silence). `lint-disable-rule.test.ts`: an `oxlint-disable` without ` -- <reason>` fails the build (planted red on traceFont:114; the gate itself planted red with a `debugger`, exit 1). Next: 0.2 tokens, 0.3 `useLens()`, 0.4 the e2e fixture + typed wire, 0.5 the overlay API + back button. **Wave 0.2 landed:** the token file now defines THE overlay scale (`--z-sticky` 10 … `--z-drag` 1200, 22 tokens; 25 literal z-index ≥ 10 migrated, 0 left; the prose WHY stays in capture.css) and names the three canonical breakpoints; `--danger`/`--ok` (12 sites, defined NOWHERE, each rendering its own off-palette literal) and `--muted` (3 sites, two with no fallback → `color: initial`) now resolve to the palette's own `--warn`/`--success`/`--ink-soft` — the one deliberate colour nudge of the wave; 280 fallbacks on always-defined base tokens removed (15 × a teal hex under `--accent`, 4 × the pre-contrast-fix marigold — none ever rendered, all lied). `tokens.test.ts`: an unresolved `var()`, a fallback on a base token, a literal z-index ≥ 10 each fail (three plants, each red on its named line — the first plant did NOT land and the check caught it); ratchets pinned: 24 distinct @media widths, 267 hex literals in ts/tsx. `layer-order.test.ts` resolves the tokens. **Wave 0.3 landed (two commits):** `useLens()` in `lib/audience.ts` is THE place that says what each audience sees and does — 46 inline `audience === …` sites migrated onto named flags (toddler · simple · parent · teaches · interrupts · acts · spoken), first WITHOUT a flip (8686b535, every site keeps its behaviour), then the flip by Marc's decision: the « simple » lens TEACHES (help dots, intros) and ACTS (the loupe, « Demander », edit/share on a peek, the recipe sheet no longer read-only) but is never INTERRUPTED (no auto-tour, no habit prompt, no AI toast); the toddler lens gets none of the three; board-layout edit stays parent-only. Before this the simple column was per-file luck (three sites showed it help, six hid the doors). `lens-rule.test.ts` fails a new inline comparison (red on the pre-migration tree, 46 lines named) and a `kid`/`isToddler` flag; `e2e/lens-gates.spec.ts` holds the 3×3 table — red on the unflipped tree (simple: no loupe), green after. Next: 0.4 the e2e fixture + typed wire, 0.5 the overlay API + back button. **Wave 0.4 landed:** `e2e/fixtures.ts` is THE boot (`app.boot({ route, state, api, clock, viewport, wait })` — reduced motion and the four-key seed by default, everything else opt-in), proven on cercle-crud / composer-fit / coverage (55/55; the other 42 own `boot`s migrate in wave 6); `functions/_lib/wire.ts` types a handler's answer ONCE and `e2e/mocks.ts` is typed against it — `health` first: the fixture had 4 of the handler's 15 keys (`photos`/`realtime`/`cloudOcr` always falsy in every browser test), now all 15 with today's effective values, and deleting a key is a `tsc` error (planted: `realtime` removed → TS2741); `mocksContract.test.ts` reads the Worker's route TABLE as text — a fixture for a route that does not exist fails (planted `healthz`), and routes without a fixture are a ratchet at 83 of 127. **Wave 0.5 landed:** the phone's BACK BUTTON closes the overlay instead of leaving the page — `useModal({ history: true })` holds one same-URL entry per open overlay (pushes and pops in strict sequence: an overlay opening in the tick another closes used to have its entry eaten by the pending pop — five reds on the first run), opted into by Modal · Sheet · confirm · ActionMenu · ZoomableImg · FlyerViewer · FlippPager and NEVER by a routed scene (the router owns its entry; DrawPad keeps its own back-BLOCKING sentinel); `Modal` gained an accessible name (`title` → aria-labelledby, `ariaLabel`), `footer` (THE button row) and `size`; `Sheet` gained `title`; `SceneHead`'s `onClose` is optional and `backTo` draws a ← (the five hand-copied heads fold onto it in wave 3; the title class is `scene__head-title`, `pm-sheet__title` aliased until then); the AI-error toast stopped calling itself an alertdialog; RoutineRunPage got Escape. `overlay-rule.test.ts`: a `role="dialog"` or a `useModal(` outside the three shells needs a reason (planted red on SectionIntro:82); `e2e/back-closes-overlay.spec.ts` (6 cases on the new fixture) — red with Sheet's entry off (back left the page: the old bug), green with it. **Wave 0 is done; wave 1 (the flow bugs) is next.** **Wave 1, first batch (1.1 · 1.2 · 1.4 · 1.5):** « Retirer du plan » undoes through the owner (`restoreMeals`) and the board/month payloads now carry `recipe_id`, so the link survives the round trip (`EntityRemovals.test`; `write-owners` refuses a hand-rolled meals POST in an `onUndo`); `recap.ts` and `suggest-meal.ts` step local days with `addLocalDays` (`localDay-rule.test`: a midnight ± n×86400 fails — its first draft flagged a `/ 86400` day COUNT and was narrowed); an emptied note is deleted WITH an undo (`undoTier`: a family-notes DELETE must be held or undoable); and the real 1.4 — 36 handlers are `authed(…, 'operator')` (my first grep missed the multi-line calls and said two; the audit was right) — `lib/device.ts` `needsOperator()` = guest OR paired kiosk, gates ~20 files (virements, habits delete, the voyage scenes, transfer forms, family share, place import, sample data, `thisWeek` flipped to an operator-only section), `operator-doors.test.ts` derives the set from the handlers and pairs every client call site with it (ALLOWED carries the why for Réglages bodies under `access: operator` and surfaces that render on `signedIn`, which is an OPERATOR session only), `e2e/kiosk-doors.spec` with an operator control per door. **The « pre-existing » CI reds were real bugs, both ours** (fff40086): `recipeVersions` read ANY pair of same-named sections (ingredients + steps) as an alternative, so the commonest sectioned recipe (« Biscuits » / « Glaçage » in both lists) opened with an EMPTY base view and the picker said « Ajouter (0) » — a pair is a version only when its title says so (`isVersionTitle`); and `month-day-panel.spec`'s stub seeded its day at `from + 20 * 86400`, the documented DST trap, red since the fall-back Sunday — `addLocalDays`. `config-panels:264` is the lazy chunk's cold compile (7 s alone, > 15 s as the 11th test of a cold shard): budget doubled. **Wave 1, second batch — wave 1 is DONE (2026-11-05, evening):** 1.3 verified (ActionMenu already rides `useModal({ history })`, the ＋ sheet's pickers are in-sheet views, `back-closes-overlay.spec` covers both). 1.6 `loadStateOf(q, { shape? })` / `<LoadState q>` in components/Fallback.tsx is THE pre-data decision (no data + error → LoadError with a retry; no data → Skeleton when the shape is known, else Loading); 24 sites adopted, among them the two FALSE EMPTIES (La liste, La cuisine rendered the empty surface on a failed cold read) and two import pages whose « introuvable » was a lie on any non-404 failure; `load-error-rule.test.ts` (planted red on CercleFormPage); `error-paths.spec` drives nine routes through a 500 → « Réessayer » → recovery. 1.7 three DELETE-then-re-POST undos (the day scene's meal, the Réglages list template, the morning's emptied note) ride `useDeferredRemoval` — the row hides, the write waits behind the toast, « Annuler » un-hides the SAME row (the re-POST minted a new id and left every reference dangling); the day note stays compensating and says why (keyed by date); `undoTier.test.ts` refuses the shape (planted red with the old template delete, and it found the note). 1.8 a drag is never the only door: the meal row ⋯ gains « Déplacer… » (the shared day + slot picker in a Sheet → `reschedule`, undo = the inverse move) and the family builder's face chips gain ⋯ « Placer » (bands + tray); ACTIONS.md's four rows now say which mirror; `dnd-mirror.test.ts` (inventory, planted with a scratch host) pairs all 16 `usePointerDnd` hosts with their mirror; `dnd-mirrors.spec` drives both, mouse only. 1.9 the plan's « hidden-scrollbar rows » were visible-scrollbar rows whose real defect was the wheel: seven elements (cook rails, recipe filters, DrawPad's template pickers) take `useHScroll`; `src/styles/hscroll-rule.test.ts` pairs every « flex + overflow-x » CSS class with a `ref=` on its JSX host (token-bounded — its first draft read `rail` inside `cook__timer-rail`; planted red twice). Also: `kiosk-doors.spec`'s virements control counted doors by TEXT, and every door is an icon-only button named by aria-label — red from the day it shipped, now by role. **Wave 2 is DONE (2026-11-05, evening — six commits, 2f6586cd → 1197720a):** the mechanical sweeps, each with its guard planted red. 2.0 `kit-class-rule.test.ts` — a class TOKEN with an owner may be spelled in a `className=` only by its owner (`classNameValues` lifted into `buildGuardScan`, pinned against a fixture that carries a union type, a gallery keyword and a demo label); tokens owned so far: `loading`, `avatar*`, `searchfield*`, `btn--icon`. 2.1 the 22 hand-spelled « Chargement… » lines → `<Loading>` (now takes children) or `loadStateOf` (nine were a query’s wait); `router.tsx` had its own `function Loading()`. 2.2 `Avatar` takes `photoUrl` · `className` · `decorative` · `shape`; eight hand-rolled face discs folded onto it; `avatar-rule.test.ts` refuses the initial-fallback idiom as a JSX child (its first draft read six capitalize helpers and was narrowed). 2.3 `EmptyState size="cell"` (terse, no guide link) + `StatusMessage live/as`; eleven cells and nine raw `role="status"` lines folded, seven one-rule CSS classes gone; `empty-rule` + `status-rule`. 2.4 `SearchField size="sm" / onSubmit`; five raw search inputs folded; `search-rule`. 2.5 **`IconButton`** — the one justified new primitive: `label` required (two ＋ shipped nameless), ghost · solid · bare, md · sm; 31 `.btn`-family glyph buttons + the three shells’ closes ride it, the close classes hold position only; `icon-button-rule` (hard on a nameless glyph, ratchet 115 on the hand-spelled families). 2.6 one `.btn` spelling — btn → tone → size → layout → mono → page; 29 literals folded; `btn-order` (ratchet 92 distinct). **Correction (same day):** this entry first claimed every [visual] step had been looked at; it had not. Most matrix frames of 2.2, 3.1 and 3.2 were captured but not opened, and four surfaces had never been seen (recipe hearts, emoji search, cashier ✕, PanZoom). All were then reviewed as before/after contact sheets and individually: no regression; the one real change is the lighter labels of the list editor (3.1). Also: 3.2 folded every pill in ONE commit against the plan's one-pill rule, on the grounds that no class changed; and 1.3's nested-picker question was only answered by `e2e/segmented.spec.ts` (back from a drilled ＋ sheet closes the sheet). **Wave 3 so far:** 3.1 `Field` (102 sites), 3.2 `SettingsRow` (42 rows), 3.3 `Segmented` — the first `role="radiogroup"` in the app, one tab stop + arrows, over the five settings pickers, the board view, cook view and density, the ask modes, the draw tools and DevKit's axes; cook's two tab rows moved to `SubTabs`. Deliberately NOT folded, each with its reason in `segmented-rule.test.ts`: the Réglages sidebar tablist (a vertical nav with one hue per tab), plus `habit-form__seg` (native radios already), the emoji and sticker grids, `draw-choice`. **Next:** 3.4 `SceneHead` ×5 · 3.5 overlay naming + footers · 3.6 rows + badges · 3.7 prop grammar.

## 4. What still needs improvement — consolidated and ranked

> **No open box.** (2026-09-29) §K's six waves and §L are all closed; what is left is §M
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
day belongs to the welcome, and `first-run-quiet.spec.ts` replays production's timing
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

**Wave 3 — password reset. ✅ CLOSED 2026-09-23, verified against production.** It was
called the longest pole and it was: there was no forgot-password flow at all and the app
had never sent an email, so the first stranger to forget a password was locked out
forever. Built 2026-09-16 (`_lib/mail.ts` over Resend as an OPTIONAL binding, migration
0133 `password_resets` storing only a token HASH, `auth/forgot` answering the same 200
whatever the address, `auth/reset` single-use + signup-grade validation, `/oubli` and
`/reinitialiser?t=`, eight e2e cases) — then sat DARK for a week because the secrets were
not set, which is why `app_health` exists to say so out loud.

Turned on 2026-09-23. `marcportal.com` had been verified in Resend for four months
already (the portal project); what was missing was a key of Babillard's own — « Sending
access », not the portal's full-access one, so revoking one cannot silence the other and
the Emails log can tell the two apps apart — plus `RESEND_API_KEY`, `MAIL_FROM` and
`ALERT_EMAIL`.

**Walked end to end, which is the part no test could do.** An unknown address answered
`200 {"ok":true}` in 0.14 s and wrote no row — the enumeration guarantee observed from
the outside, where an attacker stands. A real one answered the SAME 200 in 0.53 s, the
extra ~400 ms being the Resend call, and the mail arrived at Hotmail. The link was opened
and a password set: the row was marked `used_at` **15 seconds after it was minted**, and
the abandoned token beside it stayed `UNUSED` and expired on its own. Single use,
hash-only storage and the 30-minute window all hold against real rows.

Two things worth carrying: `reset.ts` bumps `session_version` in the same batch (0134), so
completing a reset signs the operator out of every other device — correct, and surprising
if you meet it on a phone. And **the nightly cron can finally reach a human**: `alerts`
was false for as long as mail was, so a failed backup or an unsweepable sandbox had
nowhere to go but the log.

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
neighbouring household left untouched) + `e2e/leave-and-legal.spec.ts` (6).

**Wave 5 — bounds, then the gate opens.** Both bounds shipped 2026-09-23.

**Daily spend limits (0137)** — two resources cost money per use and nothing counted
them: not one AI endpoint called the rate limiter, and a demo sandbox is a real operator
session, so one unauthenticated POST bought a credential `/api/transcribe` (16 MB of
audio per call) accepted without limit. R2 is rented and the sweep reclaims it; neurons
are burned. **Every** household is capped now, not only sandboxes — a runaway loop in a
real household had no ceiling either (1 000 calls / 2 GB a day against 60 / 50 MB). R2
already had its seam (`uploadR2Media`); AI got one (`_lib/runModel.ts`, 13 raw call sites
converted), and `usageRule.test.ts` keeps both unavoidable. The counter is a single
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
  vvT>0`). Réglages ▸ Système ▸ Appareils & accès ▸ « diagnostic clavier », on the screen
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
