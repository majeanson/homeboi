# STATE.md — where Babillard is, what's left, and how we've been working

> **What this file is.** The single front door. Nine other root markdown files in this
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
| **Tests** | 1857 unit tests in 143 files · 123 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Households in production** | One (Marc's), plus per-visitor demo sandboxes |

### Health signals, all green as of 2026-08-27

- `npm run typecheck` · `npm test` (1851) · `npm run build` — green.
- `npm run check:bundle` — **3859 KB** of JS across `dist/assets`, **733 KB eager**; every
  chunk within budget; the SW precache covers all offline-needed chunks and correctly
  skips the online-only ones.
- Full local Playwright suite — **1128 passed, 13 skipped**.
- Last four pushes: CI green, deployed. Working tree clean, nothing untracked.
- **Eleven build-gating invariants** (this is the codebase's best feature — see §5):
  `calm-tenets.test.ts` (no streak/points/badge/push table, no inventory column),
  `field-fit.test.ts` + `keyboard-fit.test.ts` (CSS invariants), **`write-rule.test.ts`
  (every `/api/*` write goes through `useWrite`, added 2026-08-27)**,
  `helpRegistry.test.ts` + `discovery.test.ts` (no dead guide deep-links),
  `demoHousehold.test.ts` (a new table must join the sandbox sweep),
  `realtime.test.ts` (`PATH_KEYS` coverage), **`nested-interactive.test.ts` (no control
  inside a control, no `role="img"` on an interactive SVG — added 2026-08-27)**,
  `check-bundle.mjs` (size + precache), and **`ingredient-mirror.test.ts` (the client
  and server copies of `ingredientName` are the same code — added 2026-08-28)**, and
  **the birthday agreement table (`src/lib/cercle.test.ts`, added 2026-08-28 — the client
  and server `parseBirthday` must agree case-for-case)**. `knip` now runs in CI too.

---

## 2. The document map

**Ten** root `.md` files (was thirteen — three finished ledgers moved to
`bmad/history/` on 2026-08-28). They are **not** interchangeable. Read this table
before opening any of them.

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
> a number you can trust — it reads **6** today (4 in `REVIEW-PASS.md`, 2 in `PARITY.md`'s
> Wave D), and that is the whole of the repo's written open work. It was 75 before the
> convention, and 17 the moment the convention landed. Note what `[~]` may NOT be used for:
> a bullet that still lists "Still open: …" is open work, not a park — four were flipped back
> from `[~]` to `[ ]` on the day the convention shipped, for exactly that reason.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `REVIEW-PASS.md` | Ledger | 🟡 **4 open** P2/P3 findings (was "31" → 29 → 20 → 15 as two sweeps grepped every claim against code). **The only substantial written debt pool left.** |
| `bmad/11-friction-audit.md` | Ledger | ✅ **CLOSED 2026-08-28** — tiers 1 and 2 fully resolved; tier 3 swept the same day (five re-checked, four stale). See §4-B. |
| `PARITY.md` | **Playbook** | The feature × dimension matrix + the canonical new-entity checklist. **2 open items** (Part 4 Wave D, opportunistic). Parts 5–6 are a template — copy, don't tick. |
| `ACTIONS.md` | **Playbook** | The action × door matrix. **No open items** — Part 5 is a template. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed-but-unbuilt features (A5–D2), never started. Not a backlog. |
| `bmad/05` + `bmad/06` | ⚪ Idea pools | Brainstorms. Nothing committed. Not a backlog. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `bmad/01`–`10` | History | Brief, PRD, architecture, shipped feature lines. Requirement tags (`NFR-*`, `PRD *`, `OD-*`) resolve here. |
| `bmad/history/` | **Archive** | ✅ Finished ledgers: `UNIFORMIZING.md`, `AUJOURDHUI.md`, `12-ui-polish-queue.md`. Verdicts only. **Do not mine for work.** Tags still resolve by name under `bmad/`. |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

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

Ten more commits, same shape. `bmad/12` is now **empty** (and archived to `bmad/history/`): #10 elevation tokens, #11 focus
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

**What remains in that file:** tier-3 polish only, **swept 2026-08-28 — five re-checked,
four stale**, which is tier 2's ratio again. Verdicts are now inline in the file. The one
real defect the sweep found was not the one it was looking for: the Jan-1970 cold-grid
flash **was** already fixed at the named site (`Kitchen.tsx` holds a Skeleton), but
sweeping the *rule* turned up a fifth `weekStart ?? 0` consumer that wasn't guarded —
`IdeasPage`, where the epoch week became the ideas drawer's "plan it on…" chips, so a tap
on a cold open **wrote a meal dated 1 Jan 1970**. Fixed, with `e2e/cold-week-anchor.spec.ts`.
Still genuinely open: the cashier's second check-state, staples chips, the gather tick's
27px target, whether the supper hero reflects « Marquer mangé » (the action itself exists),
the abandoned routine stopwatch, the empty shell routine's missing cue, and "last week"
review. « Par allée »'s drag grip is a recorded decision, not a gap.

### C. Section debt — `REVIEW-PASS.md`, **4 findings left** (swept twice, 2026-08-28)

> **Second sweep, same day (evening).** 31 → 29 → 20 → 15 → **4**. Marc decided the four
> judgement calls and picked three of four bigger items; everything else was re-verified
> against code and either fixed or given a recorded verdict. Of the claims re-checked in
> this pass, **six were stale or misread**: `HomeProjectForm`'s "bare input" (it uses
> EditField, and says so), `firstLine` "recomputed inline" (it isn't), the settings-nav
> "wrapping OperatorJump row" (that component is deleted), the "stale section ids" (they
> are deliberate alias regressions, labelled as such), `?focus=` as the fix for the focus
> lens (that param is already Réglages' section-landing grammar), and the flash-back's
> location (DayPlanPage was safe; **Réglages** was the exposed one). Two findings were
> *worse* than written: the trip cover could never be set at all, and the undo assertion in
> my own new carnet test was reading a log nothing wrote to.

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

- **Reuse duplicates** — ~~the "which ingredients?" checklist exists twice~~ (✅ 2026-08-28 —
  one `RecipeIngredientPick` body, and the `RecipeListPicker` modal **deleted**: its niche
  was a recipe peek, which `adapters.ts` removes by rule. The **commit** deliberately stays
  with the host, because whether an undo is reachable is a property of the surface); three `Member` shapes converge
  on one face control; `ChoreForm`/`BlockForm` hand-roll the same member-toggle row; ~~two `parseBirthday` derivations that disagree on the year regex~~ (✅ 2026-08-28 — it was
  FOUR spellings; the rule now lives once in `functions/_lib/birthdayRule.ts`, pinned by an
  agreement table in `src/lib/cercle.test.ts`).
- **Silent / inconsistent states** — ✅ **both closed 2026-08-28.**
  `MeasureColorsSection` degrades to a read-only legend instead of vanishing — and the
  finding named the wrong audience: a LINK guest never reached that sub (`kitchen ▸
  apparence` isn't in `GUEST_SUBS`), the one who saw the hole is an operator in **guest
  preview**, where `isGuest()` is true but `isGuestLocked()` isn't. `HeartButton` now shows
  a muted « … » past four faces (never a "+N" — a count is what the calm tenet forbids
  here) and folds « et d'autres » into the `aria-label`. Both in `e2e/readonly-states.spec.ts`,
  each run against its planted bug. *(`ThisWeek` having no error state was itself stale — it
  renders one at `ThisWeekTogetherSection.tsx:137`.)*
- **Remaining e2e gaps** — ~~Le cercle is screenshots-only~~ **stale, and now narrowed**
  (2026-08-28): Businesses + group CRUD were already covered by `cercle-crud.spec.ts`, and
  the **carnet scene**'s R2 + undo seams are covered now — `carnet-scene.spec.ts` 5 → 13
  cases (care-log add/edit/delete, pin delete, both halves of `useDeferredRemoval`, the
  mid-undo resurrection race, the removal-scope split, and `CarnetDocs`' PDF/photo tiles),
  each verified against a planted bug. Genuinely left: the ＋ chooser, drag-to-group + undo,
  ReviewChecklist apply, .vcf import, note autosave round-trip; the toddler kitchen picker
  and `CircleKidView`; config sub-panels are screenshot-only, so a broken PATCH would pass.

### C-bis. Reported from the device, 2026-08-28 — all four fixed

Four reports from Marc's phone. The first three were **pre-existing** (the deploy stamp in the second
predates that day's work) and none was in any ledger; the fourth was a regression from fixing
the second. All four are P1 in `REVIEW-PASS.md`.

1. **The tab bar and ＋ FAB vanished with no keyboard on screen.** `?kbdebug` read
   `kbInset=318 open=true … ae=BODY` — a 318px "keyboard" with nothing focused. The app
   inferred the keyboard from the visual-viewport SHRINK alone, and iOS shrinks that
   viewport for the screenshot preview, the app switcher, Control Centre and share sheets.
   The `document.hidden` guard written for exactly this **does not fire for a screenshot
   preview**; every healer needs an event, and the 1 s watchdog only re-READS, so it never
   recovered. Now: *a keyboard cannot be up if nothing that could summon one holds focus*,
   checked on both edges.
2. **Offline, the Mois grid said the same thing three times**, and one of them was a lie —
   the calm stale line, plus two identical red « Le réseau n'a pas répondu · Réessayer »
   blocks, one carrying a retry button with no network to retry with. `LoadError` is
   offline-aware now (no alarm tone, no dead button — the weather is not a surprise) and
   `onRetry` is optional, so a screen gets ONE retry door while both blank regions still
   explain themselves.

3. **The board cried « Hors ligne » over data one minute old**, and neither a reload nor
   a pull-to-refresh cleared it. The condition was "the board poll failed twice" —
   nothing about age — and a phone banks pairs of misses constantly (iOS aborts
   in-flight fetches when the web view suspends), while a reload and a refresh each bank
   their own. The AGE is load-bearing now, on the same yardstick the OfflineBanner was
   already using. Pure `isBoardStale`, six boundary tests, run against the bug.

4. **« Du calendrier annuel vers un mois, rien ne charge »** — and this one was MINE, from
   fix #2 the same day. Removing the retry button while offline looked principled (it
   "cannot work with no network") and was wrong: a person taps it when they think the
   signal is back, and the month view NEVER retries itself (`MONTH_KEY` has no `live`; the
   client sets `refetchOnWindowFocus: false`). The quiet tone stays; the door comes back.

**How it got out, which matters more than the bug:** a local e2e run printed « flaky » and
still exited 0, so a genuinely broken change read as green here and CI failed it
deterministically. The flaky test's NAME was printed the first time and I skipped over it.
`failOnFlakyTests: true` now fails the local run, and `npm run e2e:ci` mirrors CI exactly
(`--workers=1 --retries=0 --forbid-only`) — run that, not `npm run e2e`, before pushing
anything touching shared machinery. Recorded in `CLAUDE.md`, verified by planting a
deliberate flake and watching the run exit 1.

**The lesson worth keeping:** the first two were not reachable from the desk at all. The first needs a real
iOS system overlay; the second's exact state (offline AND errored) is **unreachable
through a real query in the harness at all**, because going offline makes TanStack pause
the query before it can error. A screenshot from the actual phone found both in one
morning. When Marc reports a state, reproduce it from the pixels, not from the model of
how it should be reachable.

### D. Judgement calls waiting on Marc, not on code

- ~~**`ARM_MS` 6s → 10s** on the toddler tiles.~~ ✅ **answered 2026-08-28: 6 s stands.**
  `bmad/history/AUJOURDHUI.md` now has no open boxes at all. Declined, not deferred — don't
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
