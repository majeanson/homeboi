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
| **Code** | ~145k lines across 834 `.ts`/`.tsx` files (`src/`, `functions/`, `worker/`) |
| **Schema** | 123 forward-only migrations |
| **Tests** | 1823 unit tests in 142 files · 115 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Households in production** | One (Marc's), plus per-visitor demo sandboxes |

### Health signals, all green as of 2026-08-27

- `npm run typecheck` · `npm test` (1823) · `npm run build` — green.
- `npm run check:bundle` — **3859 KB** of JS across `dist/assets`, **733 KB eager**; every
  chunk within budget; the SW precache covers all offline-needed chunks and correctly
  skips the online-only ones.
- Full local Playwright suite — **1128 passed, 13 skipped**.
- Last four pushes: CI green, deployed. Working tree clean, nothing untracked.
- **Ten build-gating invariants** (this is the codebase's best feature — see §5):
  `calm-tenets.test.ts` (no streak/points/badge/push table, no inventory column),
  `field-fit.test.ts` + `keyboard-fit.test.ts` (CSS invariants), **`write-rule.test.ts`
  (every `/api/*` write goes through `useWrite`, added 2026-08-27)**,
  `helpRegistry.test.ts` + `discovery.test.ts` (no dead guide deep-links),
  `demoHousehold.test.ts` (a new table must join the sandbox sweep),
  `realtime.test.ts` (`PATH_KEYS` coverage), **`nested-interactive.test.ts` (no control
  inside a control, no `role="img"` on an interactive SVG — added 2026-08-27)**,
  `check-bundle.mjs` (size + precache), and **`ingredient-mirror.test.ts` (the client
  and server copies of `ingredientName` are the same code — added 2026-08-28)**. `knip`
  now runs in CI too.

---

## 2. The document map

Thirteen root `.md` files, 6,144 lines. They are **not** interchangeable, and three of
them are finished. Read this table before opening any of them.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `UNIFORMIZING.md` | Ledger | ✅ **CLOSED** — zero open items, verdicts only. Do not re-mine it for work. |
| `AUJOURDHUI.md` | Ledger | ✅ **Closed** — no open items (the last, `ARM_MS`, answered 2026-08-28). |
| `REVIEW-PASS.md` | Ledger | 🟡 **31 open** P2/P3 findings across 8 sections. The main written debt pool. |
| `bmad/11-friction-audit.md` | Ledger | ✅ **CLOSED 2026-08-28** — all 5 tier-1 and all 9 tier-2 seams resolved (5 of the 9 were already done and merely unticked). Only tier-3 polish remains. See §4-B. |
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

### The second half of the day — the polish queue and the top-10

Ten more commits, same shape. `bmad/12` is now **empty**: #10 elevation tokens, #11 focus
rings, #8 night contrast, #1 Skeleton, #6 EmptyState doors, #13 PWA theming, #14 the 360px
heading ramp, #16 Ctrl+Z, #17 pull-to-refresh, #18 hold-the-＋-and-speak, #25 note age,
#26 the stale-link toast. Alongside it, six of the ten ranked seams: the list-item peek,
guest-submit idempotency, the mots broom, « À régler » snooze (**migration 0122**), the
a11y nesting fixes, the voice-mot transcript (**0123**), and mid-cook « Il en manque ».

**Four of the ten were already shipped** — the empty « Ce soir » door, the inline supper
quick-add, the NoteEditor keyboard binding, and most of the list row. Verified in code
first, which is the §5 lesson working a second time. See the note now standing at the top
of `bmad/11`'s tier-2 table.

**Three defects were found by re-reading my own work rather than by a red test**, and they
are the useful part of this entry:

- The **undo I offered from cook mode was painted under it** — the scene is z-index 90,
  the undo bar 40. An undo nobody could tap. It became a toggle on the button itself,
  which is both reachable and calmer.
- Its un-flag **destructured `items` from a payload whose key is `low`.** Nothing
  exercised the path, so nothing said so.
- **Pull-to-refresh swallowed a nested scroller's drag**: a capped list (Réglages' review
  queue) stopped moving under the thumb, because the hook only asked whether the PAGE was
  at its top.

And one guard **reported green over the very defect it was written for** (an indentation
walk where a tag-depth walk was needed). Re-checked against the bug, it found a THIRD
nested interactive nobody had reported, in cook mode. A guard that has never been red
proves nothing — that rule earned its keep twice in one day.

---

## 4. What still needs improvement — consolidated and ranked

Deduplicated across every source above. Ranked by **user harm**, not by which document
it happens to live in.

### A. Verified correctness — ✅ DONE 2026-08-27

1. ~~**`/share` loses captures offline.**~~ **Fixed.** The share-target capture now rides
   `useWrite()`, so a capture made with no signal queues and replays instead of being
   thrown away in silence. The photo branch — which needs an R2 key back before it can
   write anything — is now honestly gated on `useOnline()` rather than offering a button
   that can only fail. bmad/11 tier-1 seam #2 is closed; guarded end-to-end by
   `e2e/capture-offline.spec.ts`.
2. ~~**The `useWrite` rule is prose-only.**~~ **It is a test now:**
   `src/lib/write-rule.test.ts` fails the build on ANY raw `api()` write in `src/`
   unless its `file → endpoint` is in that file's `ALLOWED` set **with the reason**.
   Fail-closed, so a brand-new endpoint written through `api()` fails by default.
   Verified to actually go red on a planted violation — a guard that was never red
   proves nothing.
   The scan found **95 write sites across 53 endpoints**, not the ~35 first estimated;
   but most collapse into principled categories (blob uploads that need the key back,
   session/pairing, link minting, AI round trips, multi-step operator merges). The
   genuinely queueable strays were **6 sites in 5 files** and are migrated:
   `cercle/ContactPhotos` (caption + delete), `operator/recipePills`,
   `operator/recipesTags`, `lib/measurePrefs`, `operator/guest`.
   The 66 documented exceptions are grouped by *why* in eleven commented blocks.

   *Left standing, deliberately:* `board/Notes.tsx` and `lib/drawingGallery.ts` already
   carried explicit "stays on api() ON PURPOSE" reasoning — each trailing write is
   atomically coupled to a blob upload that cannot be queued, so routing only the write
   through the outbox would land a row pointing at blobs that were never stored.

### B. The friction pool — ✅ CLOSED 2026-08-28

`bmad/11-friction-audit.md` held 14 ranked seams from five flow audits. **All five
tier-1 and all nine tier-2 entries are now resolved.** The five tier-1 seams closed on
2026-08-27 (with #5 found already fixed); tier 2 closed on 2026-08-28 with #10, and
with **#11 and #12 found already done and never ticked** — five of the nine were in
that state, which is §5-1 in one table.

The last piece was tier-1 #2's remaining half: **/share had no routed label and no
« Corriger »**. The fix was to *delete* the re-implementation rather than copy the
missing parts into it — the page now mounts `<CaptureForm seed=…>`, THE capture spine,
so the routed line, the re-route tiles and the undo cannot drift from the ＋ sheet's
again. That is the same build-beside that cost this path its outbox in the first place,
and it is the clearest argument in the repo for fixing one by removing it.

Two things worth keeping from the work itself:

- **The e2e caught what re-reading did not.** `useAnnounceLeftover()` was dropped where
  the plain function it replaced had lived — below the board's `if (unauth) return` —
  so a hook ran conditionally and the locked kiosk crashed outright ("Rendered more
  hooks than during the previous render"). Typecheck and 1823 unit tests were green.
- **A guard that has never been red proves nothing — a third time.** The /share spec
  passed against the very timed bounce it was written to forbid: it read the routed
  label and clicked « Corriger » inside the old 1 s window. It only became a guard once
  it waited the bounce out. Verified by planting the old behaviour back.

**What remains in that file:** tier-3 polish only (~9 opportunistic items — the
cashier's second check-state, staples chips, no meal-done on the supper hero, the
Jan-1970 cold-grid flash, the abandoned routine stopwatch, « Par allée » hiding the
drag grip).

### C. Section debt — `REVIEW-PASS.md`, 20 findings (swept 2026-08-28)

**It said 31. It was 29 boxes, and eight of those were already fixed and never ticked** —
verified by grepping every open claim against code, which is the sweep this section had
been asking for. What is left has been checked and is genuinely open.

Ticked as already-done in the sweep: the nested interactive on the routine grid and the
`role="img"` world SVG (both 2026-08-27, now guarded); `NoteEditor` not bound above the
keyboard (`.note-editor` is in `core.css`'s « Keyboard fit » list); the parent overview's
missing "done today" (`RoutinesTab` shows it); guest submit idempotency; `MONTH_KEY` missing
from `CAPTURE_KEYS`; the inline `['ghosts']`/`['list-history']` literals; `capitalize` ×3
(one definition left, and `MomentsView` no longer exists).

Fixed in the same pass: **`NoteEditor`'s silent auto-save** — and the defect *under* the
reported one, a `.catch(() => {})` on every branch that swallowed real server rejections, so
a note could close and simply not exist; and **`ItemReorder`**, which duplicated `EditField`'s
reorder buttons down to the class names → one shared `<Reorder>`, in DevKit and `COMPONENTS.md`.

One finding was worse than stale: **"`OperatorJump` is not registered in DevKit" was true and
useless** — the component had been deleted from the tree. Checking a gallery for an absence
proves nothing about the codebase; grep the tree.

Shapes still worth batching:

- **Reuse duplicates** — the "which ingredients?" checklist exists twice (`RecipeListPicker`
  vs `RecipeSheet`'s inline `listPrompt`); three `Member` shapes converge on one face control;
  `ChoreForm`/`BlockForm` hand-roll the same member-toggle row; two `parseBirthday`
  derivations that disagree on the year regex.
- **Silent / inconsistent states** — `MeasureColorsSection` vanishes entirely for a guest
  where every sibling shows a read-only legend; `HeartButton` truncates faces at 4 with no
  "+" signal. *(`ThisWeek` having no error state was itself stale — it renders one at
  `ThisWeekTogetherSection.tsx:137`.)*
- **Remaining e2e gaps** — Le cercle is screenshots-only (zero behavioural coverage for
  Businesses, the carnet scene, group CRUD); the toddler kitchen picker is untested; config
  sub-panels are screenshot-only, so a broken PATCH would pass.

### D. Judgement calls waiting on Marc, not on code

- ~~**`ARM_MS` 6s → 10s** on the toddler tiles.~~ ✅ **answered 2026-08-28: 6 s stands.**
  `AUJOURDHUI.md` now has no open boxes at all. Declined, not deferred — don't
  re-propose without a new observation.
- **Review-queue counts** in intake/postbox section titles — borderline against the
  no-counts tenet; operator-only and passive. Keep, or drop the number.
- **Routines invalidate `BOARD_KEY` but never surface on the board** — either wire a
  morning-routine glance (a possible missing feature) or drop the dead invalidate.
- **Two timers on screen at once** on a timed routine step (the countdown ring *and* the
  run stopwatch) — a design decision.

### E. Tooling gaps found during this cleanup

- ~~**`knip` is not a gate, and currently does not run.**~~ ✅ **wired into CI 2026-08-27**
  (it still crashes locally on this machine — environmental — so the CI run is the one
  that counts), and `ignoreExportsUsedInFile` collapsed 58 findings to 7 real ones.
  The original finding, for the record: it was absent from `.github/workflows/ci.yml`,
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

1. ~~**Decide bmad/11 tier-1.**~~ ✅ **done** — all five closed (2026-08-27/28), and tier 2
   with them. The decision never needed to be a five-seam grouping: taken one at a time,
   verified in code first, five of the fourteen turned out to be already fixed.
2. **Turn the `useWrite` rule into a test** (`write-rule.test.ts` + allowlist), and fix
   `/share` as its first customer.
3. **Adopt one checkbox convention** and put the legend at the top of each ledger; strip
   checkboxes from `PARITY`/`ACTIONS` templates entirely.
4. **Maintain this file, and freeze new audit docs** until the existing pools are decided
   or deleted.
