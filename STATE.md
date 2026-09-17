# STATE.md — where Babillard is, what's left, and how we've been working

> **What this file is.** The single front door. Nine other root markdown files hold real,
> careful detail; none of them answers "what should I do next?", which is why that
> question has to be asked out loud every session. This file answers it, and points at
> the detail rather than repeating it.
>
> **It is kept SHORT on purpose** (2026-09-17). It had grown to 4 289 lines, of which the
> only open work started at line 3 490 — so the question it exists to answer was behind
> 81 % of the file. What shipped, and every closed finding, moved to `bmad/history/`;
> nothing was deleted. A line budget is enforced by `src/lib/docCounts.test.ts`, and it
> is a ratchet: it may fall, never rise.
>
> **Written 2026-08-27**, after a four-wave sweep (commits `8e526e3`, `e76bfe1`,
> `375856c`, `31598dd`). Everything below was verified against code or a command run
> that day — **not** read off another document. That distinction is the whole point:
> see [§5](#5-process-review--fresh-eyes).
>
> **Keep it living.** When a wave lands, update §1's numbers and §4's ranking here, in
> the same commit. If this file goes stale it becomes the fourteenth problem. And when
> the NEXT session's first §3 entry lands, move the current ones to
> [`bmad/history/SHIPPED.md`](./bmad/history/SHIPPED.md) — that is what keeps it short.

---

## 1. Snapshot

| | |
| --- | --- |
| **What it is** | A calm household command-center for a cheap always-on wall tablet. Single-page React app + one Cloudflare Worker (static assets + `/api/*`) + D1 + Workers AI + R2. FR-CA first. |
| **Code** | ~157k lines across 955 `.ts`/`.tsx` files (`src/`, `functions/`, `worker/`) |
| **Schema** | 135 forward-only migrations (0135 = the household's own time zone) |
| **Tests** | 2 336 unit tests in 184 files · 27 real-runtime cases in 8 files (`npm run test:d1`, the Worker in workerd against a real D1) · 157 Playwright spec files |
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
- **Twenty-two build-gating invariants.** This is the codebase's best feature (§5), and
  the list is long enough that it belongs where it is enforced rather than here: every
  one lives in `src/lib/*.test.ts`, `functions/_lib/*.test.ts` or
  `scripts/check-bundle.mjs`, each with a header saying what it caught. The rule that
  matters is §5's: **a guard that has never been red proves nothing** — plant the defect,
  watch it fail, restore.

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
> least one session on the wrong work. `grep -rc -- "- [ ] " *.md bmad/*.md` is now
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
> *(How the count moved between 2026-08-27 and 2026-09-16 — 75 → 17 → 0 → 9, and what
> each wave found — is in [`bmad/history/SHIPPED.md`](./bmad/history/SHIPPED.md) and
> [`FINDINGS.md`](./bmad/history/FINDINGS.md). It is history, and it is not needed to
> pick up work.)*

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. §4 is what is open. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `PARITY.md` | **Playbook** | The feature × dimension matrix + the canonical new-entity checklist. 0 open — Wave D is a `[~]` standing policy. Parts 5–6 are a template: copy, don't tick. |
| `ACTIONS.md` | **Playbook** | The action × door matrix (action × entry point × undo tier × non-touch). No open items — Part 5 is a template. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed-but-unbuilt features (A5–D2), never started. Not a backlog. |
| `bmad/01`–`10` | History | Brief, PRD, architecture, shipped feature lines. Requirement tags (`NFR-*`, `PRD *`, `OD-*`) resolve here. |
| `bmad/05` + `bmad/06` + `bmad/11` | ⚪ Idea pools / closed ledger | Brainstorms, and the friction audit (closed 2026-08-28). Not a backlog. |
| `bmad/history/` | **Archive** | Finished ledgers and this file's own past: `SHIPPED.md` (what shipped), `FINDINGS.md` (§4's closed sections), `REVIEW-PASS.md`, `UNIFY.md`, `UNIFORMIZING.md`, `AUJOURDHUI.md`, `12-ui-polish-queue.md`. Verdicts and arguments, no work. **Do not mine.** Tags still resolve by name under `bmad/`. |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### The front door was the noise — 2026-09-17

Asked what to do about noise, and the answer was not the code: the Worker logs eleven
`console` calls, almost all errors. It was the documentation. **This file was 4 289
lines and the only OPEN work started at line 3 490** — 81 % of the front door read before
reaching the thing it exists to answer. It had become the chronicle it was written to
replace.

Four moves and a ratchet:

- **Two closed ledgers left the root.** `REVIEW-PASS.md` (1 467 lines, « 0 open ») and
  `UNIFY.md` (486, closed) joined `bmad/history/`, which exists for exactly that and
  already held three.
- **§3 keeps the current session and nothing else**; everything older is
  [`bmad/history/SHIPPED.md`](./bmad/history/SHIPPED.md). When the next session's first
  entry lands, these move there too.
- **§4's closed sections (A–J, L) collapsed to one line each** with their verdict, the
  argument moving to [`bmad/history/FINDINGS.md`](./bmad/history/FINDINGS.md). Only §K
  is open. One thread was rescued on the way out — enforcing the CSP — and is a box now
  rather than a paragraph nobody would have found.
- **The one cross-spec flake is fixed at its cause.** `config-panels` « a list row opens
  its editor scene » passed alone and failed after other specs; its URL carried `focus=`
  twice, so the app read the first one and focused the wrong card. The sub is derived
  from `focus`, so naming the card alone is both correct and the documented way to link.
  217/217 now pass in the order that used to fail.
- **Two ratchets hold it** (`docCounts.test.ts`, both proven red): at most 660 lines, and
  the first open box within the first 260. The second is the real property — length is
  only its proxy.

**Nothing was deleted.** What left the front door is the CHRONOLOGY — the same decision
told once when planned, once when shipped, once when reviewed. Every `why`, and every
finding that turned out to be wrong, is in the archive and still greppable.

4 289 → 617 lines.


### « Delete from where you see it » on the calendar — 2026-09-16 (evening, asked mid-session)

Marc: « make sure we can remove/delete easily from detail popups and such for
rendez-vous and others on calendar ». Checked against the code: the event peek had a
delete, but behind the ⋯ then a confirm (three taps); the Mois day panel's corvée and
entretien peeks had **no** edit and **no** delete while the board's identical rows had
both; a planned meal tapped on the calendar could not be taken off the plan; and the day
page, which edits a rendez-vous inline instead of peeking, could not delete one **at
all**. One shared hook now (`components/detail/EntityRemovals`), used by the board (which
lost its three private closures), the month panel and the day page; « Supprimer » is a
visible danger button on the event peek; the day page's inline forms carry the delete
under them, and its entretien rows open the peek (the page carries its own
`DetailProvider` for that one row kind). ACTIONS.md rows updated with note ¹²;
`e2e/calendar-delete.spec.ts` (eight cases) + the event-peek spec re-pinned.

### The stranger's walk is a weekly job now — and CI had been red for three commits — 2026-09-16 (night)

Three things, in the order they were found, because the order is the lesson.

**CI had been failing since the real-runtime harness landed, and three commits never
deployed.** `knip` reads `cloudflare:test` / `cloudflare:workers` — VIRTUAL modules the
workers runtime provides — as unlisted npm dependencies. knip does not run on this
machine (the documented oxc-parser crash; CLAUDE.md already says the CI run is the one
that counts), and four more pushes went out without anyone opening the run page. So the
security headers, the nightly alert and the restore door sat on `main`, green locally,
undeployed. Fixed by naming the virtual module in `knip.json`; CI green, all four
deployed, migration 0134 applied to production, and the headers verified live with curl.
**A gate you cannot run locally has to be READ after the push** — the same shape as §5's
lesson about guards, one level up.

**The walk found a real defect on its first live run.** « Voyage » is operator-only on
the server (`authed(…, 'operator')` on every method of `/api/trips` and
`/api/shared-trip`), and the board card asked for both unconditionally — so the public
demo, once it falls back to a read-only link, took two guaranteed 403s on every board
load. Exactly the shape of the credential-less socket the scripted walk found in the
afternoon. `enabled: !isGuest()` at the two hooks, so every caller inherits it.

**The report-only CSP corrected itself the same night — which is the whole point of
shipping it report-only.** Reading a real visitor's console on production turned up two
mistakes in the policy written hours earlier: `frame-ancestors` is IGNORED in a
report-only policy (the browser says so in every console, and a directive that only
prints a warning trains people to skim), and Cloudflare's RUM beacon is injected by the
EDGE, not by our HTML — so a policy written from our own source alone would have blocked
analytics the day it was enforced. Both fixed and pinned. The walk then ran green on both
profiles against production.

**And the guard's first draft was wrong about its own subject.** It failed when the demo
handed out the read-only fallback, calling that a broken sweep — but the cap fills
legitimately whenever enough people try the demo inside 24 hours, and this walk mints one
per profile per attempt, so it was failing against its own footprint. Whether the sweep
is healthy is a different question with a different instrument: the nightly report counts
sandboxes that outlived the TTL and mails when any survived (§4-L L7), and it has the
database to prove it. The walk records which mode it got and walks that one all the way —
on the fallback it checks the fallback's own promise (it SAYS it is read-only; it grows
no ＋ it cannot honour).

