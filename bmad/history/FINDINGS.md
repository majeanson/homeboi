# bmad/history — closed findings and the passes that produced them

These are `STATE.md` §4's CLOSED sections — A through J (the audits, sweeps and
screenshot passes of 2026-08 and 2026-09) and L (the public-app hardening pass of
2026-09-16/17). Every one is settled: each box is `[x]` or a `[~]` with its reason.
They were moved here on 2026-09-17, leaving §4 to hold only §K, which is the work that
is actually open.

**Each section is summarised in one line in `STATE.md` §4, with a pointer here.** The
summary carries the verdict; this file carries the argument — what was tried, what was
measured, and what turned out to be wrong. Several of these sections are the record of a
guard being proven red, or of a finding that was WRONG on inspection, and those are
worth more than the fixes.

**Do not mine this for work.** Re-verify any claim against the code before acting on it:
a ledger entry is a verdict from a moment, and roughly a third of the items picked up on
2026-08-27 turned out to be already done.

---

**« Le ? ne sert qu'au babillard » — reported 2026-09-09, and it was true.** Arming
the « ? » meant HINTS ONLY. A section's guided tour existed for six sections but was
reachable from two places you had to already know: Réglages ▸ Découvrir, and the
first-visit card that disappears once dismissed. So the tour read as a board feature,
which is exactly how it was reported. Fixed as one uniform thing rather than six:

- **`HelpHint` is now the « ? » bar** — the tap-to-explain line plus two doors,
  « Faire le tour » (THIS section's tour) and « Le guide ». Every hub tab already
  rendered `HelpHint`, so one component made all of them equal; it takes the section's
  `card`, and the tour id IS that card id (the convention `SectionIntro` has used
  since #32, now load-bearing).
- **Les notes had no tour at all** — the last hub tab without one. It has a five-step
  one, single-sourced from its guide points like every other. An e2e that used to pin
  the ABSENCE (« no tour to offer ») now pins the opposite.
- **Maison's « ? » offers the tour of the SECTION you are on**, not the tab's:
  routines and the cercle each own one. The route→card table is shared with the ＋
  sheet (`lib/sectionCard.ts`) so two spellings can't drift apart.
- **Réglages had no « ? » AT ALL — and 34 help entries nothing could reach.**
  `lib/operatorHelp` has an entry per settings section, `HelpTitle` makes a heading
  tappable *while help mode is armed*… and nothing in Réglages ever called `toggle()`.
  The registry had been unreachable for as long as it has existed. The « ? » now rides
  the lens row (Comprendre · Régler), on the Régler face only — on Comprendre the guide
  text IS the explanation — and Réglages got its own tour so its bar offers what every
  other one does.
- **Guard: `tour-rule.test.ts`** — every surface with a « ? » has a tour, every
  `<HelpHint>` names its card (fail-closed), every step's anchor exists, no anchor is
  orphaned. Proven red three ways (a bar with no card, a step pointing at a dead
  anchor, an anchor deleted from the page); the Réglages e2e was proven red by
  removing the toggle again.

**And the guard's first draft was wrong in the repo's favourite way.** It scanned only
literal `data-tour="…"` and reported three orphans — `kitchen-tabs`,
`maison-sections`, `cercle-views`. All three exist: they are passed as `tour="…"` to
SubTabs, which forwards `data-tour={tour}`. I nearly "fixed" three anchors that were
already there. The scan follows both spellings now, and the real findings were
elsewhere (notes had no tour; `add-routines` was an anchor no step named). **A grep
guard that walks the wrong shape reports the wrong thing with total confidence** —
the third time this file records that lesson.


**Coverage + Wave D pass, 2026-09-08 (evening).** Three of the six "honest coverage
backlog" gaps this file listed were **stale**: device-revoke, member-rename and the
note auto-save round-trip are all covered (the first two were written earlier the same
day). The three real ones are now closed, each verified red against planted defects:

- **`/cercle/import` had ZERO tests** — the worst place in the app for that, since the
  URL lives in links already TEXTED to relatives and behind one tap sits the longest
  write chain in the codebase (create-or-merge each person → copy each photo → each
  relationship → each pet + its owner link → the family group). Six cases read the
  WRITES, not the screen (`e2e/family-import.spec.ts`).
- **Both toddler surfaces** — the kitchen's rule is *a child's pick is an IDEA, never a
  plan* (nothing may reach `/api/meals`), plus "one tap never commits" and "a day that
  already has a supper is taken"; Maison's is that a relative's label is read from the
  OTHER person's side (« Mère », not « Fille ») and that closed links put a grandmother
  on a grandchild's card. A kid kiosk has no in-app escape, so a stray write there is
  both unattributable and unreachable.
- **Glisser une personne dans un groupe** (`e2e/cercle-drag-group.spec.ts`) — the last
  uncovered cercle write, driven with the MOUSE (the reachability half of the standing
  rule). Its third case is the session's cleanest catch: « a person already in the group
  posts nothing » passed with `canDrop` **deleted**, because `onDrop` re-checks
  membership too — a guard defended twice tests neither layer. Re-aimed at what canDrop
  alone owns (the drop CUE), with the allowed drag as a control so it can't pass by the
  highlight never appearing at all; now red on the deletion.
- **La galerie photo d'une personne** (`e2e/contact-photos.spec.ts`) — the last line on
  the backlog. A caption saves on blur by id and trimmed; an UNCHANGED caption writes
  nothing (this surface blurs constantly — tab away, tap another photo, close the scene —
  so a write per blur would be a write per glance); and the delete asks first, with
  « Annuler » costing nothing, because deleting frees the R2 blob server-side and there
  is no undo behind it. Gotcha for the next session: the gallery lives inside the
  « Cadeaux, étiquettes et groupes » disclosure, closed unless the person has gift ideas
  or tags — the spec opens it rather than depending on fixture data.
- **Wave D's last item stays parked, but its containment was CHECKED rather than
  trusted.** The client guard went red on the bug it names; the server had two spellings
  of the lockstep rule, now one (`functions/_lib/recipeStepImages.ts`). Details in
  PARITY.md's own entry.


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
~~Still genuinely open: …~~ **tier 3 is CLOSED, 2026-09-08 (evening).** Every one of the
seven resolved, and only one of them by writing code: the cashier's second check-state and
the staples chips are Marc's « won't do »; the supper hero's done state is his « leave it —
the hero is a plan, not a tracker »; the gather tick MEASURES 46px against a 44 floor and is
now guarded against the live `--touch-target`; the routine stopwatch was dropped on his call
and is gone from `RoutinePlayer`; the empty shell routine's cue SHIPPED as "kids seam #6"
(« À compléter » + why, on the parent card); and « Historique » is the "last week" review,
with an « Encore ? » that re-plans a past dish. Six of the seven were verdicts or already-done
work that nobody ticked — the ratio this file keeps re-learning. « Par allée »'s drag grip is a recorded decision, not a gap.

### C. Section debt — `REVIEW-PASS.md`, **closed 2026-09-09** (swept four times)

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

`REVIEW-PASS.md` went 31 → 29 → 20 → 15 → 4 → 1 → **0**. The last pass settled the residual
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

- ~~**Pinch-zoom (`user-scalable=no`, axe `meta-viewport` on every state).**~~ ✅
  **answered 2026-09-16: keep it off, everywhere.** « I want an app where you don't need
  to zoom, where we use the space accordingly on all media types. » The consequence is a
  standing obligation, not a one-line change: when something is hard to read at some
  width, fix the layout or the type ramp (`Cluster`/`Rail`, `--chrome-scale`, the
  100/115/130 text tiers), never the viewport tag. Declined, not deferred.
- ~~**« Les calendriers » (ICS subscriptions, 0129/0131).**~~ ✅ **answered 2026-09-16:
  remove entirely** — retired by `89fe2bfe`/`2390bc3b`, tables dropped by 0132. Don't
  re-propose an external-calendar import without a new observation.

- ~~**A done state for a planned meal** (the supper hero headlines tonight's supper all
  evening; « Marquer mangé » exists only on a leftover peek).~~ ✅ **answered
  2026-09-08: leave it — the hero is a plan, not a tracker.** Declined, not deferred;
  don't re-propose without a new observation.
- ~~**The cashier's second ✓ / the staples chips** (bmad/11 tier 3, the two flow-audit
  design questions).~~ ✅ **answered 2026-09-08: won't do**, both. Recorded as `[~]` in
  bmad/11 so they stop being re-litigated.

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

### G. The 100-screenshot pass — 2026-09-10, and what LOOKING found

Marc asked for every PNG in the sweep to be opened, not sampled. All 100 were. Each
claim below was then **grepped against code before being written down** — two of the
first candidates died that way (the toddler nav's icon-only exit is documented and
keeps its `aria-label`; « Système » vs « Réglages » is the settings THEME's name, and
the six themed tabs mirror the hub on purpose). What survived, ranked by user harm:

- [x] **The EN board greeting truncates: « Good afterno… »** at 390px, where FR
      « Bon après-midi » fits. `.greet` carries `clamp(16px, 4.4vw, 32px)`, added
      2026-07-14 for exactly this bug in FR (« Bon apr… ») — the fix under-shoots by a
      few px in the other language. A viewport `vw` clamp is a guess at the room left
      by four fixed-width round buttons; a container query would know.
      **Fixed 2026-09-10** — sized off `.app-head__main` with `cqw`, which IS the room
      (the button cluster is a fixed 197px), and allowed a second line when one truly
      will not do. 320px keeps the ellipsis on purpose. `e2e/greet-fit.spec.ts` holds
      both languages at 360/390/430; proven red on the old clamp in exactly the three
      measured cases.
- [x] **« Maisonnée » has an invisible glyph in LIGHT theme** — the mobile face
      dropdown (`FaceSelect`'s collapsed chip) draws a white household glyph on a white
      disc. `notes-night` renders it fine and so does the wall's face ROW, which is how
      it was caught: the day/night pair is the tell. Board, habits and the wall all
      show the icon; only the light-theme dropdown eats it.
      **Fixed 2026-09-10** — all three `--all` avatars carry ink on paper, and the wall
      face keeps its tint when selected. The chip had no rule at ALL, which is why it
      was invisible rather than merely faint.
- [x] **The birthday YEAR field clips its own placeholder** — « Année (o| » on the
      new-person, new-pet AND intake forms (one shared three-up row: Mois · Jour ·
      Année at 390px). A filled year fits; only the placeholder is cut, which is the
      one thing an empty form has to say. `composer-fit.spec.ts` already holds « the
      placeholder must fit » for composers — this row is outside its reach.
      **Fixed 2026-09-10** — the fixed basis is a container query now, so the year takes
      its own line on a phone. `composer-fit.spec.ts` grew a scene-form block for it,
      and that guard immediately caught a regression the fix was about to ship: size
      containment stopped the row feeding its own intrinsic width, and on the pet form
      (a wrapping-flex parent, unlike the person form's grid) it collapsed to 0px.
- [x] **Three words for one idea: everyone.** « Maisonnée » (board · Notes · Maison),
      « Toute la maisonnée » (the habit form's scope), « Tout le monde » (Voyage's face
      picker, `i18n` `everyone`). `glossary.ts` settles the winner — `maisonnee` — and
      its own definition spends « tout le monde de la maison » as the EXPLANATION of
      the winning word. UNIFY's `RIVAL_CEILING` never declared this rival, so the
      ratchet cannot see it. Declaring it is the fix; renaming a user-facing word is
      Marc's call, which is why this is a box and not a commit.
      **Settled by Marc 2026-09-10: « Maisonnée » everywhere.** Four call sites feed one
      picker; three spelled it differently, and EN's board said "Everyone" while every
      other EN surface said "Household". One word per language now, the dead
      `cercle.everyone` key deleted, and the rival declared on the glossary term with
      `RIVAL_CEILING` floors of 2 — a sentence about the car and a genuinely open intake
      link may still say « tout le monde »; a face picker may not.
- [x] **The routine builder shows five always-open chips under EVERY step**
      (Minuterie · Le truc · Enregistrer ta voix · Ajouter une photo · Dessiner) —
      three chip-rows per step, so a four-step routine is twelve rows of secondary
      controls. `Disclosure` is the primitive for exactly this.
      **Fixed 2026-09-10** — one quiet « Minuterie, truc, voix, photo… » line per card,
      single-open, and the whole four-step routine now fits on one screen with its
      footer. The invariant is the interesting half: a card that CARRIES an aid renders
      the row open and shows no summary at all, because a fold in front of a filled
      field is how a household loses what it set (`e2e/routine-aids-fold.spec.ts`,
      red when `hasAid` is removed). `routine-tips.spec.ts` gained the new door in the
      same commit — the path a parent takes moved, so the spec that drives it moved.
- [x] **Toddler « Les notes » is not picture-first.** It says « Touche l'image pour
      l'écouter » and then draws the same generic document glyph on every tile; the
      only thing telling two notes apart is a WORD, to a pre-reader. `kitchen-toddler`
      and `liste-toddler` are genuinely picture-first (food, groceries) — this tab,
      the last to get a toddler lens, kept the shape without the pictures.
      **Fixed 2026-09-10** — a picture from the first source that knows one: the note's
      OWN drawing/photo, else a picto from the title and then the body (`pictoFor`, the
      list rows' map — « Garderie » → 🏫, « la marque de lait » → 🥛), else the kind
      glyph in the author's tint, which stays a legitimate tier. `e2e/toddler-notes.spec.ts`
      holds all three AND that four tiles never share one picture — "they all render
      something" is not the same as "you can tell them apart", which was the old state.
- [~] **Maison ▸ Routines on the 1280px wall keeps phone-width cards** — two cards in
      one narrow column, more than half the screen empty. The kitchen's wall view
      stretches; this one does not.
      **WRONG — measured 2026-09-10 and parked.** On the wall the grid IS three columns
      of 318px across 986px (`.routines-grid` is `auto-fill, minmax(15rem, 1fr)` and the
      width cap is lifted for this page in hub.css). What the screenshot shows is the
      FIXTURE: one routine in « Soir », one in « Matin », and each moment bucket renders
      its own grid — so every row holds one card because there is one card to hold. A
      household with three morning routines gets three across. Nothing to fix; parked so
      it is not re-found by the next person who looks at that PNG.
- [x] **The garde-manger ticks a SQUARE box; La liste ticks a ROUND one** — same idea
      (« I dealt with this »), two shapes, on two tabs a person moves between while
      cooking. Its rows also carry no picto where the list's do.
      **Fixed 2026-09-10, and it was not only cosmetic**: `.act .check` is a 30px disc
      with a 44px hit area (a documented touch-target fix, AUJOURDHUI §5) and a sage
      done-fill; CheckRow drew a bare `square-bold` GLYPH with neither, on the surface a
      parent taps while cooking. The disc now names its hosts —
      `.act .check, .checkrow__check .check`. The first attempt made it a bare `.check`,
      which looked equivalent and was not: `TodoSection` also writes `className="check"`
      and had never sat inside an `.act`, so the class was INERT there and its rows drew
      their own empty circle. Going global turned them into bare ✓ glyphs — caught in the
      next screenshot of `day-plan`. A selector list says who opted in; a bare class
      conscripts whoever happens to share the word. (The missing picto is left: a pantry
      row is a word a parent typed, not a catalogued item, so `pictoFor` has less to go
      on there than on the list.)
- [x] **« Montrer à la caisse » — the evidence a till accepts, and where it comes from.**
      Marc, 2026-09-10: a cashier must not refuse the app « just because it's not one of
      the three » — Flipp, reebee, Glouton — « it does the same thing ». And his pushback
      on my first answer was right: pointing a cashier at the OFFICIAL flyer page means
      hunting for the item on it, which is precisely the friction this app removes.
      **Shipped** — our card stays the thing shown at the till, and it now carries what
      the three are trusted for: the store, what it matches, product + size, big price,
      **unit price** (what a match turns on; an AI-inferred size wears ≈), the **validity
      span**, and a provenance line — « Circulaire Super C · via Flipp ↗ » — that names
      the source and links the official page in one tap. « Voir la circulaire » opens our
      reconstruction **on the item, circled** in marigold (the category convention).
      What I would not do, and said so: style it to read AS Flipp. That deceives the
      cashier rather than convincing them, and collapses the moment anyone looks closely.
      Naming the source is the honest version of the same argument.
      Found on the way: `FlyerViewer` kept a LOCAL `money` printing `$4.99` under a French
      UI while the card one tap back said « 4,99 $ » (the date formatter had been unified
      into lib/deals for exactly this reason; money hadn't); and the `flyer` detail
      fixture hard-coded June ISO dates, so the flow showed two weeks — both fixed.
      **« Montrer Flipp » — shipped 2026-09-10 (evening), and it settles ❓ #2 as far
      as a till is concerned.** Marc: « try it out as a clear Montrer Flipp ». The
      question was whether Flipp has an ITEM-level public page, since his objection to
      the flyer page was hunting for the item on it. Probed in a real browser with a
      live id (Lactantia at Adonis, valid that week): **`flipp.com/fr-ca/item/{flyer_item_id}
      ?postal_code=…` renders Flipp's own proof** — store logo, clipping photo, name,
      price, « Valide du … au … », format in the description, Flipp's own "the flyer has
      precedence" disclaimer. Three facts the probe fixed, each now a guard in
      `e2e/cashier.spec.ts`: `/flyer_item/…` is a 404 (do not "fix" to that shape);
      `en-ca` redirected to a broken "Undefined store" page, so the locale is pinned to
      fr-ca whatever the UI language; and WITHOUT a postal code the page renders Flipp's
      error state — so the door is not built at all without one (a dead link is worse
      than none at the moment a cashier is waiting). Both guards proven red on the exact
      wrong shapes. The postal rides the shared `HOUSEHOLD_KEY` cache (the aislePrefs
      idiom). We already held the id: `deal.id` IS Flipp's `flyer_item_id`. The live
      payload also carries `merchant_logo` and `clipping_image_url` — so ❓ #3's nulls
      are only ever the fixture's.
      ❓ The acceptance RULES were never read — `maxi.ca/fr/unbeatable-legal` renders as
        an SPA shell. Identical vs comparable item, printed vs on-screen, limits,
        exclusions: still unknown. Paste the terms and the card can be scored against them.
      ❓ Whether Babillard may present Flipp-sourced data as a price-match source AT ALL
        is licensing, not layout (the data limit: cutouts only, link out). Unsettled.
      **Settled 2026-09-10 (night): a Flipp list cannot be pre-filled from outside** —
        flipp.com's add is that browser's own localStorage (no request), the list page
        reads no URL param, the app's list is account-synced with no write API. The
        till grid steps through it with Flipp's own button instead (« Ajouter à Flipp ·
        n de N » + « Ma liste Flipp »); see §3 « Any way to pre-create the list… ».
        **Then reopened and answered the other way (late night):** a BOOKMARKLET runs on
        flipp.com's origin and can write that storage — proven live on their real list
        page with three stores. `lib/flippList.ts`; « Ma liste Flipp » copies, the
        bookmark pastes, and a signed-in Flipp merges it into the account (their own
        `joinLocalList`). See §3 « … yes: a bookmark that runs on flipp.com ».
      ~~❓ Store logo and product picture are null in the fixture, so the card has never
        been photographed looking like an ad rather than a receipt.~~ **Closed 2026-09-10
        (night):** the fixture carries both now and `cashier-peek` was read wearing them —
        see §3 « The till card wears the shape a cashier already knows ».
- [x] Smaller, all photographed — and **four of the five were wrong**, which is the
      entry worth reading. Only the first was real: **the drawings tile footer
      collided** (the 📌 is `position:absolute` and `.drawgallery__item` — its
      positioned ancestor — is TALLER than the drawing, so `bottom` put it over the
      credit; measured, the pin's box x 21–45 sat on the author's face and name at
      x 16–59). Both overlays are on the picture now, and
      `e2e/drawings.spec.ts` measures it (red on the old position, on both tiles).
      The other four died on inspection, each because the code already had a reason:
      · **the empty list's three controls are all meaningful** — 🔍 browses the
        FLYERS (not the list), ⚡ restocks past items (the most useful thing on an
        empty list), ⚙ is a device-local display pref; the one control that does
        depend on contents, aisle sort, is already gated on `list.length > 1`.
      · **tile grids DO stretch** — measured 196/196 (`jouer`) and 197×4
        (`kitchen-recipes`). What read as ragged was a third tile alone in its own
        row, which is what a grid does.
      · **quickadd's pale discs are a designed state** — `.aisle-pip.is-auto` is
        dashed at 0.75 opacity on purpose: « an untouched (auto-guessed) aisle stays
        quiet ».
      · **the ideas drawer's ⚙ is deliberate** — its own comment: right-aligned on a
        quiet line because it is the only door back to ✏️/🗑, so it cannot be
        host-optional.
      A screenshot shows what a surface LOOKS like; it cannot show what a line of CSS
      was for. Four of nine findings from the sweep needed the code to settle them,
      and the ratio is the point — not a reason to stop sweeping, a reason to keep
      grepping before building on a cell.
clock) while every row reads « dim. 8 juin », « lun. 9 juin » (the shared fixture,
anchored a year back at `MMID`). The kitchen week has the same split — it labels the
fixture's Sunday « AUJ. » on a Thursday, because the meals API's contract is "the
window starts today" and the app honours it. Neither is an app bug; both mean a
reviewer cannot judge the one thing those screens are FOR. The fix is a matrix-local
fixture override (rebase `MEALS`/the car week onto the sweep's clock), not a change to
the shared mocks 126 other specs freeze at `BASE`.

### H. The sweep could not see three things — fixed 2026-09-13, and what it then showed

The session opened on « next steps ? » with an empty written backlog (0 boxes, §4-G
settled), so the answer was §4-G's own method: run the matrix and LOOK. What the
looking found first was the **matrix**, in three ways, each of which had been quietly
making the review pass weaker than it read:

- [x] **Seven orphan PNGs.** 158 images against 151 states — `stickers-day.png`,
      `cercle-*`, `routines-*`, `first-cercle`, `first-routines`: snapshots of routes
      retired in the Maison merge, sitting in the review folder wearing filenames that
      say nothing about their age. I opened `stickers-day` and reviewed it as current
      before the count gave it away. A stale screenshot is a verdict from a moment, the
      same as a ledger cell. **The run owns the folder now** (`sm.teardown.ts`): anything
      not written by this run's states is deleted, and the manifest reports what went.
      The guard's own first draft pruned on « did this run produce anything at all? »,
      and a two-test `-g` run promptly deleted all 154 other PNGs — so each fragment
      carries the table's `expectedStates` and a filtered run is refused and says
      `partialRun`. Proven in both directions: watched it wipe the gallery, then watched
      it refuse.
- [x] **Every shot was viewport-only.** `page.screenshot()` with no `fullPage`, so in
      151 states the sweep had never once seen the bottom of a surface. Two days of
      commits had just fixed the board's « Auj. » / « Demain » tiles and **not one
      screenshot contained them.** `fullPage: true` would NOT have fixed it, and that is
      the part worth keeping: the document never scrolls here — the shell is 100dvh and
      the scrolling happens inside `.hub__body` / `.scene__body`, so a full-page capture
      returns the same viewport image and reads as proof there was nothing below. The
      sweep now finds the real scroller, pages it down (capped at two extra frames,
      48px overlap, skipped for keyboard states) and shoots each frame: **261 frames
      across 154 states, 110 of them images nobody had ever seen.**
- [x] **The rebase covered two fixtures out of ten.** §4-G left « rebase MEALS/the car
      week onto the sweep's clock » as the fix and it shipped — for `meals` and `car`.
      Every OTHER shared fixture still printed a year-old date under a clock pinned to
      today: the board's mots read « il y a 462 j », Réglages ▸ Agenda listed « dim. 8
      juin » under a September header, the kitchen history said « Juin 2025 » over a
      September plan, the drawings wall was dated 2025, and « Mes habitudes » was showing
      two due habits because the other two had their `due_days` a year off. A rebase that
      covers two fixtures out of ten is not a rebase; it is a smaller lie. It is now the
      whole dated table, with the safety that makes it safe to point broadly: the shift
      only applies inside **±400 days of BASE**, so fixtures already anchored on today
      (TODOS builds its days off `localDayStart(new Date())`) are left alone — without
      that window the rebase would have thrown them a year into the future and created
      the very bug it exists to remove.
- [x] **The two newest features had no state at all.** « Les virements » shipped
      2026-09-11 and the « liste à compléter » scene 2026-09-12; the sweep two days later
      could not have found anything in either, because neither was in the table. Both are
      in it now (`virements`, `form-virement`, `todo-template`), with a shared `transfers`
      fixture in `e2e/mocks.ts` (its memos carry NO date on purpose: a memo is stored
      TEXT, the matrix can rebase `sentAt` and cannot rebase the sentence beside it, so a
      dated memo would print a month its own row contradicts). `help-notes` got the notes
      fixture too — it had been photographing the help bar over « Aucune note », which
      cannot show what the bar does to a page that has rows under it.
      **Both new budgets were measured, not guessed:** the first guess (60px) failed at
      172px, and the honest reading only arrived after fixing the content selector — the
      form's first content is its sender face row, not the date input below it.

**Then the frames showed things.** Ranked by user harm; each grepped against code
before it was written down, and four candidates died there (the till tile's "tiny
picture" is the mock's placeholder image; the wall routines grid is §4-G's parked
fixture again; the quickadd pale pips are a designed state; the template editor's
first « move up » IS disabled — `upDisabled={idx === 0}`, the pixels just do not say so
loudly).

- [x] **`money()` ignores the language** (`src/lib/deals.ts:79`). It is hard-coded
      FR-CA — `n.toFixed(2)` with the dot swapped for a comma and « $ » appended — so the
      whole shopping stack (list row, till tile, till card, price-match, flyer viewer,
      item editor) prints « 4,99 $ » under an English UI. Its own neighbour `dealDate`
      takes `lang`, and `lib/money.ts` has two lang-aware cached formatters. §4-G records
      unifying FlyerViewer's local money INTO this one — into the FR-only one.
- [x] **« tous les 2 semaines »** — `recur.every` is one fixed masculine string
      (`i18n.ts:1195`) composed with `unitPlural`, so three of the four units read
      correctly and the most common one in a household does not. Visible on the
      virements plan card and in `RecurPicker`; one source (`lib/recurLabel.ts:34`).
- [x] **EN « Show the cashier »** (`i18n.en.ts:3026`) reads as *display the cashier*.
      The scene it opens is titled « At the till ».
- [x] **A second « Partager » door on the day page** (`DayPlanPage.tsx:731`). The inline
      ↗ is rendered beside *bucket* rows only, so once a day holds ≥2 timed things and
      « Le fil » takes the timed rows, the lone all-day event keeps an unexplained icon
      floating in the gutter (clearest at 1280px, where the row shrinks to make room for
      it). `ACTIONS.md:102` records event-share as **peek-only**, and the peek does have
      it (`EventPeekActions.tsx:61`) — so this is an undocumented second door, not a
      missing one. Dropping the inline button restores the matrix and the row width.
- [x] **« Avant de partir » four times in one screen.** The agenda card's foot repeats
      the day's departure checklists (`Board.tsx:1361`, deliberate: « a reminder at the
      foot of the agenda ») and the « Avant de partir » card sits immediately under it —
      on a phone, always, since both are grid size 1 in one column. Two card headers and
      two identical collapsed « AVANT DE PARTIR 2 » pills inside ~400px. The reminder is
      right when the card is far away and noise when it is adjacent; it already knows how
      to hide (`hideWhenEmpty`).
- [x] **The garde-manger's « Restants » and « Idées de repas » lead with an always-open
      composer**, above their own empty state — LEAN.md's first smell, on a surface below
      the fold that the lean passes had therefore never photographed. `SectionAdd` is the
      primitive.
- [x] **The carnet's « Identité » draws a header over nothing** — every sibling section
      carries an empty-state line; that one has neither body nor line. Same shape as
      `c99b12fb`.
- [x] **A cercle row's relation is the first thing truncated**: « Conjointe de P… » at
      390px, « Conjointe … » at 360, while the row beside it says « Conjoint de Maman »
      in full — the contact ☎/✉ icons win the line, and the relation is the only thing
      the row is FOR.
- [x] **The toddler kitchen says « dimanche » for tonight's supper** while the toddler
      board says « CE SOIR » for the same meal. One pre-reader, two surfaces, two ways of
      naming today.

**All nine shipped.** Six the same day; the last three the next turn, each after Marc’s
own call on a question the code could not settle — the agenda hides its duplicate
reminder while the card that owns the subject is on the board (and picks it back up when
that card is hidden); the two meal pools fold their composer behind ＋, while the ideas
DRAWER keeps its field open because you opened it to write; and the person row hands its
☎/✉ to the peek — which meant giving `buildMemberPerson` those actions first, since a
member's peek had never had them and moving a door only counts if it lands. Every one of
the six rules is pinned by a test proven red against the exact old behaviour.

**The original six shipped the same day** (one commit, each with the grep that found
it and, where the fix is a rule rather than a pixel, a test proven red against the
exact old value first: the money formatter against `toFixed(2)` + comma, the
recurrence label against `every: 'tous les'`). The other three each argued with a
decision somebody had already made, so they went to Marc as three questions rather than
three commits: the agenda's duplicated « Avant de partir » reminder was deliberate (its
comment says so; what the comment could not know is that the card sits directly under it
on a phone), the garde-manger's two open composers were a LEAN call on a surface no
screenshot had reached, and the cercle row's truncation was a width trade between the
relation and the ☎/✉ icons. **All three answered and shipped the next turn** — and each
answer carried a second half the question did not contain: hiding the reminder needs the
reverse case (hide the CARD and the agenda takes it back), folding the composers needs
the drawer exempted (you opened it to write), and moving the ☎/✉ needs a member's peek to
have had them in the first place. It did not.

- [~] **« Meilleur prix » badges the more expensive number** — ★ on Super C 4,99 $
      (1,25 $/L) above IGA 2,99 $ (1,50 $/L). The ranking is right (`sortBestFirst` groups
      by unit kind and sorts by unit price; `PriceMatchPage.tsx:125` badges the first with
      one), the WORD is what is ambiguous. **Asked and answered by Marc 2026-09-13: keep
      « Meilleur prix ».** Declined, not deferred — the $/L line sits directly under the
      badge. Don't re-propose without a new observation.

### I. Looking at the frames — 2026-09-14, including at the sweep's own

§4-H built the ability to see below the fold and then looked at seven frames out of a
hundred and five, because the seven produced enough to fix and the session went to
fixing. This is the rest of that job. It also re-audited the mechanism, since the
frames are only worth what the capture is worth — and a quarter of them turned out not
to be worth anything.

**The sweep was shooting frames that said nothing.**

- [x] **Four frames were byte-identical to the one before them, and several more were
      near-copies.** `scrollFrames` asked « did the scroller move at all? » (> 8px) and
      shot whatever came back, so a page with fifty pixels of travel produced a second
      frame 94% the same as the first. Worse than no frame: a reviewer who opens `--3`
      and sees the same picture concludes they have reached the bottom, which is the
      exact belief this whole mechanism exists to remove. Three fixes, each after the
      previous one was proven insufficient by re-hashing every pair: a frame is only
      taken when a SCREENFUL (160px) remains; the scroll is `behavior: 'instant'`
      (a smooth scroll returns the TARGET from `scrollTop` the moment it is set while
      the pixels are still where they were — that is what produced the byte-identical
      pairs, and reading the setter back was not proof of anything); and the position is
      re-read AFTER the settle, with a final byte-comparison that deletes a frame which
      came out the same anyway. **232 frames now, from 259** — the removed quarter was
      noise, and « 110 new frames to review » was really ~78.
- [~] **Seven states failed once with « Target page has been closed »**, all seven the
      last by index, on the fourth full sweep of the session. A re-run passed 155/155.
      Environmental (a machine running sweeps back to back), not the change — but read
      before it was dismissed, because which tests flaked IS the signal here.

**Then the frames themselves.** Two real defects, and two candidates that died on
inspection — the « L'auto » board card has no help-mode heading (BOARD_HELP has 9 keys
against ~20 cards; a card without one is the normal state, not a gap), and the virements
due-date chips are cut at the right edge inside a `Rail`, which wires `useHScroll` and is
therefore reachable by wheel and swipe exactly as intended.

- [x] **A long label starves a native date field** (Réglages ▸ Agenda ▸ Année scolaire).
      `.recur__row` lets its field shrink to nothing on purpose, so a long `<option>` in
      a SELECT truncates instead of bleeding out of the form. A date input is not a
      select: « yyyy-mm-dd » and the picker button are browser chrome, an INTRINSIC
      minimum it cannot render under — it clips. « Rentrée (premier jour) » left its
      field **100px** against the **164px** the control wants (70px at 360), while
      « Dernier jour » one line below got 178px and read fine. Two identical fields, and
      the difference was the length of the words in front of them. `flex-basis: 0` is
      also why the row's own `flex-wrap` never saved it — a basis under the content
      under-reports the width, the trap CLAUDE.md names, in CSS this time.
      Fixed with basis `auto` + the control's floor. The guard CLONES the control and
      asks the browser how wide it wants to be, rather than pinning a number that rots
      (`e2e/composer-fit.spec.ts`); proven red at both widths. Worth recording: the
      field's `scrollWidth` read **98** against a 98px client box — blind to the whole
      defect, which is precisely why CLAUDE.md says a scroll check cannot see a clip.
- [x] **The toddler kitchen's « Choisis un repas » heading wore the same 📖 as the
      « Mon livre » door right under it** — same glyph, same white disc, ~150px apart,
      one decorative and one a control. To a pre-reader picking by sight that is two of
      the same thing meaning two different things: the rule the notes tab earned on
      2026-09-10 (rendering a picture is not the same as being able to tell them apart).
      A pointing hand now, which is the gesture rather than a subject and so cannot
      collide with any door or food picto. The guard asserts the RULE — no heading may
      share its glyph with any tile beneath it — not the emoji.

**And a correction to §4-H's own work.** The cercle guard written yesterday asserted
« no relation may be truncated at 390px » across the whole directory. One frame further
into this sweep, Social shows « Conjointe d'Étienne Gagn… » on a row carrying no
furniture at all: the words are simply longer than the line, which is the ACCEPTED state
— Marc chose to move the icons, not to let the line wrap, and `.cercle-row__sub` stays
nowrap-with-ellipsis. The guard passed only because the family fixture's relations are
short, and it would have gone red on a household with long names for a reason nobody
agreed to. It asserts the decision now (nothing but the relation spends that line)
rather than the symptom. **A guard written the day a bug is fixed tends to assert the
symptom it just watched disappear** — this file's fourth variation on the same lesson.

**Second pass through the frames, same day.** The toddler lens gave up two more, and
the second one was hiding in a file the first one made me open.

- [x] **« Couches » drew a shopping cart — the same cart the page wears in its header.**
      `pictoFor(i.text, '🛒')` on the toddler list, two lines below
      `<span className="kid-head__emoji">🛒</span>`. The cause was not the fallback: the
      picto map has **no household half at all**. Couches, papier hygiénique, savon,
      mouchoirs, shampooing, dentifrice — some of the most ordinary lines a household
      writes — every one fell through to whatever the caller passed. A pre-reader was
      shown the picture for "shopping" and told nothing about diapers, and two tiles
      that share a picture are one picture. 👶 / 🧻 / 🧼 now, with `dentifrice` landing
      on the toothbrush that already existed. The guard is the same RULE as the
      kitchen's twin, one tab over (`toddler-notes.spec.ts`): no heading may wear a
      tile's picture, and no two tiles may share one.
- [x] **…and the aisle walk had the matching hole.** `aisle.ts` maps emoji → aisle and
      its header promises that a grocery word added to `picto.ts` is classified there
      « automatically » — true only for an emoji `EMOJI_AISLE` knows. There IS a
      « Maison & ménage » aisle, and the three new pictos were not in it, so diapers
      would have drawn the right picture and then walked to « Autres ». Half a fix is
      how a promise in a header comment stops being true.
- [x] **« Rendez-vous dentiste » drew a stethoscope**, found while in that file. The key
      `rendez-vous` sat on 🩺 in the medical block — which is to say ABOVE « dentiste »,
      « coiffeur » and « docteur » itself — so the vaguest word in the map swallowed the
      specific ones. Precisely the shape of the « maïs / maison » bug whose own note sits
      forty lines below it, and against this file's stated rule that more specific
      entries come first. Moved to the end; a bare « Rendez-vous » still finds 🩺.

Both picto findings were proven red against the exact prior map, and the aisle one
against the exact prior table.

- [x] **The EN placeholder « Add something to complete.. » ended in two dots** on the
      board’s departure card — not a typo in the string (it carries a real « … ») but the
      field CLIPPING it: 218px of text in a 213px box, so the ellipsis lost a dot and the
      invitation read like a mistake. « Ajouter à compléter… » needs 160px and never had
      the problem, which is the whole reason only an EN shot could show it — English is
      usually the SHORTER lens here, and this is the case where it is not. Same family as
      the truncated greeting the EN twin caught four days earlier. The copy is « Add a
      to-do… » now (100px), and `composer-fit.spec.ts` grew its THIRD host — board-card
      composers, whose width comes from the card rather than the page — measured in both
      languages at both widths. Proven red on EN alone, with FR still green: a guard that
      fails everything proves nothing about the thing it was written for.

**The sweep finished** — all 78 below-the-fold frames opened. The last stretch yielded
one defect and two judgement calls, and the tail ran several frames with nothing at all,
which is what "done" looks like.

- [x] **« Avec Travail · revient ~13 h 00 »** — the board's L'auto card, in the `fresh`
      lens. `withWho` takes a PERSON and the fallback handed it the span's LABEL, which
      names the reason the car is gone (« Travail », « Soccer de Léa »), so the card said
      "With Work". Two ordinary ways in, neither exotic: a household that has a schedule
      before it has members, and **any household that deletes a member afterwards** —
      `holder_id` is a soft ref with no FK exactly so a deletion never cascades, which
      makes « no name for this holder » a designed state rather than a corrupt one. Both
      branches of the card had it (today's live status and another day's window summary).
      A name gets « Avec X »; a label stands on its own, because it already says why.
      Guard in `play-and-car.spec.ts`, proven red printing « Avec Travail ».

**Two left for Marc, because both argue with something deliberate:**

- ❓ **An empty day draws « Aujourd'hui » twice.** The all-clear hero (`Board.tsx:1041`)
  uses `t.board.today` as its kicker over « Tout est calme », and the `today` agenda card
  — mode `always`, so it renders empty — sits right under it saying « Rien pour
  l'instant. » Same word, same fact, ~250px apart: the shape Marc already ruled on for
  « Avant de partir » (hide the summary while the card that owns the subject is on the
  board). Not applied unilaterally, because the precedent is his to extend and this one
  only fires on an empty day.
- ❓ **« Tacos au poulet » draws a chicken leg, not a taco.** `pictoFor` walks the map in
  order and the *proteins* block precedes *dishes*, so an ingredient named inside a meal
  title wins over the dish. It is the right order for a grocery line (« poulet » IS
  chicken) and the wrong one for a meal title, and the same word can be both — « salade »
  is lettuce on the list and a salad on the plan. So this is not a bug with a correct
  reordering: it is one shared map serving two surfaces, and the honest fix is a
  caller-side "prefer dishes" for meal/recipe titles. A helper change, so it waits.

### J. Fresh eyes — what two sessions of polishing had not touched (2026-09-14)

Asked for a fresh look rather than another lap, the honest answer was that the lens had
become the work. Three things had never been looked at at all; two of them were real.

**1. The live app was UNOBSERVED — fixed.** Every 500 already calls `console.error` with
the method, the path and the error (`functions/_lib/route.ts:125`, `worker/index.ts:340`),
and `wrangler.toml` carried no `[observability]` block, so Cloudflare retained none of it.
This Worker predates the setting being on by default. A real household on
`babillard.marcportal.com`: if something broke for them on a Tuesday, there was no way to
find out — ever. Workers Logs keeps 7 days, queryable in the dashboard.

`invocation_logs` stays ON deliberately: it is the noisy half (one line per request, and
this app polls at 10 s active / 300 s idle) but it is also the half carrying **CPU and
wall time per invocation** — the one signal that would have caught `/api/year` burning
1.8 s of a ~10 ms budget, which was found by reading code instead. And NOT sampled,
because head sampling drops whole invocations, custom logs included: sampling the poll
noise would drop the same share of the `console.error` lines, and errors here are rare and
are the entire point. One household is a few thousand requests a day; there is nothing to
save. `head_sampling_rate` is the lever if that ever changes — knowing what it costs.

Verified rather than assumed, and the first attempt at verifying was wrong: `wrangler
deploy --dry-run` says nothing about the block, and I nearly took silence as proof. A
bogus key planted beside it produced no warning either (it landed in a duplicate table
header); planted properly, wrangler names the unknown field. THEN the silence meant
something. Then a bounded `wrangler tail` against production while curling it: 200 and
404 came back, and the invocation arrived carrying `cpuTime: 2`, `wallTime: 3` and the
version id of the deploy that had just shipped.

**2. There was NO accessibility coverage — now there is a census.** No axe, no a11y spec,
only hand-rolled proxies (`nested-interactive.test.ts`, the contrast TOKENS). The proxies
are good and they are not an audit. The session that added this had just proved the point
by eyeballing a contrast ratio, declaring night worse, measuring it, and finding it
better: a machine reads contrast, a person guesses.

The matrix already drives 154 real states in a real browser, so one axe pass per state is
nearly free and inherits every lens — night, toddler, EN, 360px, the wall. Report-only,
aggregated **per rule** (the same violation on forty lenses of one surface is ONE thing to
fix), with up to four example targets so the manifest is enough to act on. WCAG A + AA
only on the first pass: mixing advisory rules into a first census is how a number nobody
trusts gets ignored — this very manifest has taught that twice.

**The first census, and it earns its keep immediately:**

| rule | impact | states | where |
| --- | --- | --- | --- |
| `button-name` | critical | 1 | person-edit — **fixed in this commit** |
| `color-contrast` | serious | 78 | measure pills, kitchen day labels |
| `aria-prohibited-attr` | serious | 11 | the kitchen week's day `<span>`s |
| `nested-interactive` | serious | 2 | cook-day, multicook-day |
| `scrollable-region-focusable` | serious | 1 | `.rail` (virements) |
| `meta-viewport` | moderate | 154 | every state — zoom is disabled app-wide |

- [x] **`button-name`, the only CRITICAL in the sweep.** The « Liens suggérés » dismiss ✕
      in `LinkComposer` had no text, no `aria-label`, no `title`, and `Icon` is
      aria-hidden — a screen reader announced « bouton » and nothing else, beside a
      labelled « Ajouter », for the action that THROWS THE SUGGESTION AWAY. The string
      `cercle.dismissSuggestion` (« Ignorer » / « Dismiss ») already existed and had
      simply never been wired to the control that needed it. Re-scanned: that state is
      clean now.
- [x] **`nested-interactive` — and the repo's own guard calls this file GREEN.** ✅
      **fixed `14d25b93` (2026-09-14)** — `.cook__ing-text` lost `role="button"`; the
      pills stay real buttons, so measures stay keyboard-reachable, and a screen reader
      now hears « 400 g de pâtes » instead of « Écouter l'ingrédient ». Re-scanned clean. Axe
      finds `.cook__ing-text[role="button"]` containing the measure pills, which are real
      `<button>`s: a control inside a control, in COOK MODE, the surface a parent is
      using with their hands full. `nested-interactive.test.ts` exists FOR this defect
      class and CLAUDE.md records at length how it once reported green over exactly it.
      This is the third instance — and the first one found by an audit instead of a grep,
      which is the argument for having both.
- [x] **`scrollable-region-focusable` on `.rail`.** ✅ **fixed `76c31251` (2026-09-15)** —
      `Rail` becomes a Tab stop ONLY while `useHScroll` reports it overflowing (a stack of
      focusable rails that scroll nothing would be the next a11y bug); one fix in the shared
      primitive covers every rail. A hidden-scrollbar side-scrolling row
      a keyboard cannot reach. This repo has a standing rule for precisely this (« A
      scrolling row must be reachable with a mouse, not just a thumb ») and solved the
      MOUSE half with `useHScroll`; keyboard is the third path and it was never closed.
      `Rail` is the shared primitive, so one fix covers every rail in the app.
- [x] **`aria-prohibited-attr` on the kitchen week.** ✅ **fixed `83dd7dea` (2026-09-15)** —
      ten spans: six icon-only pills take `role="img"`, the day header moves its full
      date into an `.sr-only` child, two weather spans DROP a label that only repeated the
      visible text. `aria-label` on a bare `<span>`
      with no role: ARIA ignores it, so the friendly date (« mer. 16 sept. ») is not
      announced at all and the raw contents are read instead. The label was written to
      help and does nothing.
- ~~❓ **`color-contrast`, 78 states.**~~ ✅ **closed at 0 states, 2026-09-15** (`cc28ae3e`
  → `a6849743` → `a6bcbcf5` → `59e01034`; §3's first entry has the five causes). The
  measure pills kept their colour AND pass: the fix was the ink tier, not the palette. One
  accepted gap remains and is documented at the primitive: the `Avatar` initials disc.
  Original triage note, kept for the reasoning: needs triage, not a blanket fix: the measure pills
      are colour-coded ON PURPOSE (`measureColors.ts` — colour IS the information), so
      some of these are a real trade-off, while the kitchen day labels look like a plain
      miss. Worth a pass of its own.
- ~~❓ **`meta-viewport`, all 154 states.**~~ ✅ **answered 2026-09-16 by Marc: keep
  no-zoom.** « I want an app where you don't need to zoom, where we use the space
  accordingly on all media types. » The rule is now stated in §D: readability is a
  LAYOUT and TYPE-RAMP obligation on every surface (the three text tiers are the
  recourse), never a `maximum-scale` change. The axe rule stays in the census as a
  known, accepted finding. Declined, not deferred — don't re-propose without a new
  observation. Original note: the app disables pinch-zoom. Defensible for a wall kiosk,
  a WCAG 1.4.4 failure for the phone, and it is one line either way.


### L. The public-app hardening pass — planned 2026-09-16, thirteen items in priority order

**Where this came from.** Asked « what improvements, overlooked things, cut corners or
brand new ideas do you have », then « dress a priority list », then « plan each of those
thoroughly, no cut corners, then work through each 1 by 1 ». Every item below was found
by reading code, not documents, on 2026-09-16 — and each one records WHAT was verified
so the next session can re-grep the claim instead of trusting it. Ranked by user harm,
then by cost. §K's waves stay the product plan; this section is the hardening that a
stranger's account needs before the gate opens, and most of it lands inside §K's waves.

**Implementation order differs from the priority order where one item needs another:**
1 → 2 → 3 → 5 → 12 → 6 → 7 → 8 → 9 → 4 → 11 → 13, with 10 recorded as a `[~]` (its
honest answer depends on Wave 5). Item 3 (the real-D1 harness) moves up because every
later item gets its proof from it. Each item ends with the standing gates (typecheck ·
test · build · the guard proven RED on the defect it was written for · STATE.md in the
same commit) and its own commit.

#### L1. A password reset ends every other session — and « Se déconnecter partout »

**Verified:** the session cookie is `{ e: email, x: expiry }` signed with the global
secret (`functions/_lib/auth.ts` `issueSession`); `functions/api/auth/reset.ts` rewrites
`password_hash` only. A session on a lost phone stays valid for its full 30 days after the
owner resets. There is no change-password endpoint at all (`grep -rn password functions/api`
finds signup, login, reset, claim) — a signed-in operator cannot change their password
without the email loop.

**Design.**
- Migration `0134_operator_session_version.sql`: `ALTER TABLE operators ADD COLUMN
  session_version INTEGER NOT NULL DEFAULT 1;` — a counter, not a secret: bumping it is the
  revocation. Sandboxes inherit the default; the sweep is unaffected (same table).
- The session payload gains `v`. A token without `v` (every cookie minted before this)
  reads as `v = 1`, so nobody is signed out by the deploy — only by a bump.
- `auth.ts` grows ONE door for minting: `signInAs(env, email)` reads the row's version and
  returns the cookies; `issueSession` becomes module-private. A grep guard
  (`session-issue-rule.test.ts`) fails the build if `issueSession(` is called outside
  `auth.ts`, so a handler cannot mint a version-less cookie by habit. Six call sites move:
  login, signup, reset, demo, demo/claim, operator-join.
- `currentEmail` (used by `resolveActor` and `auth/me`) is replaced by `currentOperator(env,
  request)` which reads `household_id, session_version` in the one query it already made and
  returns null on a version mismatch. `auth/me` MUST use it too — otherwise the shell says
  « signed in » while every other call 401s, which is the stranded-kiosk shape this file
  already records under C-quater.
- Bumps: `auth/reset` (always — that is the whole point), the new `POST /api/auth/password`
  `{ current, next }` (L12), and the new `POST /api/auth/sessions/revoke` `{ password }` —
  « Se déconnecter partout » — which bumps the version and re-issues THIS device's cookie
  in the same response, so the person pressing the button stays signed in. Both need the
  password (L5's `requirePassword`), because a stolen unlocked phone must not be able to
  lock the owner out.
- Client: `api()` already routes a 401 to `onAuthLost` → the persisted cache and outbox are
  wiped (OFFLINE.md). Nothing to add; the e2e pins that a 401 after a bump lands on /login.

**Guards + tests.** `route.test.ts` gains: a token with a stale `v` is rejected (RED first
by planting `v: 1` against a row at 2); a legacy token without `v` still resolves. A D1
harness case (L3): reset on device A → device B's next call is 401, A's new cookie works.
e2e `password-reset.spec.ts` stays as is. PARITY F40 footnote updated.

- [x] Migration 0134 + `signInAs` + `currentOperator` + the version check in `resolveActor` and `auth/me` — `functions/_lib/auth.ts`, `household.ts`, `api/auth/me.ts`
- [x] `session-issue-rule.test.ts` proven red on a planted `issueSession(` in login.ts (reported `login.ts:39`); the stale-version case in `route.test.ts` proven red by disabling the comparison (two cases fell, the legacy-cookie one among them)
- [x] `POST /api/auth/sessions/revoke` (password, bumps, re-issues) + `POST /api/auth/password` — `api/auth/sessions.ts`, `api/auth/password.ts`, `_lib/sudo.ts` (+ `sudo.test.ts`, five cases); UI in L12
- [x] `reset.ts` bumps in the same batch as the hash; PARITY note 87 extended

#### L2. Login, signup, forgot, reset, demo mint and pairing get a rate limit

**Verified:** `grep -rn "rate\|429" functions/api/auth` — nothing. `guestRate.ts` caps only
the writable guest kinds, by a `use_count` column. PBKDF2 at 100 000 iterations
(`_lib/password.ts`) is fine only if attempts are bounded. `demo.ts` mints a whole seeded
household per POST with no per-IP bound beyond the global cap.

**Design.** Cloudflare's Workers **rate-limiting binding** — no table, no sweep, no CPU:
```toml
[[ratelimits]]
name = "LIMIT_IP"
namespace_id = "1001"
simple = { limit = 30, period = 60 }
[[ratelimits]]
name = "LIMIT_KEY"
namespace_id = "1002"
simple = { limit = 6, period = 60 }
```
- `_lib/rateLimit.ts`: `overLimit(env, 'ip' | 'key', key)` → boolean. The bindings are
  OPTIONAL in `Env` (like `AI`) — unset means allow — but `health.rateLimit` reports it and a
  unit test pins that `wrangler.toml` declares both, so prod cannot silently lose them. The
  API is documented as permissive and per-colo; that is a bound on brute force, not an
  accounting system, and it is the right tool for exactly that.
- Keys: login `ip:<CF-Connecting-IP>` (30/min) AND `login:<email>` (6/min); signup `ip`;
  forgot `ip` + `forgot:<email>`; reset `ip`; demo `demo:<ip>` (6/min — a sandbox mint
  costs a seed); pair/start `ip`; operator-join `ip`; demo/claim `ip`; L5's
  `requirePassword` charges `sudo:<email>` so the password doors are not an oracle.
- Over the limit → `429` with `Retry-After: 60` and « Trop d’essais. Réessaie dans une
  minute. » (`json.ts` `tooMany()`); the login/signup/forgot pages already surface the
  error body's sentence.

**Guards + tests.** `rateLimit.test.ts` (fake binding: under → allow, over → refuse, unset →
allow + health false); login/signup handler cases with the limiter exhausted → 429 (RED by
running them without the check); `wrangler.toml` declares both bindings. The D1 harness
(L3) gets a case: seven bad passwords in a row, the seventh is 429 even with the right
password.

- [x] `[[ratelimits]]` ×2 in wrangler.toml (accepted by `wrangler deploy --dry-run`: « env.LIMIT_IP (30 requests/60s) »), `Env` types, `_lib/rateLimit.ts`, `tooManyRequests()` now carries `Retry-After: 60`, `health.rateLimit` + a row on the health card
- [x] Wired into login (ip, then `login:<email>`) · signup · forgot (ip, then `forgot:<email>`) · reset · demo · demo/claim · pair/start · operator-join · and `requirePassword` charges `sudo:<email>`
- [x] `rateLimit.test.ts` (six cases incl. the wrangler.toml declaration) + `auth/login.test.ts` (the limiter answers before the DB is touched — the stub THROWS on any use; proven red by deleting the two checks: three cases fell). Login, signup, forgot, reset, join and claim show « Trop d’essais. Réessaie dans une minute. » on a 429, both languages

#### L3. Handlers run against a REAL D1 in a test — and the tenant-isolation sweep is its first customer

**Verified:** `route.test.ts` stubs D1 with one row answering every `.first()`; all 153
Playwright specs stub every `/api/*` (77 of them via `route()`); `grep -rl "vitest-pool-workers\|miniflare"` finds nothing. 132 migrations and 519 SQL statements against
tenant tables (scanned 2026-09-16) are validated only by hand probes on the local Worker
and by production. My scan found 37 statements with no household predicate; the three
spot-checked (routine runs, habit marks, chore participants) are guarded by an ownership
read upstream and the shared-trip ones by the capability model — no defect, and NOTHING
holds it. This is the one bug a public app cannot survive.

**Design.**
- `@cloudflare/vitest-plugin` 1.1.11 (peer `vitest ^4.1.0` — we are on 4.1.8) running the
  real `worker/index.ts` in workerd with a real D1 + R2 + the DO. A SECOND vitest config
  (`vitest.d1.config.ts`) so the 2 289 pure tests keep their happy-dom pool untouched:
  `include: ['{functions,worker}/**/*.d1.test.ts']`, `cloudflareTest({ wrangler: { configPath:
  './wrangler.toml' }, miniflare: { bindings: { SESSION_SECRET, TEST_MIGRATIONS:
  readD1Migrations('functions/db/migrations') } } })`, `setupFiles: applyD1Migrations`.
  `npm run test:d1`; CI runs it after `build` (the `[assets]` block points at `dist/`).
  Known risk to resolve in-session: `[assets]` and `[ai]` in the real wrangler.toml — if the
  plugin refuses either, the fallback is a `wrangler.test.toml` that is asserted by a test to
  declare the SAME bindings as the real one (never a hand-copied drift).
- `functions/test/d1.ts` helpers: `household(name)` → signup through the real endpoint
  (seeds sample data, returns a `fetch` that carries cookie + CSRF); `dump(hh)` → the
  takeout JSON through `dumpHousehold`.
- **The isolation sweep** (`worker/isolation.d1.test.ts`): households A and B. B walks
  EVERY route in `worker/routes.ts`'s table: each GET with A's ids in the path/query, each
  POST/PATCH/DELETE with a body carrying A's ids under every id-shaped field name the
  handlers read (`id`, `memberId`, `routineId`, `taskId`, `recipeId`, `noteId`, `eventId`,
  `contactId`, `groupId`, `habitId`, `listId`, `itemId`, `carnetId`, `petId`, …, harvested
  from the handler sources by grep so a new field name joins automatically). Three
  assertions: no response body of B's contains any id or title from A's dump; `dump(A)`
  before and after are identical; no request returned 500. RED first by deleting one
  `AND household_id = ?` from a handler.
- First customers besides the sweep: auth (signup → login → reset → stale version → 429),
  the demo mint + the TTL sweep (the bug nobody noticed for weeks because nobody minted),
  and the nightly `scheduled()` (L7).

- [x] `@cloudflare/vitest-plugin` 1.1.11 + `vitest.d1.config.ts` (reads the REAL `wrangler.toml` — `[assets]`, `[ai]`, the DO and the two rate limiters all resolved without a test-only twin; `AI` cannot be unbound, so the sweep switches the household's AI OFF and asserts `health.ai === false` first) + `functions/test/apply-migrations.ts`; `npm run test:d1`, ~30 s for 13 cases; CI runs it after `check:bundle`
- [x] `functions/test/d1.ts` (`household()` through the real signup, `login()`, `dump()`, `idsOf()`) — every request goes through `exports.default.fetch`, i.e. the CSRF gate, the guest scope and `authed()`
- [x] `worker/isolation.d1.test.ts` — B walks every route × method (from `ROUTES`, now exported by `worker/routes.ts`) naming one of A's ids per table in every id-shaped field (`functions/test/idFields.ts`, kept complete by a node-side grep guard); asserts no A id or marker in any response, `dump(A)` unchanged, no 500 outside the outbound routes. **Green on the real code**; proven red by dropping `AND household_id = ?` from the events read-by-id: « GET events → 200 » with two of A's ids in the body
- [x] `worker/auth.d1.test.ts` (six: wrong/right password, revoke-everywhere keeps this device and ends the other, change-password, CSRF, forgot 503, the **real 429 on the seventh guess** — miniflare's limiter counts) and `worker/demo.d1.test.ts` — **which found, on its first run, that the sandbox sweep STILL deleted nothing**: `shares`, `shared_trips` and `shared_trip_notes` sat in `HOUSEHOLD_TABLES` with no `household_id` column (`source_/owner_/author_household_id`), one « no such column » rolled back the whole batch, the sweep's catch swallowed it. `SCOPE_COLUMN` + `scopeColumn()` fix the delete AND the trip-id sub-sweep AND the R2 inventory (the shared-trip blobs were never freed either); a live-schema case now asks `pragma_table_info` for every scope column — the pure guard could only know a table exists

#### L4. The door's eager graph (already boxed in Wave 2 — sized there; executed here)

**Verified:** `router.tsx` imports `HubLayout` and `Board` statically (94 imports under
Board alone); `main.tsx` pulls the outbox, persist, realtime and tour. The marketing door
pays for the whole hub: 487 KB gz / 78 requests, 11 s on Slow 4G (Wave 2's table).

**Design.** `HubLayout` and `Board` become `lazy()` like every other page. The kiosk's
offline reboot is safe because `check-bundle.mjs` already forces every lazy chunk into the
SW precache — the cost is one more round trip on a warm boot, which `npm run e2e:sw`
(the prod-bundle SW harness) proves still works. Then: walk the entry's static closure from
`dist/.vite/manifest.json` (turn `build.manifest` on) and assert in `check-bundle.mjs` that
neither `pages/Board.tsx` nor `components/HubLayout.tsx` is in it — a ratchet, so the door
cannot quietly re-grow the hub. Re-base `EAGER_TOTAL_BUDGET` to the new number. Look at the
`drawpad` group with the manifest in hand: if it is Rolldown's commons wearing the group's
name, rename the group to what it is. Re-run `coldstart.mjs` (kept in this session's
scratchpad, copied into `e2e/` by L9) against production after the deploy and replace Wave
2's table.

- [x] `HubLayout` + `Board` lazy in `router.tsx` (the whole route tree was already inside ONE `<Suspense>`, so nothing else moved). The door's static closure, walked from Vite's own manifest: **70 chunks / 1131 KB → 7 chunks / 726 KB** — 63 round trips a stranger no longer pays for before the first headline. `npm run e2e:sw` green (all five, incl. the cold offline launch), the full local suite green
- [x] `build.manifest` on + the closure walk in `check-bundle.mjs`: a chunk-count ratchet (≤10), a size budget (800 KB) and the two files BY NAME (each must own a chunk — a static import has no manifest key — and must not be reachable statically from the entry). **Proven red** by restoring the static imports: four messages, `70 chunks > 10`, `1131 KB > 800 KB`, and both files named. `EAGER_TOTAL_BUDGET` ratcheted 700 → 620 KB
- [x] Cold start re-measured on production and Wave 2's table extended with the after (78 → 17 requests on the door; Slow 4G first paint 11.2 s → **7.1 s**)

#### L5. The irreversible doors ask for the password

**Verified:** STATE.md's own idle row says « a wall tablet is often signed in as the
operator » (surface `mobile`), and the Wave 4 delete plan confirms by household NAME. A
name is not a lock on a tablet anyone in the house can reach. Doors that exist or are
about to: revoke a co-operator (`DELETE /api/operator-invite`), sign out everywhere (L1),
change password (L12), restore a backup (L8 — it wipes the current content), delete the
household (Wave 4, not built here).

**Design.** `_lib/sudo.ts` `requirePassword(env, actor, password)` → null or a 403
« Mot de passe requis » / « Mot de passe invalide », verifying against the operator row's
hash (or `LOGIN_PASSWORD` for a legacy row, exactly as login does), charged against L2's
`sudo:<email>` key. Client: EXTEND `useConfirm` with an optional `input: { kind:
'password', label }` — the dialog gains one field and resolves to the typed value — rather
than a second dialog; the specimen in `/dev/kit` shows both shapes; `confirmCopy.test.ts`
keeps the copy honest. A sandbox operator has no password anyone knows → these doors hide
under `useSandbox()` (they have nothing to revoke anyway).

- [x] `requirePassword` + unit cases (right, wrong, legacy row, missing, kiosk/guest refused, row gone) — `_lib/sudo.ts` + `sudo.test.ts` (landed with L1; charges L2's `sudo:<email>` bucket)
- [x] `useConfirm` grew `input: { kind: 'password', label }` (resolves to the string or null; Enter submits; empty disables) — `lib/confirm.tsx`, `.confirm__input`, a DevKit specimen under Overlays & chrome, a COMPONENTS.md row
- [x] Co-operator revoke asks for it: `operator-invite` DELETE-with-email runs `requirePassword`; `CoOperatorsSection` types it into the confirm and reads 403/429 as one sentence; `operator-join.spec.ts` pins the disabled-until-typed button and the `{ email, password }` body; ACTIONS note ²⁵, PARITY note 71

#### L6. Security headers — enforce the safe four now, CSP report-only with a report door

**Verified:** `grep -rn "Content-Security-Policy\|Strict-Transport\|X-Frame\|Referrer-Policy\|Permissions-Policy" worker functions` — nothing. Same-origin frames exist
(`CarnetDocs` frames `/api/img/<key>` PDFs), one cross-origin frame (FlippPager frames
flipp.com — their policy, not ours), Google Fonts, flyer/NASA/recipe images from any https
host, Tesseract's worker, `blob:` media.

**Design.** One `secure(res)` in `worker/index.ts` applied to every response (assets and
API): `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(self), microphone=(self), geolocation=()`, and
`Content-Security-Policy: frame-ancestors 'self'` (enforced — nothing legitimate frames us
from another origin; `/cast` is opened directly). Plus the FULL policy in
`Content-Security-Policy-Report-Only` with `report-uri /api/csp-report` — a CSRF-exempt,
rate-limited (L2) POST that logs the violation (observability keeps it) and answers 204.
The policy starts from what the code actually loads (self, fonts.googleapis/gstatic, https:
images, blob:/data: media and workers, wss: self, frame-src self + flipp.com) and gets
tightened to enforced only after a week of reports, in a later commit — enforcing blind
would be the cut corner.

- [x] `withSecurityHeaders()` (`functions/_lib/securityHeaders.ts`) wraps EVERY response at the Worker's default export (`app.fetch` → the wrapper; a 101 upgrade passes untouched): HSTS · nosniff · Referrer-Policy · Permissions-Policy (camera/mic self, no geolocation — the app never asks) · `Content-Security-Policy: frame-ancestors 'self'` enforced. Unit cases (JSON, redirect, 101) + `worker/headers.d1.test.ts` through the real entry (an API answer, the SPA shell, a client route, a 401). The SW harness is Vite preview, not the Worker — it cannot see headers; the D1 case is the guard
- [x] `Content-Security-Policy-Report-Only` written from what the code actually loads (Google Fonts, tesseract.js's worker + core + trained data on cdn.jsdelivr.net, https: images, blob: media, flipp.com frames, the same-origin socket) with `report-uri /api/csp-report` — a CSRF-exempt, guest-allowed, per-IP-limited, log-only 204 (`functions/api/csp-report.ts`, both wire shapes). **Enforce it only after a week of reports** — the next box, not this one

#### L6-bis. The door had no security headers — and it was never a stale cache

Verified on production 2026-09-17 after the deploy, and the first reading was WRONG in a
way worth keeping. `/` answered `cf-cache-status: HIT` with **none** of the six headers
while `/api/health` and `/board` had all six, so it read as a stale CDN copy and the box
said « purge it ». A purge would have changed nothing.

The real mechanism, measured path by path before touching anything:

| path | matches a real file in `dist/`? | headers |
| --- | --- | --- |
| `/` → index.html · `/index.html` · `/manifest.webmanifest` | yes | **0** |
| `/board` · `/zzz-nope` (SPA fallback) · `/api/health` | no | 6 |

Cloudflare's assets router **serves a request that matches a real file without invoking
the Worker at all** — « Cloudflare will first attempt to serve static assets if one
matches the incoming request » — so `withSecurityHeaders` never ran for the marketing
door. Purging would have re-served the same header-less file on the next request.

`worker/headers.d1.test.ts` passed the whole time, and that is its lesson: it calls
`exports.default.fetch()` directly, so it proved the WORKER emits the headers and never
that the DEPLOYMENT does. A test that bypasses the router cannot see the router.

**The fix is the other half of the same guarantee**: a `_headers` file in the assets
directory, which Cloudflare applies to exactly the responses the Worker never generates
(and, it documents, to no others — so the two halves cannot double-set). Generated by
`vite.config.ts` from the SAME `ENFORCED` list the wrapper uses, like `sw.js`.

And it surfaced a live hazard: `_headers` and `.vite/manifest.json` (the door-closure
check's own input, added earlier the same day) had both entered the service worker's
**CRITICAL** precache list. Cloudflare consumes `_headers` and never serves it, so the
kiosk's offline install would have 404ed on a must-succeed entry — the NFR-OFFLINE-1
failure that list exists to prevent. `npm run e2e:sw` could not have caught it: `vite
preview` serves `dist/` verbatim, `_headers` included. Only production tells the truth.

**Verified on production after the deploy**: `/`, `/index.html`,
`/manifest.webmanifest`, `/theme-bootstrap.js`, `/board` and `/api/health` all answer
with six, and `/_headers` itself is still not served. The first check was premature —
`gh run watch` had latched onto the PREVIOUS run, so « still zero » was measured against
a deploy that did not contain the file. Watch the run whose `headSha` you pushed.

**What the report-only policy sees now that it reaches the door** — and it is the whole
reason not to enforce yet: on one run the door reported two blocked INLINE scripts.
Neither is ours (`index.html` has no inline script; both its tags are `src=`) — the
edge injects them, and they did not appear on the next run, so they are intermittent.
Enforcing `script-src` today would therefore break the marketing page some of the time
and pass every local test. The walk now COLLECTS report-only violations and attaches
them instead of failing on them: report-only blocks nothing, so a violation is a finding
about the policy, and a weekly walk that fails on findings is a walk nobody reads. Those
attachments (and /api/csp-report's logs) are the input to the enforce decision.

**And the walk immediately caught a regression from L11**: the household-timezone sync
asked `/api/household` on the marketing door, where a stranger has no credential — a 401
in their console on every load, the same shape as the socket the walk found the first
time. Gated on having a credential (signed-in · paired kiosk · link guest).

The per-push guard for that class now exists, and its FIRST version was useless: it
watched for 401s, and passed with the defect present, because `mockApi` answers
`/api/household` with a 200 fixture — **a stubbed harness can never show a status the
real server would have sent.** Rewritten to assert on the REQUESTS made (the door may
ask `auth/me` and `health`, nothing else), it goes red naming `GET /api/household`.

- [x] `_headers` generated from `ENFORCED`; both build metadata files excluded from the
      precache; two new checks in `check-bundle.mjs` (the file exists and carries the
      headers; neither is precached) **both proven red** on their own defect; a unit case
      pins the generated source against `ENFORCED` and Cloudflare's 2 000-character line
      limit; `e2e:sw` green.

#### L7. The nightly cron sweeps sandboxes and TELLS someone when it fails

**Verified:** `worker/index.ts` `scheduled()` backs up every household and logs failures to
a console nobody opens; the sandbox sweep runs only on a mint (`demo.ts`), which is exactly
how it stayed broken from 0102 to 2026-09-16. `functions/_lib/mail.ts` exists since Wave 3.

**Design.** Extract `_lib/nightly.ts` `runNightly(env, now)` → a report `{ households,
backed, failed: [...], sandboxesSwept, sandboxesStale }`; the cron also runs
`sweepExpiredDemoSandboxes(env, now, 50)` and counts sandboxes older than the TTL that
SURVIVED it (`stale` > 0 is the sweep-is-broken signal). Then ONE email through `sendMail`
to `ALERT_EMAIL` (new optional var, set in the dashboard, never in the repo) when anything
failed or `stale > 0` — and every Monday a one-paragraph « Babillard va bien » digest, so
the alert channel is itself exercised weekly (an alert path never fired is the sweep bug in
a new coat). Unset `ALERT_EMAIL` → log only, and `health.alerts: false`.

- [x] `functions/_lib/nightly.ts` — `runNightly()` (every side effect behind a seam: list, backup, sweep up to 50, count alive + STALE) + `alertFor()` (pure: a failure, a stale survivor or no bucket → an alert any night; a quiet Monday → « Babillard va bien »; else nothing) + `nightly()` (send to `ALERT_EMAIL` through the mail seam, else log + warn). The cron handler is one line. `sweepExpiredDemoSandboxes` returns its count and LOGS a failed delete; `countStaleDemoSandboxes` is the sweep-is-broken number. `health.alerts` + a health-card row; `ALERT_EMAIL` documented in DEPLOY.md + CLAUDE.md. Ten unit cases
- [x] `worker/nightly.d1.test.ts` — `runNightly(env)` against the real D1 + R2: a real household's backup lands in the bucket as the takeout dump, an aged sandbox is swept, zero stale survivors, the swept sandbox got no backup

#### L8. Takeout import — the one restore door

**Verified:** `takeout.ts` dumps; the cron keeps 14 dated JSONs per household under
`backup/<hh>/` in R2; NOTHING reads a backup back (`grep -rn "backup/" functions worker src`
→ only the writer). `DEPLOY.md` has no restore procedure. A backup never restored is a
hope.

**Design.** `_lib/restore.ts` `restoreHousehold(env, householdId, takeout)`:
1. Validate (`format: 1`, `tables` of arrays of objects, body ≤ 20 MB).
2. Wipe the CONTENT tables — the household's tables minus takeout's own `EXCLUDE` set
   (operators, devices, guests, shares, pairing, idempotency, ai_errors, domains stay), the
   same statements `deleteDemoHousehold` uses, factored into `contentDeleteStatements()`
   so the two cannot drift.
3. Ids: after the wipe, if any id in the dump collides with a row anywhere in the DB
   (another household's — the dump came from elsewhere), remap EVERY id to a fresh one and
   rewrite every soft reference by token: ids are 12 chars of a 56-letter alphabet, so a
   token-equal scan of every string cell (JSON columns included — `rotation_json` holds
   member ids) is exact. No collision → ids kept, so a same-household restore keeps device
   preferences that remember a face.
4. Insert with the INTERSECTION of the dump's keys and the live table's columns (a backup
   from before a migration gets defaults; a dropped column is ignored); `household_id`
   rewritten; the `households` row's preference columns updated (id, tier, status,
   created_at, invite_nonce kept). Chunked `batch()` calls; a failure mid-way is recovered
   by re-running the same restore — documented, and the nightly copy is untouched.
5. R2 keys are not remapped: the blobs are still there for a same-household restore, and a
   cross-household one keeps working while the source lives.
- Endpoints: `GET /api/takeout/backups` (dates), `POST /api/takeout/restore` `{ password,
  source: 'backup', date } | { password, source: 'file', takeout }` — operator-only,
  `requirePassword` (L5), `write-rule` ALLOWED (an outbox replay of a restore is exactly
  wrong), realtime → every key. Client invalidates everything on success.
- UI in the existing takeout card: « Restaurer une copie » — the nightly dates as rows,
  and « Depuis un fichier ». The confirm says what is lost: « Remplacer tout le contenu de
  la maisonnée par la copie du 12 septembre ? Ce qui a été ajouté depuis disparaît. Les
  appareils et les comptes restent. » DEPLOY.md gets the procedure.

- [x] `functions/_lib/restore.ts` — validate → wipe the CONTENT tables (the sweep's own statements, `HOUSEHOLD_TABLES` minus `TAKEOUT_EXCLUDE`, both now exported so the two cannot drift: devices, guest links, shares and the operator accounts are never touched) → ids kept unless one collides, else ALL remapped by token (JSON columns included) → insert with the live-column intersection, parents first, self-refs in a second pass → the household row's preferences, never its identity. Ten unit cases
- [x] `GET takeout/backups` (the R2 copy list) + `POST takeout/restore` (`{source:'backup',date}` | `{source:'file',takeout}`), operator-only + `requirePassword`; routes, `write-rule` ALLOWED with the reason, realtime keys (a restore nudges every other device) — and `worker/restore.d1.test.ts` against a real D1 + R2: **a household restored from its own dump is byte-for-byte what it was** (which is what made the forced `updated_at` stamp wrong, and it went), a dump restored into ANOTHER household gets fresh ids with the soft refs followed while the source is untouched, a real nightly copy restores, a bad copy is 400 and a missing one 404
- [x] « Restaurer une copie » folded under the export (a `Disclosure`: it is the rarer half of the same question) — a row per nightly date + « Depuis un fichier… », the password confirm naming what is lost AND what is not; hidden for a sandbox. `e2e/takeout-restore.spec.ts` (six cases — the list, the confirm + POST, cancel posts nothing, a 403 is one sentence, no copies says so, a kiosk sees no card); DEPLOY.md « Restaurer une copie »; ACTIONS rows + note ²⁶. The spec caught a real a11y slip on its first run: the hidden file input carried the same accessible name as its button, so there were TWO controls — the repo's `hidden` convention (ContactPhotos, NoteEditor) fixes it

#### L9. The stranger's walk and the cold-start clock run weekly against production

**Verified:** `walk.mjs` and `coldstart.mjs` live in a session scratchpad
(`…/0b9070c3…/scratchpad/`) — copied into this session's — and nowhere in the repo. The
walk found four defects in one day.

**Design.** `e2e/stranger-live.spec.ts` under `e2e/stranger.config.ts` (the Flipp
contract's shape: no Vite, no stubs, production URL) — the walk's steps as assertions
(every step's content within 10 s, zero 4xx/5xx from our API, zero console errors, the one
list write lands, `/garder` renders) on both profiles, plus the cold-start table written
to the report as JSON. `.github/workflows/stranger-walk.yml`: Mondays 07:30 UTC +
dispatch; a red run emails the repo owner the way every scheduled workflow does. Each run
mints a sandbox that L7's nightly sweep removes.

- [x] `e2e/stranger-live.spec.ts` + `e2e/stranger.config.ts` (laptop 1440 + iPhone 13, no Vite, no stubs, `BABILLARD_URL` else production) + `npm run e2e:stranger`. **Run against production, and it earned its keep on the first evening** (below)
- [x] `.github/workflows/stranger-walk.yml` (dispatch + Mondays 07:30 UTC, after the matrix and the Flipp contract), `playwright.config.ts` testIgnore, CLAUDE.md's commands block

#### L10. Signup stops revealing which emails exist — with Wave 5, not before

**Verified:** `signup.ts:32` answers 409 « Un compte existe déjà ». Forgot was carefully
made constant; signup was not.

- [~] **A constant signup answer is impossible while signup signs you in.** A new address
  gets a `Set-Cookie`; an existing one cannot — the difference is the leak, whatever the
  body says. The honest fix is Wave 5's email verification: signup then answers « Regarde
  ta boîte courriel » for EVERY address, a new one gets the verify link and an existing one
  gets « tu as déjà un compte, connecte-toi ou réinitialise ». Until then the enumeration is
  bounded by L2's per-IP limit on signup (6 tries a minute is not a harvest). Recorded here
  so it is built INTO the verification flow rather than bolted on after.

#### L11. The household's timezone is a column, not a constant

**Verified:** `HOUSEHOLD_TZ = 'America/Toronto'` (`_lib/ids.ts:56`) is the default of every
day helper, reached from board, chores-ledger, events, routines, askContext, recur,
whenparse, upkeep, sampleData; the client's `lib/localDay.ts` uses the browser's zone. A
household in Moncton gets the wrong « aujourd'hui » at 23:30 and the wrong « Bientôt »
hour.

**Design.** Migration `0135_household_tz.sql`: `households.tz TEXT NOT NULL DEFAULT
'America/Toronto'`. `resolveActor` reads it in the queries it already makes (`Actor.tz`),
and every server call of a day helper passes `actor.tz` — a grep guard ratchets
`HOUSEHOLD_TZ` to its definition + tests, so a new handler cannot fall back to Toronto by
omission. `PATCH /api/household { tz }` validated with the cached `wallFmt(tz)` (throws on
an unknown zone); the household card in Réglages gains a select (Canada's zones first,
then `Intl.supportedValuesOf('timeZone')`). Client: `auth/me` and `/api/household` carry
`tz`; `lib/localDay.ts` reads a `setHouseholdTz()` fed from there, defaulting to the
browser's — the ONE formatter home already caches per zone. D1 case: a household at
`America/Vancouver` asked for the board at 06:30 UTC gets yesterday's date.

- [x] Migration 0135 (`households.tz`, defaulting to America/Toronto so nothing moves for anyone) + `Actor.tz` + **the zone as per-request AMBIENT, not a threaded parameter** — the plan said thread `actor.tz` through every server call of a day helper, and measuring first said no: ~190 call sites across 40 files, most of them deep inside pure modules (recur, upkeep, whenparse, transfers) whose own callers would each have needed a new parameter. `functions/_lib/tz.ts` establishes it once in `authed()` (AsyncLocalStorage — proven in workerd before it was written, and NOT a module variable: one isolate serves many households concurrently) and the four helpers in `ids.ts` read it as their default, so every existing call site became correct with no edit and a new one cannot forget what it never has to pass
- [x] `PATCH /api/household { tz }` validated against Intl (an unknown zone makes every date helper throw — it would take the household down, not one setting; `intl-rule` ALLOWED with the reason: a one-shot probe on write, deliberately uncached) · the Réglages select beside the household's name (Canadian zones first, then everything Intl knows) · the client mirrors it (`setHouseholdTz` ← `/api/household`, so a phone carried elsewhere still reads the household's day) · `worker/tz.d1.test.ts` — five cases through the real runtime, including **two households answering concurrently without their zones crossing**, which is the whole reason it is AsyncLocalStorage. Its own first assertion divided by 86400 and expected 1: two midnights three zones apart are **21 hours** apart, the fixed-86400 trap CLAUDE.md warns about, caught by the test written for it

#### L12. « Mes connexions » — sign out everywhere, change my password

**Design.** One new card in Réglages ▸ Système ▸ Appareils & accès (`access: 'operator'`,
stacked under the devices/co-operators cards — C-15, never a new pill): a sentence, then
« Changer mon mot de passe » (current + new + confirm → `POST /api/auth/password`, bumps
the version, re-issues this cookie) and « Déconnecter partout ailleurs » (`useConfirm`
with the password input → `POST /api/auth/sessions/revoke`). Hidden for a sandbox, a
kiosk and a guest. `[~]` A LIST of sessions with device names is not built: sessions are
stateless by design (no row to list) and the revoke-all door is the whole case; a list
would need a sessions table that nothing else wants.

- [x] `SessionsSection` (« Mes connexions », `settings ▸ tablets` after « L'autre parent », `access: 'operator'`, hidden for a sandbox): « Changer mon mot de passe » (a `Disclosure` form → `POST auth/password`, re-issues this cookie, `auth.refresh()`) + « Déconnecter partout ailleurs » (the password confirm → `POST auth/sessions/revoke`); `operatorHelp.sessions` on the share-access card; i18n `t.sessions` both languages; `write-rule` ALLOWED ×2 with the reason; `e2e/sessions.spec.ts` (five cases: the card, mismatch stays on the page then posts, the password confirm posts, a 403 is one sentence, kiosk + guest never see it); ACTIONS rows « Account · change my password / sign out everywhere else » + note ²⁵. `[~]` no sessions LIST (stateless by design)

#### L13. Dependabot and the compatibility date

**Verified:** no `.github/dependabot.yml`; `compatibility_date = "2024-12-30"`.

- [x] `.github/dependabot.yml` — npm weekly (Mondays, minor+patch GROUPED into one PR so a review is a review, majors one at a time, 5 open max) + github-actions monthly. Nothing watched this repo's dependencies before; CI gates a Dependabot branch exactly as a push
- [x] `compatibility_date` 2024-12-30 → **2026-09-01** — a PIN, not a version: two years of runtime fixes the Worker was deliberately not receiving. Verified by `npm run test:d1` (the whole Worker in workerd, 22 cases), `wrangler deploy --dry-run`, and production after the deploy

