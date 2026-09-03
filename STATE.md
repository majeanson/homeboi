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
| **Tests** | 1857 unit tests in 143 files · 125 Playwright spec files |
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
> a number you can trust — it reads **3** today (1 in `REVIEW-PASS.md`, 2 in `PARITY.md`'s
> Wave D), and that is the whole of the repo's written open work. It was 75 before the
> convention, and 17 the moment the convention landed. Note what `[~]` may NOT be used for:
> a bullet that still lists "Still open: …" is open work, not a park — four were flipped back
> from `[~]` to `[ ]` on the day the convention shipped, for exactly that reason.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `REVIEW-PASS.md` | Ledger | 🟡 **1 open** P2/P3 findings (was "31" → 29 → 20 → 15 as two sweeps grepped every claim against code). **The only substantial written debt pool left.** |
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

### C. Section debt — `REVIEW-PASS.md`, **1 finding left** (swept three times, 2026-08-28)

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

### C-ter. The third sweep — the ledger is effectively empty (2026-08-28, evening)

`REVIEW-PASS.md` went 31 → 29 → 20 → 15 → 4 → **1**. The last pass settled the residual
nit bullets, and the ratio held to the end: of the sub-claims re-checked, **five more were
stale or misread** — `firstLine` recomputed inline (it is not), the NoteEditor body
mislabelled in edit mode (it is not; the cited line no longer exists), `HomeProjectForm`
on a bare `<input>` (it uses `EditField`, and says so), the settings-nav's second
`OperatorJump` row (that component is deleted), and the "stale section ids" (deliberate
alias regressions, labelled as such in the file).

**Three were settled by MEASUREMENT rather than by reading code**, which is the habit
worth keeping from this pass:

- the bmad/11 "gather tick ~27px" measures **46px** (the floor is 44) — now guarded
  against `--touch-target` read from the live stylesheet, not a hard-coded number;
- `.cf__addr-row` "packs tight at 320px" — it wraps to two lines and ends at x=304 inside
  a 320px viewport. Tight is a fair description; it is not a defect. Left alone;
- the 7-up re-file grid at 320px — measured with `worstRightBleed` (the card does not clip,
  so `assertClean`'s precondition does not apply) and guarded against a planted bleed.

Two real fixes came out of it: **`ContactForm`'s avatar rides `useMediaUpload()`** (the last
hand-rolled resize→POST→key, and `write-rule.test.ts` caught its allowlist entry going stale
the moment the raw `api()` left), and **a pet weight re-entered on the same date now
CORRECTS the reading instead of appending a duplicate** — two rows for one day corrupts the
trend the log exists to show, and re-entering the date is also the edit door a weight row
never had.

And one guard now holds a TENET rather than coverage: **`ThisWeek` asserts
faces-not-counts**. The section widens the chore ledger to the whole household and inherits
its hard rule — say WHO, never HOW MANY — which the file stated and nothing enforced. The
assertion is that no digit appears in the block at all.

**What is left is one honest coverage backlog** (device-revoke / member-rename round-trips,
untested config sub-panels, photo upload+delete+undo only smoke-rendered) plus PARITY's two
Wave-D items — and Wave D itself was halved on inspection: only `recipes.steps_images_json`
and the routine cards are genuinely positional parallel arrays, while `care_log.media_json`
(a multi-document LIST) and `members.avatar_ref` (a polymorphic colour-or-key pair) are
correct as they stand.
### C-quater. Reported from the device, 2026-09-02 — deleted list items resurrecting, calendars dead until hard refresh

Two reports from Marc, both chased to mechanisms rather than symptoms.

1. **« I delete items in La liste and they come back. »** No soft delete exists — every
   "return" is a delete that never reached the server, or a fresh INSERT. Three real
   mechanisms found, all fixed:
   - **The tmp-id delete black hole (the big one).** Swipe-delete a row whose optimistic
     create hadn't reconciled → the deferred delete fired 15 s later with `{id: 'tmp-…'}`
     → `DELETE /api/list` matched zero rows, answered 200, and the real row lived forever.
     Fix: a session tmp→real registry (`src/lib/tmpIds.ts`) fed by `undoCreate` (online)
     and the outbox replay; `writeWith` resolves path+body through it at fire time, and
     the deferred-removal store hides BOTH spellings so the row can't visibly come back
     mid-undo. The outbox's E-41 rewrite still owns the queued-before-replay case.
   - **Held deletes silently lost on teardown.** The ToastProvider's only safety net was a
     React unmount effect, which never runs on reload/tab close/PWA kill/SW-update reload —
     the row was hidden client-side only and the next load showed it again. Now every held
     write commits on `pagehide` + `visibilitychange→hidden` (while hidden the user can't
     see « Annuler » anyway), and `api()` sends hidden-state writes with `keepalive` so
     teardown doesn't abort the fetch.
   - **« Meilleurs prix » resurrected mid-delete rows in batch.** `autoPick` walked the raw
     board frame; a held row can't match in `lib/picks` (which rightly excludes held ids),
     so `stageDeal` fell through to `addLine` — INSERTING a fresh line with the deleted
     item's text. AddSheet now filters through `removal.visible` like every list surface.
2. **« The monthly/yearly calendar can't load until a hard refresh. »** Both views are in
   the EAGER chunk — not the stale-chunk theory. The wedge is the data layer: no poll
   (D-18), `refetchOnWindowFocus: false`, retries spent → a failed fetch never retried.
   `MonthView` had the manual « Réessayer » (ddf0a4e); **`YearView` had no error state at
   all** — twelve blank mini-months plus a lying « rien cette année », forever. Fixes:
   `YearView` wears the same `LoadError` face, and both (+ the car query) ride
   `healOnError` (`lib/query.ts`): refetch on focus + a quiet 60 s retry **only while
   errored** — never a poll on success. E2E planted-bug-verified (`year-to-month.spec.ts`).
   Related latent bug closed while in there: a deploy deletes old lazy chunks, `React.lazy`
   memoises the rejection, and ~55 routes could go dead until a hand refresh — `main.tsx`
   now reloads once (loop-guarded) on `vite:preloadError`.