### The real-runtime harness, and what it found in thirty seconds — 2026-09-16 (evening)

STATE §4-L L1–L3 landed in three commits. The third is the one to remember: the Worker
now runs in workerd against a real D1 with every migration applied (`npm run test:d1`,
in CI after the bundle check), and its first customers were the tenant-isolation sweep
(household B walking every route with A's ids — green, and red the moment one
`AND household_id = ?` was removed), the account flows, and the demo sandbox. The demo
case failed on its first run: **no sandbox had ever been swept.** Three tables in the
sweep's inventory have no `household_id` column, D1 runs the delete as one transaction,
and the sweep's own catch hid the rollback on every mint — Wave 1 had already recorded
« unable to delete ANY sandbox since 0102 » and believed it fixed. The pure inventory
guard checks that a table EXISTS; only the live schema knows its columns, and now a
case asks it. Section 5's « a guard that has never been red proves nothing » has a
sibling: **a test that cannot reach the database cannot see what the database refuses.**

> **Older entries live in [`bmad/history/SHIPPED.md`](./bmad/history/SHIPPED.md).** This
> section holds the CURRENT session's work and nothing else: when the next session's
> first entry lands, these move there. That rule is what keeps this file a front door
> instead of a chronicle — it had reached 4 289 lines, with the only open work at line
> 3 490.

