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
| **Schema** | 139 forward-only migrations (0139 = la confiance derrière chaque dépense) |
| **Tests** | 2 452 unit tests in 195 files · 124 real-runtime cases in 19 files (`npm run test:d1`, the Worker in workerd against a real D1) · 157 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget · **test:d1** · knip) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Second interface** | `/api/mcp` — read-only over the household — of the 12 tools, most proxy a GET handler that already exists, so the caps, the recurrence expansion and the time zone are decided once and inherited. (This row lives HERE, not in §3: docCounts derives that number from the registry, and the claim died the first time §3 rotated.) |
| **Households in production** | **Six**, counted in D1 on 2026-09-22 — Marc's (4 members), four other real accounts from the invite gate, and the legacy read-only demo singleton. This row said « One (Marc's) » for months: other people's households are already in there, which is what Wave 4 (deletion, privacy, a contact door) is actually about |

*(Numbers rot: re-run the commands before quoting them — `docCounts.test.ts` holds the derivable ones.)*

### Health signals

- `npm run typecheck` · `npm test` · `npm run test:d1` · `npm run build` · `npm run check:bundle` · `npm run knip` — green 2026-09-17, and all six gate the deploy.
- `npm run e2e:ci` — CI's E2E job is the standing whole-suite signal, and it chains off
  CI, so **a red CI means no E2E ran at all** (that hid three commits' worth of failures
  for a day). It cannot be finished on Marc's machine: two attempts died of memory
  pressure on 2026-09-22 (a V8 heap OOM, then Vite itself refusing connections mid-run).
- `npm run e2e:sw` — 5 passed (the kiosk's offline reboot, against the real PROD bundle).
- `npm run check:bundle` — the door's static closure is **9 chunks / 645 KB** (was 70 /
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
> a number you can trust. It reads **1** — §4-K's last: deleting the retired
> `LOGIN_PASSWORD` secret in production, Marc's `wrangler login`. **Asserted from the boxes themselves** by
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
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed-but-unbuilt features (A5–D2), never started. Not a backlog. |
| ~~`bmad/`~~ | **Deleted 2026-09-17** | The planning folder and the archive: brief, PRD, architecture, the idea pools, every finished ledger, and this file's own past. ~10 000 lines of documents about an app that is built. **In git, not in the tree** — `git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it. Code comments still cite its tags (`NFR-CALM-1`, `PRD C5`, `bmad/08 E-36`); they are labels now, not pointers (see CLAUDE.md ▸ Requirement tags). |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### Signup is open — and the day it took to make that true — 2026-09-24

**The gate** (`f56bbb9e` → `5a8e1360`): deleting `LOGIN_PASSWORD` would have opened
four doors, not one — it was also every legacy (no-hash) account's password and sudo
lock, and login's « unknown email creates the household » path would have become a
passwordless signup. The invite is its own switch (`SIGNUP_OPEN`, `_lib/signupGate.ts`),
that login path is gone, the shared secret stays. **Strangers cost what a visitor
costs** (`b185cb90`, 0139): the daily AI/R2 ceiling follows the household's TRUST
(sandbox · unverified · confirmed) plus one pool all strangers share. **Other households
reach Marc** (`beb38285`): their remarks and the door's COUNTS ride the nightly mail. The
weekly stranger walk takes `/signup` in FR + EN (`e359eeff`).

**Then Marc's phone, one morning** — each fixed the same day, each proven red: the
keyboard opened on its own on a dozen screens (`727637db`, `autofocus.test`); an add had
no « Annuler » (`a05c3da7`, `useCreateWithUndo` everywhere); a checked list item flipped
back seconds later (`d7fc54c0`, `writeWith` cancels in-flight polls + `reapply`); and the
photo import — quotes on every line, the method as ingredients, « Cuire 2 minutes » gone.
Reproduced six ways against production: the vision model, asked for JSON, cut by
max_tokens. **It only transcribes now**; the transcript takes the paste path
(`_lib/recipeDraft`), and `_lib/recipeRepair` holds the six real reads (`8b059a2c`).

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

**§L's last thread, closed on time rather than on work:**
- [x] **Enforce the Content-Security-Policy — DONE 2026-09-22, the second of the two
      options it named.** The week of report-only came back with exactly one finding, and
      it is not ours: the edge injects inline scripts into the marketing door (two on one
      run, none on the next — the RUM beacon and the challenge machinery). So `script-src`
      keeps `'unsafe-inline'` and **every other directive is now ENFORCED** — `default-src
      'self'`, `object-src 'none'`, `base-uri`, `form-action`, the allow-lists and
      `frame-ancestors`. What survives the concession is worth naming: a remote script
      from an origin nobody allowed still cannot load. The report-only twin keeps the
      STRICT `script-src`, so the evidence for tightening keeps arriving and the day the
      edge stops injecting is a data question, not a guess. Verified on production after
      the deploy (the live stranger walk reads the visitor's console: zero CSP errors).

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
The door's last 55 KB came off on 2026-09-22 (the `drawpad` commons chunk, §3). The
install prompt shipped in two faces, Marc's shape. The one thing NOT re-measured is the
production cold-start table after that last 55 KB — bytes, not a stopwatch.

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
`i18n.ts`. `CONTACT_EMAIL` is the contact door, still unset in production and the one Law
25 prerequisite before signup opens. Guards: `worker/leave.d1.test.ts` (5, including the
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
- [ ] **`npx wrangler secret delete LOGIN_PASSWORD`** in production, after this deploy —
      nothing reads that name any more; the value was the invite handed to other households.

**Parked, Marc's call, not code:** whether « L'autre parent » (F37) stays — it only
earns its keep if a second phone actually wants full rights; a partner who only touches
the wall is a member face. Retire it the way the calendars went if the second phone never
happens. See the 2026-09-16 conversation; re-raise after Wave 1's walk.

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

The `bmad/` idea pools are gone with the folder (21 never-built ideas, plus the
lifestyle brainstorms — in git if ever wanted). What is left:
`PLAN-mots-and-lifecycle-followups.md` (12 designed features, A5/A6 recommended first).
All explicitly uncommitted. They are inspiration for a *deliberate* feature decision.

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