3. **« The hovering quick-add button doesn't add any item at all. »** Three add doors,
   only Liste's own bar had an optimistic row — so on the ＋ sheet's « Ajouter à la
   liste » and the ⚡ « Ajout rapide » chips, an offline/queued write painted NOTHING
   (the sheet closed; the chip locked ✓ and « Ajouté N » ticked up off LOCAL state) and a
   server rejection on the ⚡ page was 100 % swallowed (`.catch(() => {})` — the only
   write site in the app with no error path). Fixes: the optimistic splice is now ONE
   shared helper (`lib/listAdd.ts` `spliceListLine`, + `mintTmpId` in `lib/tmpIds`) used
   by all three doors, and a rejected ⚡ add un-locks its chip + says `saveFailed` once.
   Still open (judgement call, §D): the BOARD ＋ files typed text as a fridge NOTE — it
   has no list door and no AI routing since the capture spine moved to the header mic —
   so a grocery item typed there lands on the board as a note with zero feedback. If
   that's the button Marc meant, the mechanics above don't cover it; adding a
   « liste » tile to the board ＋ is a product decision, not a bug fix.

### C-septies. Asked by Marc, 2026-09-02 (evening) — the day scene's shape, and the meal peek restored

Four asks, all shipped together:

1. **The sub-tab row is now the FIRST thing in the day scene's body**, and the **weather
   strip + the day-note headline moved INSIDE « Journée »**. They were above the tabs as
   "the day's identity, not a face" — but they are context for the AGENDA, not for the
   meal planner, and sitting above the picker they pushed the face choice down the screen.
2. **Every tapped meal opens the peek again** — `useOpenMeal`'s split is REVERSED. A meal
   that resolved a recipe used to navigate straight to `/kitchen/recipe/:id` under "tap
   the thing, get the thing"; only a free-text meal peeked. That split cost the thing a
   plan is FOR: the recipe view knows nothing about the day, so from a planned supper
   there was **no door back to the day**. The peek is the only surface holding both
   halves, so `buildMeal` now carries « Voir la journée » + « Ouvrir la recette » + a
   primary « Cuisiner », with restants/retirer folded into the ⋯ (five visible buttons
   would bury the three you came for). This is NOT the menu-peek the codebase deletes
   elsewhere — it carries the PLAN (day, slot, cook), which neither page shows.
   - **Accepted, budgeted regression, Marc's explicit call when asked:** cooking tonight
     from the board's « Ce soir » hero is **2 taps, not 1**. `tap-budget.spec.ts` is
     re-pinned 1 → 2 *with the reason written into it*: if it must be 1 again, the fix is
     a surface-scoped `useOpenMeal`, never deleting the day door. ACTIONS.md footnote ¹⁰.
3. **« Vider la journée » → « Vider les repas »**, key `clearDay` → `clearDayMeals`. It
   lives on the « Repas » face only since the scene split, so the old label over-promised
   (it never touched rendez-vous, corvées or the note).
4. Guards: `interactions.spec.ts` « a recipe-linked meal peeks too, carrying the day door
   AND the recipe doors » (new), the recipe-less case kept beside it, and the re-pinned
   tap budget.

### C-sexies. STILL reported after C-quater, 2026-09-02 — and what production actually said

Marc re-reported both bugs the same afternoon, with screenshots (« they always come
back », « the calendar bug is still there »). C-quater's mechanisms were real and are
still right — they were just not the whole story. **This round was diagnosed against
PRODUCTION, not by reading**, and the evidence reversed the assumption underneath it:

- **The deletes were NOT lost.** Six list rows (« 1 », « 2 », « 3 », « 4 », « Qw »)
  were swipe-deleted and still on screen 26–31 s later. Queried prod D1 directly
  (`wrangler d1 execute babillard --remote`): **none of them exist.** Every DELETE
  had landed. The rows on screen were a CLIENT hallucination, not a failed write.
- **The server is not the calendar's problem either.** Prod holds 43 events (0 recurring),
  120 meals, 15 tasks, 32 todos — nothing that strains `/api/month`'s 17-query batch.
  All 123 migrations are applied. `wrangler tail` showed `outcome: ok`, no exceptions.
- So BOTH symptoms share ONE root cause: **that device's reads were failing.** La liste
  rendered its last good (pre-delete) frame; the month view, having never loaded one at
  all, showed the honest error face — which is C-quater's fix *working*, not failing.

**The defect that fix exposed, now closed: a CONFIRMED delete could be resurrected by a
stale frame.** `unhideWhenFresh` carried a 90 s cap that un-hid the pending ids
*regardless* of whether a fresh frame ever arrived — justified as "a row must never be
hidden forever". On a device whose reads were failing, that cap is precisely what
repainted six rows the server had already deleted. Fixed:

- **No cap on the confirmed path.** We wait for a genuinely fresh frame however long it
  takes. Nothing hides "forever": the pending set is session-only module state (a reload
  clears it) and the row is gone server-side, so the next successful frame simply lacks it.
- **`remove` now OBSERVES its held write.** The call sites swallowed it
  (`write(...).catch(() => {})`), so the hook could not tell "deleted, but the refetch
  failed" (keep hiding) from "the delete failed" (show it again) — and defaulted to the
  resurrecting choice. `Liste.tsx`'s `deleteItem`/`clearChecked` no longer swallow; a
  write that genuinely FAILS un-hides at once, because then the row really is still there.