## 4. What still needs improvement — consolidated and ranked

> **Asked « what should we work on? » on or after 2026-09-16 — go to [§K](#k-towards-a-public-app--the-plan-written-2026-09-16-start-here) for the product waves and [§L](#l-the-public-app-hardening-pass--planned-2026-09-16-thirteen-items-in-priority-order) for the hardening pass being worked through one item at a time.**
> It is the plan toward a public app, in six ordered waves, and Wave 0 is the wide-screen
> pass. Everything above §K in this section is settled history.

> **Everything except §K is closed, and lives in
> [`bmad/history/FINDINGS.md`](./bmad/history/FINDINGS.md)** — the argument, the
> measurements, and the several findings that turned out to be wrong. One line each
> here, with the verdict:

| § | What it was | Verdict |
| --- | --- | --- |
| **A** | Verified correctness — the `useWrite` sweep, `/share`'s lost writes | ✅ done 2026-08-27 |
| **B** | The friction pool (`bmad/11`), tiers 1–3 | ✅ closed 2026-08-28; four of five tier-3 items were already stale |
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

`bmad/05` (21 never-built ideas), `bmad/06` (lifestyle ideas),
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

4. **Audits are produced faster than they are acted on.** bmad/11 generated 33 verified
   seams; none were approved; the document has stood as a permanent unfixed inventory for
   six weeks. bmad/05, bmad/06 and PLAN-mots add ~45 more designed-but-unbuilt
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
   in bmad/11 — because they were parked in a file the "next steps?" survey treated as
   settled. The ranking in §4 is the correction.

### The four changes worth making

1. ~~**Decide bmad/11 tier-1.**~~ ✅ **done** — all five closed (2026-08-27/28), and tier 2
   with them. The decision never needed to be a five-seam grouping: taken one at a time,
   verified in code first, five of the fourteen turned out to be already fixed.
2. **Turn the `useWrite` rule into a test** (`write-rule.test.ts` + allowlist), and fix
   `/share` as its first customer.
3. ~~**Adopt one checkbox convention**~~ ✅ **done 2026-08-28** — legend at the top of each
   live ledger, template boxes stripped from `PARITY`/`ACTIONS`, ⚪ banners on the three
   idea pools, and the canonical statement in §2.
4. **Maintain this file, and freeze new audit docs** until the existing pools are decided
   or deleted. ✅ **Partly done 2026-08-28**: the three *finished* ledgers moved to
   `bmad/history/` (with a README saying why they're kept and not to mine them), so the
   root now holds ten files instead of thirteen and none of them is closed.
