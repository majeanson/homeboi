# STATE.md — where Babillard is, what's left, and how we've been working

> **What this file is.** The single front door. Thirteen other markdown files in this
> repo hold real, careful detail; none of them answers "what should I do next?", which
> is why that question has to be asked out loud every session. This file answers it, and
> points at the detail rather than repeating it.
>
> **Written 2026-08-27**, after a four-wave sweep (commits `8e526e3`, `e76bfe1`,
> `375856c`, `31598dd`). Everything below was verified against code or a command run
> that day — **not** read off another document. That distinction is the whole point:
> see [§5](#5-process-review--fresh-eyes).
>
> **Keep it living.** When a wave lands, update §1's numbers and §4's ranking here, in
> the same commit. If this file goes stale it becomes the fourteenth problem.

---

## 1. Snapshot

| | |
| --- | --- |
| **What it is** | A calm household command-center for a cheap always-on wall tablet. Single-page React app + one Cloudflare Worker (static assets + `/api/*`) + D1 + Workers AI + R2. FR-CA first. |
| **Code** | ~141k lines across 823 `.ts`/`.tsx` files (`src/`, `functions/`, `worker/`) |
| **Schema** | 121 forward-only migrations |
| **Tests** | 1748 unit tests in 295 files · 106 Playwright spec files (~1120 cases) |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Households in production** | One (Marc's), plus per-visitor demo sandboxes |

### Health signals, all green as of 2026-08-27

- `npm run typecheck` · `npm test` (1748) · `npm run build` — green.
- `npm run check:bundle` — **3841 KB** of JS across `dist/assets`, **727 KB eager**; every
  chunk within budget; the SW precache covers all offline-needed chunks and correctly
  skips the online-only ones.
- Full local Playwright suite — **1120 passed, 13 skipped**.
- Last four pushes: CI green, deployed. Working tree clean, nothing untracked.
- **Six build-gating invariants** (this is the codebase's best feature — see §5):
  `calm-tenets.test.ts` (no streak/points/badge/push table, no inventory column),
  `field-fit.test.ts` + `keyboard-fit.test.ts` (CSS invariants), `helpRegistry.test.ts`
  + `discovery.test.ts` (no dead guide deep-links), `demoHousehold.test.ts` (a new table
  must join the sandbox sweep), `realtime.test.ts` (`PATH_KEYS` coverage),
  `check-bundle.mjs` (size + precache).

---

## 2. The document map

Thirteen root `.md` files, 6,144 lines. They are **not** interchangeable, and three of
them are finished. Read this table before opening any of them.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `UNIFORMIZING.md` | Ledger | ✅ **CLOSED** — zero open items, verdicts only. Do not re-mine it for work. |
| `AUJOURDHUI.md` | Ledger | ✅ **Effectively closed** — 1 open item, deliberately (see §4-D). |
| `REVIEW-PASS.md` | Ledger | 🟡 **31 open** P2/P3 findings across 8 sections. The main written debt pool. |
| `bmad/11-friction-audit.md` | Ledger | 🔴 **14 ranked seams + tier-3 polish, none approved.** The highest-value pool. See §4-B. |
| `bmad/12-ui-polish-queue.md` | Queue | 🟡 12 Marc-approved contained UI wins, unscheduled. |
| `PLAN-mots-and-lifecycle-followups.md` | Feature backlog | 🟡 12 designed-but-unbuilt features (A5–D2), never started. |
| `bmad/05` + `bmad/06` | Idea pools | ⚪ Brainstorms. Nothing committed. Don't treat as a backlog. |
| `PARITY.md` | **Playbook** | 35 "open" boxes are a **per-feature checklist template**, not work. Never "close" them. |
| `ACTIONS.md` | **Playbook** | Same: 7 boxes are the add-an-action checklist. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `bmad/01`–`10` | History | Brief, PRD, architecture, and shipped feature lines. Requirement tags (`NFR-*`, `PRD *`, `OD-*`) resolve here. |

**The trap this table exists to stop:** `PARITY.md` + `ACTIONS.md` contribute 42 unticked
boxes that are templates. Any naive count of "open items" — including the one that opened
this session — reads 75 and is wrong by more than half.

---

## 3. What just shipped (2026-08-27)

Four waves, each its own commit, all green, no rollbacks.

1. **Correctness** (`8e526e3`) — 9 fixes. The screensaver's wake tap never re-armed the
   idle cycle (`stopPropagation()` by design, so it never reached the window listener) →
   new `lib/idleHold.ts`; voice capture now holds off the screensaver; the day-part drift
   never restarted when enabled mid-session; **one permanently-refused write blocked the
   entire offline outbox forever, silently** → bounded attempts + dead-letter
   (`replayVerdict`, unit-tested); the pending-write count was invisible when
   `navigator.onLine` lied; two Réglages writes migrated to `useWrite`.
2. **Uniformization** (`e76bfe1`) — `FamilyBuilder`'s bespoke segmented control →
   `SubTabs` (its "deliberately different" note was simply wrong); `.cercle-share*` →
   `.sharesheet*`. Two rejections recorded with reasoning instead of churn.
3. **E2E** (`375856c`) — 26 cases over 5 real gaps: the routine countdown, the cook-mode
   stepper, board empty-cards, the toddler board, « À apporter ».
4. **Board a11y + polish** (`31598dd`) — every board card is now a **named region**
   (a bare `<section>` is not a landmark, so the whole board reached assistive tech as
   one undifferentiated run); a width sweep at 320/568/667/1600/2560; and `RealtimeHub`
   moved to the **WebSocket Hibernation API** (a wall tablet never closes its tab, so the
   old in-memory socket set billed continuous wall-clock per household for an idle hub).

**Roughly a third of what those waves picked up was already done and never ticked** — see §5.

---

## 4. What still needs improvement — consolidated and ranked

Deduplicated across every source above. Ranked by **user harm**, not by which document
it happens to live in.

### A. Verified correctness — do these first

1. **`/share` loses captures offline.** `SharePage.tsx:94,108` posts through raw `api()`,
   not `useWrite()` — so the PWA share-target capture has **no outbox**: offline, it is
   silently lost. Verified 2026-08-27. This is bmad/11 tier-1 seam #2 and is the same
   bug class the outbox dead-letter fixed in wave 1. `QuickAddPage` next door does it
   correctly — copy that.
2. **The `useWrite` rule is prose-only, and it has drifted.** A sweep found **~35 raw
   `api()` write sites** outside `lib/write.ts`. Most are legitimately online-only
   (login, pairing, seeding, minting a share link, an operator review/merge). But about
   eight are ordinary household content that should queue: `/share` (above),
   `board/Notes.tsx:105-106` (saving a drawn fridge note), `lib/drawingGallery.ts:70,117`,
   `cercle/ContactPhotos.tsx` ×3, and the household-preference PATCHes in
   `lib/measurePrefs.ts`, `operator/recipePills.tsx`, `operator/recipesTags.tsx`,
   `operator/guest.tsx:780`.
   **Fix the class, not the sites:** migrate those eight, add a one-line
   "online-only because…" comment to each legitimate exception (the pattern already used
   in `operator/aiErrors.tsx`), then **make it a build-gating test** — a grep-style
   `write-rule.test.ts` with an explicit allowlist, exactly as `field-fit.test.ts` and
   `keyboard-fit.test.ts` already guard CSS invariants. A prose rule drifts; a failing
   test does not.

### B. The friction pool — highest user value, **blocked on a decision**

`bmad/11-friction-audit.md` holds 14 ranked seams from five flow audits, every one
verified against code at the time. Its five **tier-1** entries block rituals or lose data:

1. Sunday planning can't reach Fri/Sat (the core weekly ritual is impossible on the two
   evenings it actually happens).
2. `/share` loses or strands captures — **also §4-A above**.
3. A dated loose todo silently vanishes after its day.
4. The locked kiosk (`?kid=1`) hides every parent glance — a one-tablet household loses
   its 7h10 surface every morning.
5. A half-done routine pins the kiosk; no "switch kid" affordance.

**Status: parked.** On 2026-07-13 Marc explicitly declined the proposed F1–F5 fix-wave
grouping. The *grouping* was rejected, not the seams — they have never been disputed, and
nothing has changed about them since. **This is the single biggest gap between what is
documented and what is fixed, and it needs one decision, not more analysis.** The right
next question to Marc is which tier-1 seams to take, individually.

### C. Section debt — `REVIEW-PASS.md`, 31 findings

Steady, contained work; nothing here loses data. Distribution: Le cercle 11 · Kitchen 4 ·
Routines 4 · Réglages 5 · Share/inbound 3 · Capture 2 · Scenes 2. Recurring shapes worth
batching rather than picking off one at a time:

- **Reuse duplicates** — the "which ingredients?" checklist exists twice; `capitalize`
  ×3; three `Member` shapes converge on one face control; `OperatorJump` and `ItemReorder`
  aren't in DevKit.
- **A11y** — nested interactive-in-interactive on the parent routine grid; a `role="img"`
  SVG with `role="button"` descendants in « Notre monde ».
- **Silent states** — `NoteEditor` auto-save gives no cue; `ThisWeek` has no error state.
- **Remaining e2e gaps** — Le cercle is screenshots-only; the toddler kitchen picker
  (the most interaction-dense surface in the kitchen) is untested; config panels are
  screenshot-only, so a broken PATCH would pass.

### D. Judgement calls waiting on Marc, not on code

- **`ARM_MS` 6s → 10s** on the toddler tiles (`components/BigTiles.tsx`) — empirical;
  needs one real bedtime observed. The only open box in `AUJOURDHUI.md`.
- **Review-queue counts** in intake/postbox section titles — borderline against the
  no-counts tenet; operator-only and passive. Keep, or drop the number.
- **Routines invalidate `BOARD_KEY` but never surface on the board** — either wire a
  morning-routine glance (a possible missing feature) or drop the dead invalidate.
- **Two timers on screen at once** on a timed routine step (the countdown ring *and* the
  run stopwatch) — a design decision.

### E. Tooling gaps found during this cleanup

- **`knip` is not a gate, and currently does not run.** It is absent from `.github/workflows/ci.yml`,
  and on this machine it now crashes every time (`oxc-parser` `RangeError: Array buffer
  allocation failed`) — it ran once earlier the same day, so it is environmental, but the
  "dead-code gate" is neither gating nor runnable. Either fix and wire it, or stop calling
  it a gate.
- **Its signal is buried anyway.** Of 24 flagged "unused exports" checked by hand, **two**
  were genuinely dead (`CARD_ZONES`, `CARD_MODES` — removed 2026-08-27). The other 22 are
  used *inside their own module*; knip is really reporting an unnecessary `export`
  keyword. Worth configuring away, or the report will keep being ignored.
- `src/pages/PlannerOrSomething.code-workspace` — a stray VS Code stub sitting in
  `src/pages/`. Git-ignored, harmless, but it doesn't belong there.

### F. Not a backlog — do not mine these for work

`bmad/05` (21 never-built ideas), `bmad/06` (lifestyle ideas),
`PLAN-mots-and-lifecycle-followups.md` (12 designed features, A5/A6 recommended first).
All explicitly uncommitted. They are inspiration for a *deliberate* feature decision.

---

## 5. Process review — fresh eyes

### What is genuinely working

- **Invariants as tests.** The six build-gating checks in §1 are the best thing in this
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

3. **`- [ ]` means three different things.** A real to-do, a template checklist item
   (`PARITY`, `ACTIONS`), and a recorded not-doing. Anyone counting gets a number that is
   more than half wrong. *Fix:* one convention, stated at the top of every ledger —
   `[ ]` to-do · `[x]` done · `[~]` reviewed-and-parked-with-a-why · templates never use
   checkboxes at all.

4. **Audits are produced faster than they are acted on.** bmad/11 generated 33 verified
   seams; none were approved; the document has stood as a permanent unfixed inventory for
   six weeks. bmad/05, bmad/06, bmad/12 and PLAN-mots add ~60 more designed-but-unbuilt
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

1. **Decide bmad/11 tier-1.** Five seams, individually, yes or no. Biggest available user
   value; needs a decision, not analysis.
2. **Turn the `useWrite` rule into a test** (`write-rule.test.ts` + allowlist), and fix
   `/share` as its first customer.
3. **Adopt one checkbox convention** and put the legend at the top of each ledger; strip
   checkboxes from `PARITY`/`ACTIONS` templates entirely.
4. **Maintain this file, and freeze new audit docs** until the existing pools are decided
   or deleted.
