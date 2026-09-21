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
| **Schema** | 136 forward-only migrations (0136 = « Les remarques ») |
| **Tests** | 2 392 unit tests in 189 files · 85 real-runtime cases in 12 files (`npm run test:d1`, the Worker in workerd against a real D1) · 157 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget · **test:d1** · knip) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Households in production** | One (Marc's), plus per-visitor demo sandboxes |

*(Numbers re-measured 2026-09-17. They are the kind that rot: re-run the commands before
quoting them — `src/lib/docCounts.test.ts` holds the ones that CAN be derived from code.)*

### Health signals

- `npm run typecheck` · `npm test` · `npm run test:d1` · `npm run build` · `npm run check:bundle` · `npm run knip` — green 2026-09-17, and all six gate the deploy.
- `npm run e2e:ci` — 1 515 passed locally 2026-09-17. **One known cross-spec order
  dependency is fixed** (`config-panels` « a list row opens its editor scene »); CI's
  E2E job is the standing whole-suite signal, and it chains off CI — so **a red CI means
  no E2E ran at all**, which hid three commits' worth of failures for a day.
- `npm run e2e:sw` — 5 passed (the kiosk's offline reboot, against the real PROD bundle).
- `npm run check:bundle` — the door's static closure is **7 chunks / 727 KB** (was 70 /
  1 131 before the hub went lazy); every chunk within budget; the SW precache covers all
  offline-needed chunks and skips build metadata.
- **The build-gating invariants** are the codebase's best feature (§5), and the list is
  long enough that it belongs where it is enforced rather than here: every one lives in
  `src/lib/*.test.ts`, `functions/_lib/*.test.ts`, `scripts/*.test.mjs` or
  `scripts/check-bundle.mjs`, each with a header saying what it caught. *(This line used
  to open with a count spelled in letters — which is a number nobody re-derives, and the
  very thing `docCounts` exists to prevent. It cannot derive "how many guards" honestly,
  so the count is gone rather than wrong.)* Three joined on 2026-09-19: `csrfExempt`
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
> a number you can trust. It reads **10** — nine in the public-readiness plan §4-K, and
> one left from the closed hardening pass (enforce the CSP, waiting on a week of reports,
> not on work). **That number is asserted from the boxes themselves** by
> `src/lib/docCounts.test.ts`, so this sentence cannot drift the way `REVIEW-PASS.md`'s
> own banner once did — it claimed 15 for twelve days against a single box.
>
> **A written box is the RARE case, not the backlog.** Most of what is worth doing lives
> in judgement: the idea pools, the parity matrix's own cells, a device pass, the next
> sweep of screenshots. Read §4 before picking work.
>
> **What `[~]` may NOT be used for:** a bullet that still says "Still open: …" is open
> work, not a park. Four were flipped back from `[~]` to `[ ]` on the day the convention
> shipped, for exactly that reason.
>
> *(How the count moved between 2026-08-27 and 2026-09-16 — 75 → 17 → 0 → 9 — is in git
> and is not needed to pick up work.)*

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. §4 is what is open. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `PARITY.md` | **Playbook** | The feature × dimension matrix + the canonical new-entity checklist. 0 open — Wave D is a `[~]` standing policy. Parts 5–6 are a template: copy, don't tick. |
| `ACTIONS.md` | **Playbook** | The action × door matrix (action × entry point × undo tier × non-touch). No open items — Part 5 is a template. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed-but-unbuilt features (A5–D2), never started. Not a backlog. |
| ~~`bmad/`~~ | **Deleted 2026-09-17** | The planning folder and the archive: brief, PRD, architecture, the idea pools, every finished ledger, and this file's own past. ~10 000 lines of documents about an app that is built. **In git, not in the tree** — `git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it. Code comments still cite its tags (`NFR-CALM-1`, `PRD C5`, `bmad/08 E-36`); they are labels now, not pointers (see CLAUDE.md ▸ Requirement tags). |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### « Les remarques » — the household reports, the pipeline answers — 2026-09-19

The MCP server made the app readable. This makes it **fixable from the inside**, and the
shape of the loop is the whole point:

```
Toi        →  une remarque (bogue · souhait · amélioration)
Claude     →  remarks_open() / remark_get()      LECTURE SEULE
Claude     →  git commit …  Regle-remarque: <id>
CI         →  typecheck · test · build · d1 · knip → deploy ✓
CI         →  POST /api/remarks/shipped          (secret CI, pas l'agent)
Toi        →  « C'est réglé » … ou « Pas réglé »
```

**The agent never writes to the household** — `functions/api/mcp.ts` still has no write
path, and the twelve tools are all reads. « Expédiée » is written by the DEPLOY, so it
means *the fix is in production*, never *an agent claims it is*. And only a human writes
« réglée »: the callback 409s on a remark somebody already confirmed.

Three doors, one composer, one hand-off (`?report=1` + a seed): the Réglages section, the
**« ? » bubble on any surface** (all eight help registries at once, carrying the semantic
help key), and the **crash screen** — which stashes the error and navigates rather than
mounting the composer, because `ErrorBoundary` is deliberately hook-free and the composer
needs exactly the machinery that may have just broken. Every report carries the route and
**the commit the reporter was running**, so « ça marche chez moi » is answered before it
is asked.

Also shipped with it, and useful on their own:

- **`data_invariants`** — the laws `CLAUDE.md` states (`media_key` iff `media_kind`, JSON
  columns, member refs resolving *inside* this household) checked against real ROWS. The
  twenty-odd build guards all read source; not one read a row. It DISCOVERS the schema
  rather than restating it, and says « non vérifié » instead of folding that into « ok ».
- **`app_health`** — and on its first real run it found that **`mail` and `alerts` are
  off in production**: the nightly cron's « the sweep is broken again » signal has nowhere
  to go, and the forgot-password flow (0133) cannot send.
- **`csrfExempt.test.ts`** — a ratchet on the shortest list with the largest blast radius.
  It found `pair/poll` sitting there while answering GET only; removed.
- **`ci-untrusted.test.mjs`** — no `${{ github.event… }}` may reach a `run:` block. It
  found an existing one in `sw-repro.yml`; fixed.

**⚠️ The loop is inert until two secrets exist** (`wrangler secret put
DEPLOY_NOTIFY_SECRET` + the same-named Actions secret). Unset fails CLOSED on both sides;
`/api/health` reports `deployHook`.

**The eager FR dictionary had hit its cap** — 16 bytes under 130 KB, so the next string
added to `src/i18n.ts` would have failed the build, whatever it was. **Cashed 2026-09-21**:
the `operator` namespace (703 lines, 21 % of the dictionary, and never confined to
Réglages) moved to `src/i18n.operator.ts` with a `useOperatorT()` that mirrors `useT()`'s
FR-first contract. **130 → 99 KB, eager total 586 → 555 KB, the door's static closure
731 → 699 KB.** And the cap came down with it, 130 → 110: a budget that keeps its old
ceiling after a win hands the next thirty kilobytes back without anyone deciding to spend
them.

The guards earned their keep on the way through. `glossary.test.ts` and
`confirmCopy.test.ts` walk `FR`/`EN` — with a fifth of the corpus gone they would have
**passed, looser, in silence**, since a ratchet only counts down. They now walk
`FR_OPERATOR`/`EN_OPERATOR` too, and that is the line a future split must not forget.

### « La maison, adressable » — an MCP server over the household — 2026-09-18

Asked how to take the app to the next level, and the answer that survived the filters was
not a feature: **the app knows more about this household than any other software, and it
has exactly one interface — its own UI.** `/api/mcp` is the second one. Claude (or
anything that speaks MCP) can now read the board, the meal plan, the list, the calendar,
the recipe book and the directory.

**READ-ONLY, by construction rather than by flag.** There is no write path in
`functions/api/mcp.ts`: of the 12 tools, most proxy a **GET** handler that already
exists and the rest (`household_snapshot`, `app_health`, `data_invariants`) run their own SELECTs,
the registry holds no POST entry, and `tools/call` can only reach a registry name. An
agent connected here cannot change the household even if it decides it should. Writes
stay a separate decision — the capture spine, the undo toast and the outbox all live in
the UI, and an agent writing past them writes past every calm guarantee.

**No Durable Object, no `agents` package, no SSE.** Spec revision **2026-07-28** removed
transport sessions *and* the `initialize` handshake: each request is self-contained, so
the whole server is one POST handler returning one JSON object — the shape every other
endpoint here already has. The `initialize` era (2025-03-26 … 2025-11-25) is answered too,
because that is what shipped clients still speak. `_lib/mcp.ts` is the wire (pure, 30 unit
cases); `functions/api/mcp.ts` is the household.

**Reuse, not a second read of the household.** Every tool calls the handler that owns its
data, so the caps, the recurrence expansion, the meal-slot order and the household time
zone are decided in one place and inherited here — including changes made after this
shipped. The one exception, `household_snapshot`, drove the extraction of
`_lib/askSnapshot.ts` out of `api/ask.ts`: two callers of "what the household is right
now" would have drifted inside a month. `ask.ts` is 139 → 43 lines.

**The credential is a device, and the security work was the real work.** A `devices` row
with `kind='agent'` (no migration — `kind` has been free TEXT since 0083's `'display'`),
minted from Réglages ▸ Système ▸ Appareils & accès, listed and revoked beside the wall
tablets. Three things the tests caught rather than the design:

- an `agent` row resolved as a plain **kiosk**, so the token was a full write credential
  everywhere else — `/api/list` POST would have worked. `resolveActor` now maps the kind
  through, `route.ts` gates `'agent'` read-only like `'display'`, and the MCP endpoint
  itself is the single declared exception (`authed(…, { readOnlyPost: true })`);
- `/api/mcp` is **CSRF-exempt** (an MCP client cannot double-submit, and per
  anthropics/claude-code#29562 may not get custom headers sent at all, so `?t=` has to
  work — the concession `/api/live` already makes). A CSRF-exempt POST that accepted the
  operator **cookie** would be a real cross-site hole, so it refuses one: scope must be
  `'kiosk'` + kind `'agent'`, which only a token produces. Plus the `Origin` check the
  transport mandates. A d1 case asserts the cookie gets 403;
- `?t=` never reached `resolveActor` at all (it only reads the header) — found by the
  real-runtime test, fixed the way `/api/live` does it, scoped to this one route.

`'mcp'` joined `SILENT_PATHS`: unmapped POSTs default to invalidating the board, so every
read-only tool call would have nudged every open device in the house.

**Gates:** typecheck · 2 365 unit (30 new, **both key guards proven red** by planting the
latin1 decode and the `id: null` notification) · **48 real-runtime, 21 new**
(`worker/mcp.d1.test.ts` — minting, revocation, the cookie refusal, the kiosk refusal,
cross-household isolation, the legacy handshake, `-32020`, 405, Origin, and the tools
actually returning this household's list) · build · bundle budget unchanged (door still
7 chunks / 728 KB — the server is Worker-side, the SPA gained one settings section).
knip does not run on this machine (the documented oxc-parser crash) — **read the CI run.**

Guide: `set-devices` point 9 (append-only) + an `OPERATOR_HELP` entry, so the « ? » works.

> **Older entries are in git, not here.** This section holds the CURRENT session's work
> and nothing else: when the next session's first entry lands, these are cut. That rule
> is what keeps this file a front door instead of a chronicle — it had reached 4 289
> lines, with the only open work at line 3 490.

## 4. What still needs improvement — consolidated and ranked

> **Asked « what should we work on? » on or after 2026-09-16 — go to [§K](#k-towards-a-public-app--the-plan-written-2026-09-16-start-here) for the product waves and [§L](#l-the-public-app-hardening-pass--planned-2026-09-16-thirteen-items-in-priority-order) for the hardening pass being worked through one item at a time.**
> It is the plan toward a public app, in six ordered waves, and Wave 0 is the wide-screen
> pass. Everything above §K in this section is settled history.

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

**One thread from §L is still waiting on time rather than on work:**

- [ ] **Enforce the Content-Security-Policy** (it ships report-only today). The door
      reported two blocked INLINE scripts on one run and none on the next — neither is
      ours, the edge injects them — so enforcing `script-src` now would break the
      marketing page intermittently while passing every local test. Read a week of
      `/api/csp-report` logs and the stranger walk's `csp-report-only.txt`
      attachments first, then decide: tighten the policy, or keep `script-src`
      permissive and enforce the rest.

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

**Wave 0 — the wide-screen pass (TODAY).** The matrix shoots 390 (phone), 360 (narrow)
and 1280 (the WALL kiosk). Nothing has ever been photographed as a **laptop operator**
(surface `mobile`, 1440 wide) or a **tablet held in portrait** (820). Expect the worst:
the whole stylesheet has four `min-width` rules above 720px, and the shell caps no width
— a laptop most likely gets the phone layout stretched across 1440px. That is the first
thing a public visitor with a laptop will see after the marketing page.

- [x] **`TABLET` (820×1180) and `DESKTOP` (1440×900) added** to `e2e/state-matrix.spec.ts`;
      DESKTOP states run `surface: 'mobile'` — a laptop operator, not the wall.
- [x] **17 states added** (`wide-*` ×11: Home signed-out, the six tabs, La semaine, day
      plan, recipe view, search; `tablet-*` ×6: the six tabs), all `noBudgetWhy`, day theme.
      Matrix 102 → 119 entries, 117 → 134 states (LEAN.md, asserted by docCounts).
- [x] **Every frame opened — and the expectation was WRONG in the good direction.** Six
      surfaces already sat in a centred column or a sidebar layout (liste, notes, search,
      day plan, recipe, Réglages); the board grid already went four-up; Home already
      centred at 56rem. Three tabs stretched edge to edge: the kitchen week (a date and
      two doors per 1370px strip), Maison (one 260px card beside 1100px of nothing), La
      semaine's rows (a chevron 1300px from its words). And the bottom tab bar spread six
      thumb targets 240px apart. Plus one thing no frame at 390px could show: the board's
      « Prochaine routine » « Faire » pill — white on a marigold member, **2.03:1** — only
      reaches the first screen at four columns, and axe caught it on the first wide state.
- [x] **Shape decided by Marc — HYBRID, and centre the tab bar** (not a sidebar): width
      where the shape earns it, a reading column where it does not. Applied as four
      `@media (min-width: 1100px)` rules, surface-agnostic so the wall benefits too:
      kitchen week → `repeat(auto-fill, minmax(11.5rem, 1fr))` (seven columns on the
      laptop, FIVE on the 1280px wall behind its sidebar — the first cut said `repeat(7)`
      and the wall's doors drew over the dates, caught on the re-shoot); Restants/Idées
      (the shared `.kitchen__ideas` pool) capped at 52rem; Maison's moments side by side
      (`.routines-moments` auto-fit); `.weekv` in the 52rem column; the mobile
      `.hubnav` gathers its six tabs in the same column via one `padding-inline` rule.
      The contrast bug got the Maison card's own answer: `tintInk()` in `lib/routineTod`
      (measured for a member hex, looked up for a moment var — the vars `readableInk`
      could never measure, which was the latent half of the Maison fix too).
- [x] **Home at 1440px** — already a 56rem column with a three-up feature grid; nothing
      to fix. Shot from now on (`wide-home`).
- [~] **Not fixed, seen, and parked with the why:** the ＋ FAB overlaps the fourth grid
      column's card text on the wide board exactly as it overlaps the last card on a
      phone — a pre-existing pattern, not a width defect; and Maison's moments at 1440
      still leave the lower two-thirds empty with two routines, which is the FIXTURE's
      size, not a layout hole.

**Wave 1 — the stranger's demo walk.** The demo is the product for months. Mint a sandbox
on production the way a stranger would — phone AND laptop, private window, no account —
and time the path from landing to the first useful thing. Log every hesitation as a box.

- [x] **Walked, twice, on production — by Playwright, as a stranger** (a scripted walk in
      the session scratchpad: landing → « Essayer pour vrai » → the six tabs → one list
      write → the ＋ sheet → `/garder`, on a 1440 laptop and an iPhone 13 profile, with a
      frame, a timer, the console and every failed request per step). The clock is not
      the problem: landing 0.4–0.8 s, mint → board 0.8–1.2 s, every tab under a second,
      the first write settled in 70 ms, on both profiles.
- [x] **The first walk could not get past the first screen.** After the mint, the stranger
      landed on `/board/habitudes` — « Le point du jour » — with the welcome dialog drawn
      over it, on both profiles, and no tab could be reached (the tour re-launched on
      every load and pulled the router back). Two shell automations both fire on a
      brand-new device: the tour auto-launch and the habit check-in's morning open (the
      seed puts habits on today; the habits payload lands after the tour has started, so
      its navigation wins). **Fixed `b2bc7ee6`**: the first day belongs to the welcome —
      a device that has not met the tour stamps the day and stands down, BEFORE the data
      gate. `first-run-quiet.spec.ts` replays production's shape (habits delayed 700 ms;
      an instant stub let the OLD code pass) plus a control that the morning open still
      opens once the tour is seen. In production for a month; nobody had minted a demo.
- [x] **Second walk, three more findings, two fixed the same day:**
      · the marketing page opened the household realtime socket with NO credential — a
        401 handshake every 2→30 s forever, the error in the visitor's console. The
        socket now follows the SESSION: `AuthProvider` connects on a confirmed sign-in
        (a sandbox included) and tears down on a confirmed sign-out; `main.tsx` connects
        at boot only for a paired tablet. `stranger-quiet.spec.ts` counts `/api/live`
        sockets on the signed-out door (0) with a signed-in control (≥1), proven red on
        the old unconditional boot line;
      · Réglages ▸ Découvrir greeted the fresh sandbox with « Quoi de neuf » about the
        Business → Commerces RENAME — news only to someone who knew the old name. A
        device with no history now starts with every current line marked seen (the next
        one shipped is the first it meets); same spec, with a control for a device that
        dismissed an older line;
      · the ❓ below.
- [~] **The first-ever undo toast hides the row you just added — ACCEPTED by Marc,
      2026-09-16: « they can close the toast ».** Once per device, the ✕ is right there,
      and the hint is worth its three lines the one time it shows. Declined, not deferred.
      Original note: on the phone, the first
      write's toast carries the once-per-device hint (« Tout se défait ici — tes derniers
      gestes restent dans « Récents » ») — three lines plus « Annuler », sitting over the
      top of the list, which is where the new row went. Once per device, by design, and
      the hint is worth having; the question is its PLACE, not its existence: fold the
      hint under the toast's expander, or shorten it to one line, or accept it. Marc's
      call — a design question, not a defect a test could hold.
- [ ] **Close the sweep loop the guard cannot**: the walks minted sandboxes on 2026-09-16
      (13:30–14:00 ET). On or after 2026-09-17 14:00 ET, mint once more and confirm in D1
      that the day-old ones are gone (`demoHousehold` sweep — unable to delete ANY
      sandbox since 0102 until 2026-09-16, and nobody noticed because nobody minted one).
- [~] **What the walk did NOT find, for the record:** the ＋ sheet, the claim form and
      Réglages all render and read well on the phone; the tab bar, the day-one tour and
      the sample banner's five « try this » doors all worked once the first screen was
      the board. No 4xx from the API on either profile.

**Wave 2 — a fresh household, a small phone, a slow connection.** Everything was tuned
against a SEEDED household on wifi.

- [x] **The fresh household was already photographed** — `board-fresh` and the five
      `first-*` states existed; what had not happened was LOOKING at them with the
      question. Looked (2026-09-16): the board's three-step welcome, the list's one line +
      « Voir le guide », the notes' dashed instruction, Maison's two doors and Découvrir
      all teach. The kitchen's fresh week is a column of empty day cards with no words —
      but its `SectionIntro` (pre-dismissed by the matrix, shown to a real first visit)
      carries the explanation, and the + on each day IS the affordance. Noted, not fixed.
- [x] **320px — fixed, and it was never the greeting's font.** The first 320px frames the
      matrix ever shot (`tiny-board/liste/kitchen/settings`, four new states) showed
      EVERY tab's title cut: « Bon apr », « La li… », « La c… ». The four-disc header
      cluster is a fixed 197px, leaving ~83px for the title. One rule in `today.css`:
      below 340px the section avatar — the last disc, decorative on every tab (the bar
      underneath names the section) and, in help mode, a door the « ? » bar's « Le guide »
      mirrors — is hidden. Mic, loupe and « ? » stay. « Bon après-midi » and « La liste »
      read whole at 320; at 360 nothing moves (the disc stays, the greeting takes two
      lines, which was already its rule).
- [x] **Cold start measured — and it hurts on a slow link.** Production, iPhone profile,
      cache cleared, CDP throttling:

      | link | door `/` first paint | door content | board first paint |
      | --- | --- | --- | --- |
      | Fast 4G (150 ms / 4 Mb/s) | 1.4 s | 1.7 s | 1.4 s |
      | Slow 4G (400 ms / 400 kb/s) | **11.2 s** | 13.2 s | 11.1 s |

      **Re-measured 2026-09-17, after §4-L L4 made the hub lazy** (same profile, same
      throttling, production):

      | link | door `/` first paint | door content | door requests |
      | --- | --- | --- | --- |
      | Fast 4G | 1.0 s | 1.3 s | 16 |
      | Slow 4G | **7.1 s** | 8.6 s | 17 |

      Seventy-eight requests became seventeen and the slow-link headline came four
      seconds sooner. The BOARD pays for it — 16.2 s to content on Slow 4G, because it
      now fetches the hub after the shell — and that is the trade taken with eyes open:
      the board sits behind a sign-in or a demo mint, and a kiosk has every chunk
      precached before it ever reboots. The door is the surface a stranger meets cold.

      The marketing door downloads **487 KB gzipped in 78 requests** — index.html
      modulepreloads the entry's whole static graph, 69 chunks, and the door pays for the
      board, the write/outbox layer, both i18n halves' shell, the QR code… A stranger at a
      school gate on a bad signal waits eleven seconds for a headline.
- [ ] **The door's eager graph — the structural fix, sized, not started (Marc, 2026-09-16:
      « good » — do it in its own session, as sized below).** The cheap
      lever was tried and reverted the same hour: making `DrawPad` lazy changed nothing,
      because the chunk NAMED `drawpad` (49 KB gz, in the door's preload list) is
      Rolldown's shared-commons chunk wearing the group's name — 100+ exports,
      `useSyncExternalStore`, `createContext`, statically imported by nearly every other
      chunk. The bundle gate's « eager » total (index + react-vendor + i18n = 654 KB)
      therefore UNDERCOUNTS what the door actually loads. The real fix is structural:
      `HubLayout` + `Board` are static imports in `router.tsx` (the kiosk's offline boot
      is the reason), so `/` carries the whole hub. Making them lazy would leave the door
      with shell + Home (~200 KB gz, ~4 s on Slow 4G, ~1 s on Fast 4G); the SW precache
      already covers every lazy chunk, so the kiosk's offline reboot survives it, at the
      cost of one more round trip on a wall tablet's warm boot. Needs its own session:
      the gate's eager set re-based, the `drawpad` group renamed to what it is, and the
      cold-start table above re-run after.
- [x] **Install prompt — built, two doors, Marc's shape** (« maybe after account creation
      too »). `lib/install` keeps Chromium's `beforeinstallprompt` (preventDefault, so the
      browser's own mini-bar does not double the offer) and knows iOS Safari has none;
      `InstallHint` is ONE quiet line in two faces: the standing door stacked into
      Réglages ▸ Affichage & veille (words + « Installer » where a prompt exists, the
      share-sheet words on iOS, « déjà installé » once standalone, nothing where there is
      nothing to offer), and a one-time `.section-intro` card on the board that signup
      and `/garder` flag on THAT device — « Plus tard » is forever, an accepted install
      spends it too. Five e2e cases (`install-hint.spec.ts`: the button calls the
      browser's prompt, dismissal survives a reload, no flag → no card, the settings door,
      the iPhone face) and a matrix state (`board-install`). Original finding: none
      anywhere — no `beforeinstallprompt` handling, no
      iOS « Ajouter à l'écran d'accueil » hint (grep: zero hits in `src/`). Android shows
      its own mini-bar for a PWA that meets the criteria; iOS never does — a household on
      an iPhone will use the app in Safari with the address bar forever unless told. The
      calm answer is ONE quiet line, once, on the device that could install — in Réglages ▸
      Affichage & veille beside the screensaver (the sub that owns "what this device
      does"), not a banner on the board. Marc's call on whether it is worth a card.

**Wave 3 — password reset (the longest pole; start it the day Wave 0's fixes land).**
There is NO forgot-password flow and the app has never sent an email. The first stranger
who forgets their password is locked out forever.

- [ ] **Resend prerequisites (Marc, outside the repo)**: verify a sending domain in the
      Resend account (`babillard.marcportal.com` or `marcportal.com` — DKIM + SPF records
      on the Cloudflare zone; the portal project's `docs/deployment/EMAIL_SETUP.md` walks
      it). Free tier: 3 000/month, 100/day — plenty. Without a verified domain Resend only
      delivers to the account owner's own address, which is enough for local proof and
      nothing else. Then `wrangler secret put RESEND_API_KEY` + `MAIL_FROM` var.
- [x] **`functions/_lib/mail.ts` — built (2026-09-16).** `mailEnabled` needs BOTH settings;
      `sendMail` is one fetch to Resend, its failure named for the log. Four unit cases
      (`mail.test.ts`: off → no fetch, the exact request shape, a 403 surfaces). Original
      note: ONE `sendMail({to, subject, text, html})` seam over
      Resend's REST API (`POST https://api.resend.com/emails`, bearer key). An OPTIONAL
      binding like `AI`/`PHOTOS`/`REALTIME_HUB` (`_lib/env.ts`): key unset → the reset
      door HIDES on `/login` and the endpoints 503 — never a half-flow. Log the provider
      id on success, the body on failure (observability is on since §4-J).
- [x] **Migration 0133 `password_resets` — built, applied locally, EXEMPT in the sweep with
      its reason.** Original note: `token_hash` (SHA-256 of a random 32-byte
      token — the plaintext exists only in the email), `operator_email`, `expires_at`
      (30 min), `used_at`, `created_at`. A row, not a bare HMAC token, because
      SINGLE-USE needs a mark. No `household_id` → `EXEMPT_TABLES` with the reason (it is
      keyed by email; the sweep never meets it). Cap outstanding rows per email (3).
- [x] **Endpoints — built and PROBED on the local Worker with a real D1** (health says
      `mail:false`; forgot → 503 while mail is unset; reset with a bad token → the one 400
      sentence, with NO CSRF header, while a plain write without CSRF still gets 403 — the
      exemption is exact). `auth/forgot` and `auth/reset` in the TABLE, `CSRF_EXEMPT`,
      `SILENT_PATHS`, `write-rule` ALLOWED with the reason. Original note: `POST
      /api/auth/forgot` (CSRF-exempt like login; ALWAYS 200 whether
      the email exists or not — enumeration; rate-limited per email + per IP the way
      `demo.ts` bounds mints) and `POST /api/auth/reset` (token + new password,
      signup-grade validation from `auth/signup.ts`, marks `used_at`, rotates the session
      secret material for that operator if the scheme allows, signs the user in). Both
      in `worker/routes.ts`' TABLE, `SILENT_PATHS` in `_lib/realtime.ts`, `write-rule`
      ALLOWED with the reason (no outbox: replaying « send me a reset » offline is wrong).
- [x] **UI — built.** `/login` shows the door only when `health.mail` says the deployment
      can send (a door to a form that can only apologise is worse than none); `/oubli`
      answers the SAME sentence whatever the address; `/reinitialiser?t=` is password +
      confirm and lands on the board signed in; a missing, spent or expired link is one
      sentence and the way back. Both scenes wear /login's shell. Original note: « Mot de
      passe oublié ? » on `/login` → `/oubli` (an `EditField` for the
      email, one line of copy, the SAME success screen for any input) → the email's link
      lands on `/reinitialiser?t=` (password + confirm, then straight to `/board`). FR-CA
      first, EN parity, `.scene`/`FormScene` like `/signup`. Expired or used token: one
      calm sentence and the door back to `/oubli`.
- [x] **Guards + e2e — eight cases green** (`password-reset.spec.ts`: the door shown/hidden
      by `health.mail`, the constant sentence, the 503 face, no token, a spent link,
      mismatched passwords never leave the page, a good link lands on the board signed in).
      PARITY row F40 + footnotes 87–92, two ACTIONS doors + notes 23–24, roster 38 → 39.
      Original note: `e2e/password-reset.spec.ts` stubs `/api/auth/*`; a unit test
      pins hash-only storage, expiry, single use and the constant 200. PARITY row (F40,
      «Compte : mot de passe oublié»), ACTIONS doors (two, non-touch ✅).

**Wave 4 — a household can leave, and knows the terms.**

- [ ] **Self-serve deletion**: `DELETE /api/household` (operator-only, confirm by retyping
      the household name, `useConfirm` copy naming what is lost — everything, including
      the photos). It REUSES `deleteDemoHousehold` (`_lib/demoHousehold.ts`) — that
      function IS the whole-schema, R2-freeing delete, and it is correct again as of
      2026-09-16. Offer « Exporter d'abord » (takeout exists) on the same card.
- [ ] **Privacy policy + terms** — two real pages (`/confidentialite`, `/conditions`), FR
      and EN, linked from Home's footer and from Réglages ▸ Système. Say what is stored
      (D1 in Cloudflare's network, R2 photos, no third-party analytics), what the AI
      endpoints send to Workers AI, retention (sandbox 24 h; a deleted household is gone),
      and the deletion + export doors above. Québec Law 25 is the bar to write to.
- [ ] **Contact door** — one address (support@ on the sending domain) on both pages and
      in Réglages, so a stranger can reach a human.

**Wave 5 — bounds, then the gate opens.**

- [ ] **Per-sandbox limits**: a daily cap on Workers AI calls and on R2 upload bytes per
      sandbox household (today only the TTL + the mint cap bound them — fine for one
      household, not for a demo link posted anywhere).
- [ ] **Email verification on signup** through the same `sendMail` seam (a verified flag
      on `operators`; unverified accounts can use the app but cannot mint guest links or
      invite a co-operator — the two doors that reach OUTSIDE the household).
- [ ] **Open signup**: drop the invite code (`LOGIN_PASSWORD` doubling as invite in
      `auth/signup.ts`) — LAST, once Waves 3 and 4 are green in production. Announce
      nowhere yet; let the marketing page carry it.

**Parked, Marc's call, not code:** whether « L'autre parent » (F37) stays — it only
earns its keep if a second phone actually wants full rights; a partner who only touches
the wall is a member face. Retire it the way the calendars went if the second phone never
happens. See the 2026-09-16 conversation; re-raise after Wave 1's walk.

**Capacity, for the record:** ~100 households on the free tier with realtime on, then
Workers AI neurons are the ceiling, then Workers Paid at $5/month buys hundreds. Not a
blocker at any wave above.

### F. Not a backlog — do not mine these for work

The `bmad/` idea pools are gone with the folder (21 never-built ideas, plus the
lifestyle brainstorms — in git if ever wanted). What is left:
`PLAN-mots-and-lifecycle-followups.md` (12 designed features, A5/A6 recommended first).
All explicitly uncommitted. They are inspiration for a *deliberate* feature decision.

---

## 5. Process review — fresh eyes

### What is genuinely working

- **Invariants as tests.** The nine build-gating checks in §1 are the best thing in this
  repo. The calm tenet cannot drift in by accident because a test scans every migration
  for it. Guide deep-links cannot rot because a test walks all seven registries. This is
  the pattern that should absorb every other prose rule.
- **Comments carry the *why*, including rejected alternatives.** `widget-grid.css`
  documents the `dense` trade-off; `outbox.ts` explains why FIFO order is load-bearing;
  `mocks.ts` now records what `fresh` does *not* empty. Sessions land cold and stay
  oriented. Keep doing this.
- **Push-to-main with a fast gate.** ~2m20s CI, deploy on green, browser suite decoupled.
  Four commits shipped in a day with no rollback.
- **Verdicts are recorded, not just decisions.** `[~]` entries that say "reviewed, kept
  distinct, here's why" stop the same question being re-litigated. Underused, but right.

### What is not working

0. **A guard that has never been red proves nothing** — and this is not a slogan, it
   cost real work twice on 2026-08-27. `nested-interactive.test.ts` was written to catch
   a control-inside-a-control on the routines grid and **reported green over exactly that
   defect**: it walked JSX by indentation, and prettier breaks a multi-attribute open tag
   right after the tag name, so `<div` was the whole line and the "does the tag close
   here?" scan ended on the element's own first line. Re-counted by tag depth, it went red
   on the routines grid, on « Notre monde », and on a THIRD case in cook mode that no
   audit had reported. The same hour, `write-rule.test.ts` had been deliberately checked
   against a planted violation, and that habit is the only reason the difference was
   visible. **Every new guard gets run against the bug it was written for, before it is
   trusted.**

   The sibling lesson, same day: **three defects in my own new code were found by
   re-reading it cold, not by a red test** — an undo painted underneath the full-screen
   scene that offered it (z-index 90 vs 40), a payload key destructured wrong on a path
   nothing exercised, and a pull-to-refresh that froze a nested scroller under the thumb.
   Green tests said nothing about any of them. A review pass after the work is not
   ceremony.

1. **The ledgers rot faster than they are ticked, and nobody notices.** This session
   found **~13 stale findings** — work already shipped, boxes never ticked: Voyage's
   "ZERO e2e coverage" (18 cases existed), guest flows' "zero coverage" (4 specs), the
   routine step editor, `createBringList`'s silent failure, help-copy drift, the whole
   UNIFORMIZING Part-D "do this now while it's cheap" list (migrations 0086–0090 had
   shipped *days* after it was written), `DayNote`, the two-todo board question,
   `.board-wall`'s max-width, the masonry's `columns: 300px`. **Roughly a third of the
   work I picked up was already done.**
   *Cause:* a fix lands in the file that owns it, and the *other* document that also
   mentions it is never opened. `PARITY.md` already states the rule — "flip a cell in the
   same commit that resolves it" — and it is not followed across files.
   *Fix:* before starting any item, `grep` the claim in code. Before committing, `grep`
   the repo for other docs naming the same thing.

2. **Five overlapping backlogs, no ranking, no front door.** 6,144 lines of process docs
   against 141k lines of code — individually excellent, collectively unusable. The proof:
   this whole session began with the question "next steps?", which the repo could not
   answer for itself. *This file is the attempted fix; it only works if it is maintained.*

3. ~~**`- [ ]` means three different things.**~~ ✅ **fixed 2026-08-28.** It meant a real
   to-do, a template checklist item (`PARITY`, `ACTIONS`) and a recorded not-doing, so
   anyone counting got a number more than half wrong — 75 against a true 17. The 40
   template boxes are plain bullets now ("copy, don't tick"), the idea pools carry a ⚪
   banner instead, and the convention is stated canonically in §2 with a copy at the top
   of each live ledger. `- [ ]` now means exactly one thing, repo-wide.

4. **Audits are produced faster than they are acted on.** The friction audit generated 33 verified
   seams; none were approved; the document has stood as a permanent unfixed inventory for
   six weeks. The idea pools and PLAN-mots added ~45 more designed-but-unbuilt
   items. **Writing another audit right now would be the wrong move** — the constraint is
   decisions, not information.

5. **Prose rules drift; only tests hold.** The `useWrite` rule is stated forcefully in
   `CLAUDE.md`, and there are ~35 raw `api()` writes, one of which loses user data
   (§4-A). Compare: the CSS invariants have a test and have not drifted. **Every
   cross-cutting rule in `CLAUDE.md` worth enforcing should be asked: could a test hold
   this?** For `useWrite` the answer is plainly yes.

6. **My own scoping was too literal — twice.**
   - I fixed *"Réglages writes via `api()`"* exactly as written and never asked "is this
     rule broken elsewhere?" A 30-second grep would have surfaced `/share`'s data loss in
     wave 1 instead of during cleanup. **When a finding names a rule violation, sweep the
     rule, not the site.**
   - Wave 2 was mis-scoped before it began: I offered "the schema migration window" as a
     major option when every item in it had shipped two months earlier — because I built
     the *offer* from the documents and only verified once I started building. **Verify
     before offering, not just before building.**

7. **Effort went where the documents pointed, not where the harm is.** Waves 2–4 were
   valuable but low-stakes (class renames, doc reconciliation, test coverage, a11y).
   Meanwhile five tier-1 friction seams that block real household rituals sat untouched
   in the friction audit — because they were parked in a file the "next steps?" survey treated as
   settled. The ranking in §4 is the correction.

### The four changes worth making

1. ~~**Decide the friction audit's tier-1.**~~ ✅ **done** — all five closed (2026-08-27/28), and tier 2
   with them. The decision never needed to be a five-seam grouping: taken one at a time,
   verified in code first, five of the fourteen turned out to be already fixed.
2. **Turn the `useWrite` rule into a test** (`write-rule.test.ts` + allowlist), and fix
   `/share` as its first customer.
3. ~~**Adopt one checkbox convention**~~ ✅ **done 2026-08-28** — legend at the top of each
   live ledger, template boxes stripped from `PARITY`/`ACTIONS`, ⚪ banners on the three
   idea pools, and the canonical statement in §2.
4. **Maintain this file, and freeze new audit docs** until the existing pools are decided
   or deleted. ✅ **Partly done 2026-08-28**: the three *finished* ledgers moved to
   the archive (with a README saying why they're kept and not to mine them), so the
   root now holds ten files instead of thirteen and none of them is closed.