- Guard: `useDeferredRemoval.test.ts` § "deferred-removal freshness fence", **verified
  red** by re-planting the 90 s cap.

**Also found and fixed: every `/api/*` JSON response shipped with NO cache directive.**
Verified against production (`curl -D -` on `/api/board`: `content-type` and nothing
else). Per-household data behind a session cookie, freshness left to browser/intermediary
heuristics and iOS's bfcache — on a surface whose whole correctness story is "the poll
reconciles", a cached frame is a frame that can show a row the household already deleted.
`_lib/json.ts` now sets `cache-control: no-store`. Image bytes are untouched:
`/api/img/*` and `/api/flyer-img` build their own Response with
`public, max-age=31536000, immutable`.

**Still not explained, and deliberately not guessed at:** *why* that phone's requests
failed. The Worker was healthy throughout, the SW passes `/api/*` straight through
(verified in `vite.config.ts`'s fetch handler), and the same account was served fine on
desktop in the same minutes. The self-heal (refocus + 60 s retry while errored +
« Réessayer ») is in place and is the intended recovery. If it recurs on a healthy
connection, the next step is a device-side capture, not another code guess.

### C-septies. Reported STILL happening, 2026-09-03 — two more gaps under C-quater/C-sexies' own umbrella

Marc reported both symptoms again: swiped list rows "sometimes" still come back, and
"offline app should always be able to start." Neither is C-sexies' 90 s-cap bug (already
closed) — both are separate gaps under the same two headings, found by reading the code
(not by re-trusting the ledger — this file's own rule).

- **The resurrection: `[].every(...)` is vacuously `true`.** `unhideWhenFresh`
  (`src/lib/useDeferredRemoval.ts`) only ever checked `cache.findAll({queryKey:[scope],
  type:'active'}).every(q => q.state.dataUpdatedAt >= t0)`. If the undo timer fires while
  **nothing is actively watching that scope** — swipe-delete on `/liste`, then navigate to
  a tab that doesn't query board data before the 15 s hold elapses — `findAll` returns
  `[]`, and an empty array's `.every()` is vacuously true. The id un-hid on the spot with
  no fresh frame ever confirmed, leaving the stale pre-delete cache untouched; the next
  time a query for that scope mounted (navigating back), Query painted that stale frame
  first and the "deleted" row flashed back until its own fetch resolved. Fixed:
  `fresh()` now requires `queries.length > 0` — an empty match reads as "not fresh yet",
  not "fresh," so it falls through to the existing subscribe-and-wait path instead of
  un-hiding blind. Guard: new case in `useDeferredRemoval.test.ts` § "deferred-removal
  freshness fence" — **verified red** against the un-fixed code (`queries.length > 0 &&`
  removed) before landing the fix.
- **Offline cold start: a FREQUENT user, offline in a store (weak/stalled signal, not
  clean airplane-mode), saw only a loading spinner — never the board.** Marc's own
  follow-up correction: this isn't a fresh-visitor routing gap, it's a genuine HANG.
  `src/lib/api.ts`'s `fetch` carried no timeout at all — a stalled connection (captive
  portal, a wifi AP fading in a store, any "packets silently dropped, no TCP RST" black
  hole) leaves that promise unresolved forever, not rejected. `AuthProvider.refresh()`
  (`src/lib/auth.tsx`) `await`s it inside `try/finally`, so `loading` never flips false
  if it hangs; the router's `/` entry (`Entry()` in `router.tsx`) renders only
  `<Loading/>` while `loading` is true, with nothing else to force an exit. Two fixes,
  complementary rather than either alone being enough:
  - **`api()` now bounds every request** with an `AbortController` timeout — 20 s for a
    plain call (matches `lib/online.ts`'s own `SUPPRESS_WINDOW_MS`, so a timeout and
    "this looks offline" agree), 60 s for a Blob body (photo/audio/drawing upload,
    legitimately slower and more likely attempted on a weak signal in the first place).
    A timeout rejects with a plain `DOMException`, not an `ApiError`, so `writeWith`
    still classifies it as a transport failure and queues it to the offline outbox —
    the existing contract is unchanged, just now actually reachable. Guard:
    `api.test.ts` § "api() timeout on a stalled connection" — **verified red** by
    reverting the timeout (the mock fetch throws synchronously on the now-missing
    `signal`, proving the test is coupled to the fix, not just decorative).
  - **A returning device also stops waiting on that round trip at all.** A persisted
    `wasSignedIn()` flag (`localStorage`, mirrors `device.ts`'s device-token pattern for
    kiosk) is set on every server-CONFIRMED `auth/me` answer (true or false) and cleared
    on explicit sign-out — never touched on a network failure/timeout, so it survives
    exactly this case. `Entry()` now checks `chosen || isPaired() || wasSignedIn()`
    before ever looking at `loading`, so a known device skips the round trip (and its
    now-20s-bounded wait) entirely and lands straight on `/board` with cached data. This
    is the faster path for a *frequent* user specifically; the `api()` timeout is what
    protects everyone else (first cold visit, a cleared profile, any OTHER query in the
    app that could otherwise hang the same way once past Entry()).
- Both are read-only-mode gaps: correct app state existed (cache, session) but the UI
  didn't trust it. Neither had a prior guard exercising the "nothing is watching" /
  "the network call itself fails" branch — every existing test kept at least one
  active observer, or mocked a real 401 rather than a transport failure.

**A `/code-review high` pass on the diff above (Marc's explicit ask — "make sure
those bugs won't come back") found seven real issues the first pass missed**, all
fixed in the same slice, each with its own regression test verified red first:

- **The timeout only covered the CONNECTION, not the body.** `fetch()` resolves as
  soon as headers arrive; a proxy/captive-portal that answers the handshake and
  then stalls MID-BODY would still hang, one phase later — reproducing the exact
  bug the timeout exists to fix. Fixed: the same timer/signal now also covers
  `res.text()`.
- **The 20 s default was too short for several legitimately-slow AI-backed
  endpoints** (`recipe-import` — which chains its own 20 s server-side scrape fetch
  before structuring, `ask`, `deals`'s multi-term Flipp walk, `capture`'s inline AI
  classification): a slow-but-working call would now abort instead of finishing,
  and for `capture` specifically that meant a genuinely-online write got silently
  queued to the offline outbox. Fixed: `api()`/`WriteSpec` grew a `timeoutMs`
  override, wired at each of those call sites (30–45 s).
- **A `keepalive` request (the undo toast's pagehide flush) got the SAME 20 s
  bound** — defeating the point of `keepalive`, which exists specifically to
  outlive teardown. Fixed: a keepalive request gets no `AbortSignal` at all.
- **`wasSignedIn` would also fast-path a demo SANDBOX visitor** straight past
  `Entry()`'s marketing/login fallback once their throwaway household is swept —
  landing them on a dead board instead. Fixed: never persisted true for
  `isSandboxEmail`.
- **Two overlapping `refresh()` calls (mount + an `onAuthLost` re-check) could
  resolve out of order**, letting a slower/stale answer overwrite a fresher one —
  including `wasSignedIn`. Fixed: a sequence-number guard drops any response
  superseded by a newer request.
- **The vacuous-truth fix's fallback (`cache.subscribe`) had no upper bound** — a
  scope nobody ever revisits for the rest of a (potentially weeks-long, always-on
  kiosk) session leaked one permanent cache listener per orphaned delete. Fixed: a
  10-minute give-up that stops WATCHING (never un-hides on its own — that's the
  90 s-cap bug already fixed once above) if no fresh frame ever arrives.
- **`wasSignedIn`/`rememberSignedIn` hand-rolled the exact localStorage
  get/set/try-catch shape `createDeviceStore` exists to collapse** (CLAUDE.md's
  "build by reuse" rule). Fixed: rebuilt on that primitive.

### C-quinquies. Asked by Marc, 2026-09-02 — the day scene split into « Journée | Repas »

Shipped inside `d7710d5` (three parallel sessions, one commit — this slice was the
day-scene one; the message describes the liste/calendrier and deals slices). What changed:

- **`/kitchen/day/:date` has two faces behind a `?vue=` SubTabs row** (the Voyage
  pattern): « Journée » (default — rendez-vous, corvées, projets, à compléter, the
  Avant-de-partir door) and « Repas » (the full DayEditor). The weather strip and the
  day-note headline stay shared above the tabs.
- **The door decides the landing.** Meal doors → `?vue=repas`: the kitchen grid's
  pencil, the ＋ « Planifier un repas » day picker, the history pencil, a meal search
  hit, the calendar day-⋯ « Planifier un repas ». Day doors → default « Journée »:
  « Voir la journée » (calendar + event/meal peeks), « Planifier aujourd'hui/demain »,
  the SimpleBoard tile.
- **The kitchen day peek carries doors now** — `buildDay`'s zero-actions verdict was
  REVERSED (ACTIONS.md ⁹): « Voir la journée » + primary « Planifier un repas », both
  plain navigations so they survive a read-only guest.
- Guards updated: `day-plan-lean.spec.ts` (faces + guest on both), `kitchen-meal-plan`
  (locks the `?vue=repas` landing), state-matrix `day-plan` budget 178 → 228 (the one
  deliberate chrome addition: the sub-tab row).
- `t.kitchen.mealsHeading` removed (the « Repas » pill names the face; a heading
  repeating the tab is a LEAN smell).

**Follow-up, same day (Marc, on review): the peek's MEALS became doors too.** The day
peek listed its meals as plain text; a meal that resolves a recipe now carries the small
📖 / 🍲 « Cuisiner » pair `MealRows` already gives a planner row — 📖 → the recipe view,
🍲 → straight into cook mode. Per MEAL deliberately: one full-width « Cuisiner » on a day
holding N meals could not say which one it meant. Mechanics:

- The `list` DetailBlock was EXTENDED, not forked: an item is now `string | DetailListRow`
  (`{ text, actions?: DetailAction[] }`), rows reusing the footer's `DetailAction` so they
  close the peek then navigate through the same `runAction` — no second action grammar.
  A plain string still renders exactly as before, so no other adapter moved.
- Both call sites pass `recipeId`: the kitchen week grid (already holds `recipeForMeal`)
  and Historique, which has no recipes of its own and uses `useRecipeForMeal()` with no
  argument — the shared-cache mode that hook was built for.
- A free-text meal (« Salade César ») keeps no buttons: there is nothing to cook. The
  window-level « Voir la journée » / « Planifier un repas » doors are unchanged.
- Both doors are plain navigations (reads), so a read-only guest keeps them; they are
  real `<button>`s, so the non-touch verdict stays ✅.
- Guard: `e2e/kitchen-meal-plan.spec.ts` « day peek — a recipe-linked meal carries 📖 +
  « Cuisiner »… », **verified red** against a planted text-only regression before being
  trusted (the standing rule). ACTIONS.md row + footnote ⁹ updated.

### C-octies. Self-directed sweep, 2026-09-03 — settings write coverage + the parallel-array guard

Picked from this file's own §4/§D backlog (Marc: "do 1, 3, 4 in order, ask about 2").
Each item verified against code first, per the standing rule — one candidate ("`ChoreForm`/
`BlockForm` hand-roll the same member-toggle row") turned out already stale (`ChoreForm`
already goes through the shared face control; `BlockForm` doesn't exist) and was dropped
without doing the work.

**1. Nine new settings-write tests, six previously-silent subs (`0c047b6`).** Measured
before writing anything: 24 subs in `SETTINGS_SUBS`, 17 operator panels that write, and
only a handful had ever asserted a real request. `stores`, `aisles`, `todos` (templates),
`routines` (the ToD chip), `members`, and `tablets` now do — each proven red against a
planted bug (wrong field name, dropped id, missing colour) before being trusted. See
`e2e/config-panels.spec.ts`'s header for why this class of panel fails silently: every
control here commits optimistically, so a broken PATCH looks identical to a working one
on screen.

**3. The parallel-array write path is now structurally guarded.** PARITY's Wave D called
`recipes.steps_images_json` / the routine-card side arrays unconverged; re-checked, the
sync ops already lived in one place (`lib/parallelArray.ts`, unit-tested) since migration
0041 — ten weeks before that note was written. What was actually missing was enforcement
that a writer USES it: three call sites (`RecipeForm`'s import-replace reset, `RoutineForm`'s
template-apply reset ×2) had quietly re-implemented `alignSide` by hand as
`rows.map(() => '')`. Converged onto the shared helper, plus a new build-gating test,
`src/lib/parallel-array-rule.test.ts` (sibling of `write-rule.test.ts`), that fails the
build if a side-array setter is ever fed a hand-built array again, or a new positional
side array is added without registering it. Verified red against both plants. PARITY's
Wave D entry updated in place — the schema stays positional on purpose (never a
churn-only migration wave), but the fragility it named is now contained.

**Hardened same day, from a `/code-review` pass on the session's own commits.** The
guard's first cut had two real enforcement gaps, both since fixed and each re-verified
red against a fresh plant: (1) its OPS check was a substring test over the whole args
text, so a top-level ternary could hide a hand-rolled array behind a real op mentioned
in the OTHER branch — closed with a dedicated `HAND_ROLLED` pattern that flags
`rows.map(() => '')`-shaped code unconditionally, wherever it sits in the expression,
rather than trying to anchor the whole-expression check (tried and reverted — it broke
every real call site, all of which use the `setX((prev) => opCall(...))` functional-
updater form). (2) the bare-`[]` exemption ran BEFORE the `ALLOWED` lookup, making the
two documented `ALLOWED` entries dead code and silently exempting any future `setX([])`
anywhere with no reasoning required — folded into the same ALLOWED gate instead, so an
un-listed `[]` is now a violation like anything else. Also fixed in the same pass: the
tree-walk was reading all of `src/` twice per run (once per `it()`); now read once and
shared. `sources()`/`blankComments()` were also a byte-for-byte third copy of
`write-rule.test.ts`'s — extracted to `src/lib/buildGuardScan.ts` and both files
converged onto it (safe because the two were identical; `nested-interactive.test.ts`'s
variant genuinely differs — different extensions scanned, different comment logic — so
it was deliberately left alone rather than risking an already-trusted guard for
cosmetic reuse). `blankComments` itself also gained real block-comment stripping,
string-aware this time — the naive version briefly regressed `write-rule.test.ts`
(`IntakeForm.tsx`'s `accept="image/*"` looked like a comment opener and swallowed a
real `api()` write between it and the next JSX comment), caught immediately by that
file's own "every exception still exists" self-check before it ever reached a commit.

**4. Tooling hygiene — mostly already done, one real fix.** §E's "configure away
knip's noise" turned out stale: `ignoreExportsUsedInFile` was already set the same day
that bullet was written (`421aa91`, 2026-08-27) — nothing to configure. Confirmed local
knip still can't run to re-verify the live count (same environmental `oxc-parser`
crash); CI's is the run that counts, unchanged. The stray `.code-workspace` stub was
real: moved from `src/pages/` to the repo root rather than deleted — its `path` pointed
back at the repo root, reading as Marc's live workspace shortcut, and deleting an
untracked file outside git's safety net on a guess would have been the wrong kind of
clean-up for something this small.

**The §D judgement calls, asked and answered the same session** — see below, each now
struck through with its verdict.

~~**Found in passing, not yet acted on:** `AisleOrderSection`'s reorder is drag-only —
`DragPill` has no button/keyboard mirror, which the desktop-reachability rule (this file's
own standing rule) forbids.~~ ✅ **Done same day — and it was systemic, not a one-off.**
A follow-up `/code-review` + UI/UX audit (below) found the same gap at **all 8** of
`DragPill`'s call sites, one of them `boardLayout.tsx` — the panel CLAUDE.md itself
documents as the board's "ACCESSIBLE MIRROR", drag-only despite the name. Fixed once in
the shared component (an `onMove?: (dir) => void` prop makes the grip a real Tab stop
with ↑/↓, copying the pattern `pages/Liste.tsx` had already hand-rolled outside the
shared component instead of in it) and wired at all 8 sites + the DevKit gallery.
`e2e/board-customize.spec.ts` gained a test, verified red against a planted regression
(the tabIndex removed) before being trusted. `components/board/CardSlot.tsx` (the live
2D board grid) was NOT touched — it hand-rolls its own grip rather than importing
`DragPill`, and its documented keyboard door is `boardLayout.tsx` itself, not a direct
one on the grid (arrow-key semantics across a 2-zone masonry layout have no obvious
meaning, so guessing one wasn't in scope for "apply the existing fix"). The
`<Reorder>`-primitive angle in the original finding turned out to be a red herring —
`Reorder` is `EditField`'s own up/down button pair for a plain list, a different
shape from a shared drag grip; `DragPill` gaining `onMove` is the actual fix.

### C-nonies. Self-directed review + audit, 2026-09-03 (continued) — reviewing today's
own work, then a fresh UI/UX pass with no new features

Asked by Marc after the four commits above shipped: "review our work then look for more
improvements on ui/ux — no new features, only improvements or uniformity." Two tracks,
run in parallel as background agents.

**`/code-review` on the session's own four commits (`66fb663..1a1fb09`).** Production
code (the stopwatch removal, the `alignSide` convergence) came back clean. The new guard
test itself, `parallel-array-rule.test.ts`, had two real enforcement gaps: its OPS check
was a substring scan over the whole args text, so a top-level ternary could hide a
hand-rolled array behind a real op mentioned in the OTHER branch; and the bare-`[]`
exemption ran BEFORE the `ALLOWED` lookup, making the two documented entries dead code
and silently exempting any future `setX([])` with no reasoning required. Both fixed —
see the guard-hardening commit (`5f1bc56`) for the detail, including a real bug caught
mid-fix (a naive block-comment strip briefly broke `write-rule.test.ts` on
`IntakeForm.tsx`'s `accept="image/*"`, caught by that file's own self-check before it
reached a commit). Also converged `sources()`/`blankComments()` — a third identical copy
of `write-rule.test.ts`'s — into `src/lib/buildGuardScan.ts`.

**A fresh UI/UX uniformity audit** (explicitly no new features — reuse gaps and
inconsistencies only), re-verified against code rather than read off the docs:

1. **`DragPill` had no keyboard mirror at any of its 8 sites** — see above, done.
2. ~~`Chip` not adopted at its last two stragglers.~~ ✅ **done.** `recipesTags.tsx`'s
   tag-name label and `recipePills.tsx`'s pill-name label + its tag-pick multi-select
   toggle converged onto `<Chip>`; zero hand-rolled `.chip` spans left in either file.
   COMPONENTS.md's uniformization row 2 updated in place.
3. ~~`VoiceButton.tsx` hand-rolls error text instead of `StatusMessage`.~~ ✅ **done —
   and a 4th site turned up while there.** `operator/micTest.tsx` hand-rolled the exact
   same `list-add__voicemsg` class for its own listening line, missed by the original
   audit (it only grepped `VoiceButton.tsx`). All four converged onto `StatusMessage`
   (`tone="error"`/`"info"`); the dead `.list-add__voicemsg`/`--err` CSS removed from
   `list-actions.css`. One deliberate behaviour change, not a bug: the two denied/error
   lines move from `role="status"` (polite) to `StatusMessage`'s `tone="error"` →
   `role="alert"` (assertive) — matching how every other error line in the app already
   announces, which is the whole point of converging onto one primitive. No existing
   unit or e2e coverage existed for `VoiceStatus` to begin with (checked, none found);
   none added — the swap is markup-only, same conditions, same text, and a Web
   Speech-mocking harness from scratch is out of scope for a uniformity fix. COMPONENTS.md
   rows 2 (VoiceButton entry) and 6 updated in place.

Checked and confirmed already clean (worth recording so it isn't re-investigated):
`RowActions` adoption, `EmptyState` usage, `useConfirm` usage (no bare `window.confirm`
anywhere), hand-rolled flex rows outside `Cluster`/`Rail` (only hits were in DevKit, not
user-facing), and PARITY's full Part-4 ranked backlog (all resolved, including Wave D
above).

### C-decies. Asked by Marc, 2026-09-03 (evening) — "I press buttons but what I see is
not what I thought it would do"

A different lens from C-octies/C-nonies' code-reuse audits: this one hunts USER-FACING
predictability — does a button's icon/label correctly promise what happens on tap?
Calibration was C-septies' own "Vider la journée" fix from earlier the same day (a
label that over-promised scope). A fresh audit found the icon-side twin of that bug:

**`arrow-counter-clockwise-bold` carried 7 unrelated meanings across ~13 real buttons**
(32 raw uses total, but ~13 of those are a recurring "leftovers/restants" CONTENT tag,
not a button — correctly left alone). A user who learns "counter-clockwise arrow = undo
one small thing" from `DrawPad` had no visual reason to expect the same glyph on the
aisle-order screen to discard their whole custom order — with no confirm behind it
either. Verified against live code (not just the audit's word) before touching
anything; one correction found in the process: `boardLayout.tsx`'s reset button doesn't
actually use this icon at all — it had NO icon, text-only, so the audit overcounted it.

Fixed by splitting the meanings, not by picking one winner:

- **Kept** `arrow-counter-clockwise-bold` for its one canonical meaning — undo one
  action (`DrawPad`). Everything else moved OFF it.
- **Reused two already-distinct existing icons**, no new assets: `play-bold` for
  "replay from the start" (`RoutinePlayer`'s « Recommencer » — restarting a routine
  IS playing it again, a better semantic fit than a rotation icon); `crosshair-bold`
  for "reset zoom to center" (`PanZoom`).
- **Added 4 new icons** to `pipIcons.ts` (real Phosphor bold SVGs, fetched via curl
  from `unpkg.com/@phosphor-icons/core@2` per the file's own documented process —
  never hand-typed path data, and each rendered as a standalone SVG + screenshotted
  before trusting it, since a garbled path fails silently as a blank glyph):
  `arrow-clockwise-bold` (retry/reload — `DealsBrowser` ×2, `PriceMatchPage`),
  `eye-bold` (show-again — `CashierMode`'s « Tout réafficher », a genuinely better
  fit than a rotation icon for "make things visible again"), `arrow-u-up-left-bold`
  (restore a deleted item — `CarnetsTab`), `arrows-counter-clockwise-bold` (the
  fuller double-arrow, for the highest-stakes meaning — **discard ALL customization
  to factory default** — `aisles.tsx`, `meals.tsx`, `display.tsx`'s measure-colours,
  and `boardLayout.tsx`, which now gets an icon for the first time).
- **All 4 factory-reset buttons also gained a `useConfirm` guard** (`tone: 'default'`
  — a preference reset, not data loss, so no trash icon / danger styling), sharing
  one new i18n key `t.operator.resetConfirm`. This was the audit's #2 finding,
  folded into the same fix since it compounds #1: the icon collision made a full
  wipe read as a small undo, and nothing stood between the tap and the wipe.
- **Left alone, by design:** `ambient.tsx`'s replay button (explicitly dev-only
  tooling, not user-facing — "Dev tooling (the idleDebug spirit)"); `VoyageShareModal`'s
  link-reset and `VoiturePage`'s week-reset (both low-frequency operator surfaces;
  the latter already carries `tone: 'danger'` styling, so it isn't visually
  unmarked the way the other four were).
- Two e2e tests updated for the new confirm step (`board-customize.spec.ts`,
  `config-panels.spec.ts` — the latter written earlier THIS session for the aisle
  reset, so this is that test's own guard catching its own subject changing under
  it). `.confirm` scoping used since the dialog's confirm button repeats the
  trigger's label verbatim.

Checked and confirmed already clean by the same audit: `aria-pressed` toggles all
pair with a visible state class (~45 sites checked — no "I tapped it, nothing looked
like it happened" bugs); every `Vider`/`Effacer`/`Réinitialiser` label's actual scope
matches what it says (Board Notes' « Tout effacer » does clear exactly the shown set);
`caret-up/down-bold`'s dual meaning (collapse vs. reorder) reads fine in practice —
reorder always renders as a paired ↑↓ set, collapse as a lone directional caret, no
real ambiguity; every `❌`-flagged undo gap in ACTIONS.md already carries a recorded,
deliberate reason.

**Follow-up same day, three more passes (Marc: "review flow across sections and
uniformity when editing, viewing").** Split into view/peek flow, edit-door flow, and
cross-section navigation flow — each independently re-verified against current code,
not against this file. **Verdict: already solid.** Every candidate the three passes
surfaced turned out either already correct-by-construction or a documented, deliberate
split (create-vs-edit door "mismatches" for events/home-projects, member-vs-pet edit
doors, no silent auto-saves anywhere, no dead-tap rows, `x-bold`/FAB/undo-toast all
uniform). Two genuinely-open, low-severity items survived:

- **Fixed**: `buildMemberPerson`'s primary "Fiche complète" action and its own
  "Relier à quelqu'un" action (`src/components/detail/adapters.ts`) shared
  `users-three-bold` — two DIFFERENT actions in the SAME peek sheet, the same
  failure class as the arrow-icon fix above. `users-three-bold` is `connect`'s
  correct, established, app-wide meaning ("connect people" — same glyph AddSheet's
  own category and `ConnectPeople`'s save button use); `detail` was the intruder,
  swapped to `arrow-up-right-bold` ("step out to a fuller view" — its existing
  meaning everywhere else it's used: share, open-in-new-tab, export).
- **Fixed same day, on Marc's ask** ("fix 1 then ship"): `arrow-left-bold` also meant
  "reply" (a mot's peek action + `MotComposer`'s "en réponse à" context line)
  alongside its ~10 other, correct "go back a step" uses. No existing icon fit
  without recreating the same collision elsewhere (`envelope-bold` already means
  "mot," `arrow-u-up-left-bold` already means "restore a deleted item," `link-bold`
  already means "share/copy a URL"), so `arrow-bend-up-left-bold` was fetched from
  `unpkg.com/@phosphor-icons/core@2` and rendered standalone (Playwright screenshot,
  side-by-side with an existing icon) before trusting the path data, per
  `pipIcons.ts`'s own documented process. `arrow-left-bold` now means exactly one
  thing app-wide.

### C-undecies. Reported by users, 2026-09-03 — the photo→recipe read "hallucinates"
(1/2 tasse → 1/3; 225 g (1/2 lb) → « 2 tasses ») + how columns are read

A full audit of the photo→recipe pipeline traced the two complaint classes to two
DIFFERENT causes — the worse one was **our own repair code, not the AI**:

- **`repairImperialFromMetric` trusted the ml side unconditionally** and overwrote a
  perfectly-read « ¼ de tasse » whenever the ml was the mis-read side (a 6 read as an
  8) — and the rewritten line, now self-consistent, sailed past the verify panel's
  mismatch flag. **Fixed**: gated on the paren amount being actually unreadable
  (`findMeasures(inner)` empty); a legible disagreement is flagged, never rewritten.
  Band tightened 0.55–1.8 → 0.7–1.45 (a 6↔8 misread is 0.64×) + a g↔lb cross-check.
  Guard proven against the pre-fix code (3 red) before trusting it.
- **The "faithful, no-AI" path was the exception, not the rule**: one OCR-garbled
  heading and the whole transcript went through the generative 70B (`structureRecipe`)
  whose prompt never forbade unit conversion — the « (2 tasses) » class. **Fixed**:
  verbatim-quantities/no-conversion rule in the prompt (FR+EN), `max_tokens` 900→1700
  (truncation read as "doesn't resolve"), commentary-stripping, AND a structural guard —
  `linesWithForeignNumbers()` cross-checks every output number (and number+unit pair)
  against the source transcript; foreign lines come back as `suspect`, flagged « à
  confirmer ». Markdown-shaped transcripts (the cloud Mistral reader answers in
  markdown, tables included) now flatten through `parseRecipeText()` and hit the
  deterministic parser — the accuracy the cloud reader was bought for no longer
  falls back into the AI.
- **"Doesn't resolve"** was infrastructure: tesseract's ~15 MB traineddata comes from
  a CDN on first read with no timeout (spinner forever), and a failed create was
  cached null for the session (every later read silently used the vision fallback).
  **Fixed**: 60 s create timeout, retry-on-next-read, `engineFailed` → its own honest
  message (`readFailEngine`).
- **Columns** (`columnizeOcrPage`): a genuine full-width body line (meta/intro) used to
  be CHOPPED at the gutter mid-phrase (only display-size lines were exempt). **Fixed**:
  a line with a word physically crossing a gutter is kept whole — the merge artifact
  this function un-merges has the opposite signature (fragments each side, gutter empty).
- **The verify panel flagged every fraction line** (contradicting its own comment) —
  alarm fatigue meant the one real flip was skimmed past. **Fixed**: risky-only flags
  (mismatch / unparseable amount / shaky word / AI-changed number), and the dead
  `c. à` unit check came alive (JS ASCII `\b` after « à » — the exact gotcha
  measure.ts documents — replaced with a letter-lookahead).
- **New: the « Rapport » tab** in `RecipeReadReview` — pipeline honesty for the cook:
  which reader ran (on-device Tesseract / cloud `mistral-ocr-latest` / vision
  `llama-3.2-11b`), OCR confidence, columns detected, how the text was organized
  (headings = no AI / AI with the model named / heuristic), each metric→fraction
  repair (before → after), the numbers that could not be traced back to the photo,
  and the shaky-word count. Endpoints return `structuring`/`model`/`suspect`;
  `readPhoto` builds the report as it actually runs. DevKit specimen + both e2e specs
  (`recipe-read-review`, `recipe-photo-import`) exercise the new taxonomy and the tab.

Still open (deliberate): multi-photo `mergeOcrPages` can swallow an ingredient when
two different lines share qty+unit+connector tokens (Jaccard 0.55 on 5-token lines);
and a qty-column | name-column print layout could still read as two columns. Both need
real-photo corpora to tune against — not guessed at.

### D. Judgement calls waiting on Marc, not on code

- ~~**`ARM_MS` 6s → 10s** on the toddler tiles.~~ ✅ **answered 2026-08-28: 6 s stands.**
  `bmad/history/AUJOURDHUI.md` now has no open boxes at all. Declined, not deferred — don't
  re-propose without a new observation.
- ~~**Review-queue counts** in intake/postbox section titles.~~ ✅ **answered
  2026-09-03: keep.** The no-counts tenet targets household-facing gamification
  (streaks, ranks, tallies of who did more); an operator-only work queue's depth is
  operational information for deciding whether to open the section, not a score. No
  code change. Declined, not deferred.
- ~~**Routines invalidate `BOARD_KEY` but never surface on the board.**~~ **Stale,
  re-verified 2026-09-03 — both halves.** The "possible missing feature" already
  ships: `RoutineNextCard.tsx` is a registered board card (`routineNext` in
  `lib/boardCards`) reading `ROUTINES_KEY` directly. And the invalidate is not dead
  either — `/api/board` returns no routine data, and the co-invalidate sites
  (`household.tsx:334`'s member save, `Operator.tsx:174`'s refresh-all) are broad
  cache refreshes where `BOARD_KEY` is warranted alongside `ROUTINES_KEY`, not a
  routine-specific write with nowhere for it to land. Nothing to decide or fix.
- ~~**Two timers on screen at once** on a timed routine step.~~ ✅ **answered
  2026-09-03: drop the run stopwatch entirely.** The per-step countdown ring stays
  (it serves the task — a 2-minute brush); the session stopwatch goes (elapsed time
  per run is the raw material a personal-best score would be built from, closest to
  the calm stance). `RoutinePlayer.tsx` — parent-only rendering removed, along with
  its dead-code trail.

### E. Tooling gaps found during this cleanup

- ~~**`knip` is not a gate, and currently does not run.**~~ ✅ **wired into CI 2026-08-27**
  (it still crashes locally on this machine — environmental — so the CI run is the one
  that counts), and `ignoreExportsUsedInFile` collapsed 58 findings to 7 real ones.
  The original finding, for the record: it was absent from `.github/workflows/ci.yml`,
  and on this machine it now crashes every time (`oxc-parser` `RangeError: Array buffer
  allocation failed`) — it ran once earlier the same day, so it is environmental, but the
  "dead-code gate" is neither gating nor runnable. Either fix and wire it, or stop calling
  it a gate.
- ~~**Its signal is buried anyway.**~~ ✅ **already configured away, same day as the
  gate wiring (`421aa91`, 2026-08-27).** `knip.json`'s `ignoreExportsUsedInFile: true`
  is exactly the fix this bullet asked for. Re-verified 2026-09-03: local knip still
  can't run to confirm the live count (the same `oxc-parser` `RangeError: Array buffer
  allocation failed`, environmental to this machine — CI's is the run that counts).
  Nothing left to configure; this bullet was stale.
- ~~`src/pages/PlannerOrSomething.code-workspace` — a stray VS Code stub.~~ ✅ **moved
  2026-09-03**, not deleted — its `path` pointed back at the repo root, so it reads as
  Marc's active workspace shortcut rather than a build artifact; deleting an untracked
  file outside git's safety net on a guess would have been the wrong kind of clean-up.
  Now `./PlannerOrSomething.code-workspace` (repo root), `path` corrected `"../.."` →
  `"."`. Still git-ignored; nothing to commit.

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
