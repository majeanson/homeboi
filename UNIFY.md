# UNIFY — one word, one mechanism, one door per idea

> **A week (2026-09-09 →) of unifying, simplifying and naming things once, without
> dropping a single feature.** Read [`STATE.md`](./STATE.md) for where this sits against
> everything else; read [`CLAUDE.md`](./CLAUDE.md) before writing code.

> **Checkbox convention** (repo-wide, `STATE.md` §2): `- [ ]` open work · `- [x]` done,
> with the commit that settles it · `- [~]` reviewed and parked, **with the why** · `❓` an
> open question, not a task. Nothing else uses `- [ ]`.

> **The numbers below are CENSUS RESULTS, not claims.** Each says how it was measured and
> when. Re-run before building on one — this repo's most expensive habit is trusting a
> ledger cell that was true last week (`STATE.md` §5-1: a third of the work picked up in
> one session was already done).

---

## Why this week exists

The features are strong. The **vocabulary** is not: the same idea wears different words,
different doors and different mechanisms depending on where you meet it, and until today
nothing wrote down which one was right.

Three audits on 2026-09-09 found, and I re-verified before writing this:

- The app's own « one word per idea » rule (`STATE.md`:394) was **false**. The delete
  family ran six verbs, and one key was spelled two ways: `liste.clearChecked` = « Vider
  les cochés » vs `todos.clearChecked` = « Effacer cochées ».
- **Five delete mechanisms** exist where `ACTIONS.md` documents four. The undocumented one
  (`lib/undoRemove.ts`) splices the query cache — the resurrection bug class this repo has
  already fixed twice — and two of its six sites touch polled keys.
- Things you can **see but not fix where you see them**: a corvée and a projet maison have
  no edit or delete outside Réglages; routine and habitude only inside their editor.
- **Of 108 `EmptyState` sites, 5 offer a door**; every form scene is help-free.
- The **returning user** is the weakest of the three timing windows: everything that
  re-orients lives behind Réglages ▸ Découvrir, which is not where anyone returns to.

---

## Working rule for the week — how e2e is handled

Decided 2026-09-09, because a week of renames touches a lot of specs and E2E here is
**decoupled** (it runs after the deploy, so it never blocks a push — and a suite left red
stops being a signal exactly when the edits are most invasive).

| Kind of e2e change | When | Why |
| --- | --- | --- |
| **Label assertions** (days 2–3) | **Same commit as the rename** | `glossary.test.ts` already NAMES the specs pinning a dying label, so finding them is free and the fix is one line. This is what keeps the suite trustworthy all week. |
| **Structural** (days 5–6: doors, empty states) | **Batched to day 7** | Those surfaces move twice; rewriting a spec against a moving target is waste. |
| **Running the suite** | Only the specs touched (seconds) + one full `npm run e2e:ci` on day 7 | CI's decoupled run covers the rest for free. |

---

## Part 0 — The census (2026-09-09)

**Method** — the FR/EN dictionaries are walked as OBJECTS (`src/lib/glossary.test.ts`
`dictValues`), interpolating strings rendered with a stand-in. No source parsing.

> ### The census was wrong twice before it was right, and both drafts sounded confident
>
> 1. **Single quotes only** → « effacer » read **6**. Every pluralising string here is a
>    template literal (`${n} note effacée`) — exactly the strings that report a delete.
> 2. **Both quote styles, comments blanked** → read **20**. Also wrong: a French
>    apostrophe (« d'essai ») ends a `'…'` match early, so the next match pairs across
>    code and swallows source fragments as UI copy.
> 3. **Walking the dictionary objects** → **14**, and that one is exact.
>
> The tell was a PLANTED string that could not move the count. A ratchet whose number
> cannot be moved by the bug it guards is a decoration — and chasing it found a real
> defect in a shared helper (below).

> ### 🔧 It also uncovered a blind guard: `blankComments` destroyed French files
>
> `buildGuardScan.ts`'s `blankComments` walked quotes BEFORE blanking line comments, so
> an apostrophe inside a French `//` comment (« pour l'instant ») opened a phantom string
> and ate everything to the next apostrophe. On `src/i18n.ts` it turned **171 488 chars
> into 3 673** — 98 % of the file gone. The prose-breadcrumb rule in
> `settingsNav.test.ts` scans that file through this helper and was seeing **zero**
> « Réglages ▸ » crumbs where there are seven: it had been passing because it saw
> nothing. Fixed (line comments first); the full suite stayed green, so nothing had been
> hiding behind the blindness — but the guard is a guard again.

**Verbs (FR · dictionary values, 2 839 of them):** retirer **75** · supprimer **43** ·
vider **29** · effacer **14** · enlever **0**
*(Earlier drafts of this table said 43 / 30 / 15 / 20 / 1. Those came from the broken
scanners above; these are exact.)*

**Rival forms, pinned as ratchet ceilings in `glossary.test.ts`:**

| Form | Now (exact) | Target | Where |
| --- | --- | --- | --- |
| `fr:Enlever` | **0** ✅ | 0 | was a habit counter's « En enlever un » |
| `fr:Événement` | **0** ✅ | 0 | search + capture; « rendez-vous » is the entity |
| `fr:Tâche` | **1** ✅ | 1 (floor) | spent 2 → 1 on 2026-09-09. The survivor is « Tâches de la maison », a Réglages pill stacking routines · corvées · modèles de liste — a container over THREE entity types, verified against `SETTINGS_TREE`. Its target was written « 0 », which it must never reach; corrected to a floor |
| `fr:effacer` | 14 | 14 (floor) | all legitimate: prose, DrawPad ink, the field ✕, typed dates |
| `fr:le cercle` | 6 | 6 (floor) | it names the PEOPLE — see the correction below |
| `en:the circle` | 16 | 16 (floor) | same, and every one reads « …in the circle », not a tab |
| `en:carnet` untranslated | **0** ✅ | 0 | → « Logbook » |
| e2e specs pinning a dying label | **0** ✅ | 0 | fixed in the same commit as their labels |

**Also counted:** EN strings that are exactly `'Notes'` **10** (three concepts wear it) ·
EN `carnet` untranslated **8** · `EmptyState` **108** sites (5 `action=`, 18 `guide=`) ·
`useUndoableRemove` **6** call sites · guide **32** cards · tours **9** · help registries
**8 / 122** entries · glossary **25** terms (5 verbs · 15 entities · 5 surfaces).

**LEAN baseline — full matrix, 92 states, 0 failing (`npm run e2e:matrix`, 2.7 min):**

| Surface | contentTopPx | budget |
| --- | --- | --- |
| **cashier-day** | **412** | **none** ← worst in the app, and nothing was holding it |
| maison-social-day | 382 | 420 |
| maison-family-day | 374 | 411 |
| board-kiosk-day / night | 334 | 368 |
| habitudes-day | 288 | 317 |
| settings-board / settings-systeme | 278 | 308 |

*The partial manifest this replaced covered 21 of 92 states and could not see `cashier`
at all. Day 7 diffs against these numbers; nothing may end the week higher.*

---

## Part 1 — The week

### Day 1 — The word list · ✅ shipped
- [x] `src/lib/glossary.ts` — the word list as DATA (24 rows that day; the census above
      carries the live count, which is the only one asserted): winner FR + EN, a two-sentence definition
      (the text the in-app lexicon will pop on day 7), the frozen `codeIds` each concept
      wears, and the `rivals` that lost. Every rival and every id divergence carries a
      **why**, so the next session can't "fix" it by accident.
- [x] The delete system settled as data, not prose: **retirer** = off this surface ·
      **supprimer** = gone · **vider** = empty a container that stays · **révoquer** = kill
      an access · **effacer** = the drawing eraser, and consequence prose. Nothing else.
- [x] `src/lib/glossary.test.ts` — shape rules + ratchets, scanning both quote styles and
      **`e2e/` as well as `src/`** (the decoupled-E2E defence). Proven red three ways: a new
      « Effacer » label, a new e2e assertion on a dying label, two terms claiming one word.
- [x] `UNIFY.md` + `STATE.md` §2 registration + `CLAUDE.md` pointer.

### Day 2 — One verb per act · ✅ shipped
- [x] Triaged all 20 « effacer » sites **by reading the code behind each one**, not by
      spelling. 12 labels moved; 8 stayed. « effac* » 20 → 8.
- [x] The rule got SHARPER in the doing, and this is the day's real finding:
      **« effacer » erases MARKS you made** — ink on a drawing, text typed in a field,
      dates you entered — **never an object of the household**. That line is what tells
      DrawPad's « Tout effacer » (correct — it is ink) from « Effacer cochées » (wrong — a
      container of items → « Vider »). Day 1 had written the rule as "the eraser only",
      which would have churned three correct labels.
- [x] The smoking gun closed: `todos.clearChecked` = « Vider les cochés », matching
      `liste.clearChecked` — same key name, same act, one word at last.
- [x] A label that contradicted its own question: the fridge-note ✕ said « Effacer » while
      the confirm it raises says « Retirer cette note ? ». Now both say retirer.
- [x] The last « Enlever » (a habit counter) → « En retirer un ». That rival is at **0**.
- [x] EN followed the FR concept: Remove where FR says retirer, Clear where it says vider.
- [x] Both e2e specs renamed in the same commit (ratchet 2 → **0**).
- [x] A stale COMMENT quoting the old label (`i18n.ts:554`) re-synced — exactly the drift
      this week exists to stop.
- [x] Ratchets lowered in the same commit and **proven to hold**: restoring « Effacer
      cochées » is now red, where day 1's ceiling of 20 would have allowed it.

### Day 3 — One noun per thing · ✅ shipped
- [x] « Événement » → « Rendez-vous » everywhere it named the entity (search, capture): **0** left.
- [x] **The day's correction, and it saved ~35 strings of churn:** « le cercle » is NOT a
      rival of « Maison ». It names the PEOPLE; Maison names the place that holds them.
      Only a string that POINTS somewhere must say the live place — « Fiche complète dans
      Le cercle » did (→ Maison ▸ Famille), « Personne dans le cercle pour l'instant » does
      not. Day 1 had it down as a rival to drive to zero, which would have rewritten every
      sentence that simply names the circle. `cercle` is a glossary TERM now, with its own
      ratchet: the word may stay where it is and may not spread back into navigation.
- [x] The capture destination and the search category name the live surface (« Famille »,
      « Personnes »); an ORPHAN key naming the retired tab (`cercleTab`, rendered by
      nothing in either language) deleted.
- [x] EN gaps closed: « Carnet » was standing untranslated in 8 strings → **Logbook** (0
      left); `search.businesses` said "Services & places" where the concept is Commerces →
      **Businesses**.
- [x] The EN note collapse: `mot` is **Message** in English, so a reader can tell a message
      left for someone from a note on a board — FR had three words for three tables, EN had
      one for all three.
- [x] The scanner rebuilt on the dictionaries (see the method note): the ratchets now
      measure what a person actually reads, and the plant that exposed the flaw goes red.
- [x] 🔧 `blankComments` fixed in `buildGuardScan.ts` — it had been destroying French files
      and blinding the breadcrumb guard.
- [x] **The e2e rule was hard-coded to ONE word**, and a spec pinning « Événements » sailed
      past it into a red run. It reads the glossary now, so every rival is covered the
      moment it is declared — and generalising it immediately caught a SECOND spec, still
      pinning « En enlever un », which day 2 would have shipped red into CI.

### Day 4 — One mechanism per act · ✅ shipped
- [x] **Five delete mechanisms are four.** `lib/undoRemove.ts` is deleted and its **5**
      call sites (`operator/chores`, `operator/devices`, `operator/homeProjects`,
      `operator/media`, `board/SeasonUpkeepCard`) now hold their deletes with
      `useDeferredRemoval` — pending set, and no un-hide until a genuinely FRESH frame.
      Two of them sat on `HOME_PROJECTS_KEY`, which the board polls: exactly the
      resurrection shape this repo has fixed twice. Each site also gained the `visible()`
      wiring, which is the half that actually hides the row.
- [x] **It was 5 sites, not the 6 I "corrected" the audit to.** My regex matched
      `useUndoableRemove (` inside a COMMENT in `agenda.tsx` — the very file that
      documents why it does NOT use it. The audit's 5 was right; my correction was the
      same class of error as everything else this week.
- [x] Guard `src/lib/undoTier.test.ts`, **red on the pre-fold tree** (git stash, run,
      restore) and green after. It bans the retired hook by name AND holds the raw
      undo-toast hook to a short allow-list, each entry saying what it undoes.
- [x] Its first draft flagged three innocents (`ReserveSection`, `drawingGallery`,
      `DayPlanPage`) — every one using `useWrite`'s sanctioned `optimistic` callback for
      an EDIT, not a removal — and four "unknown" keys that are legitimate PAGE-LOCAL
      keys per CLAUDE.md. Narrowed before trusting.
- [x] `ACTIONS.md` door 14 rewritten: four tiers, the fold recorded, and the rule that
      decides which tier a door takes.

### Day 4's verdict on Business — parked, and it reverses the plan
- [~] **Business's two delete tiers are CORRECT, not drift.** The plan said "one entity,
      one tier". The layer scale says otherwise: `.undo-toast` is z-index **40** on
      purpose (a lingering bottom pill), a sheet is **156**, a scene 50–150 — so an undo
      offered from inside a sheet is unreachable, which is why cook mode uses a toggle.
      `BusinessForm` lives in a Modal, so its delete must **confirm**; the row peek is at
      page level, so it can be **deferred**. The tier follows the SURFACE. Recorded in
      `ACTIONS.md` door 14 so the next pass doesn't "fix" it.

### Day 5 — A door where the thing is seen · ✅ shipped
- [x] **A corvée and a projet maison can be fixed where they are SEEN.** Both could only
      be CHECKED from the board — not renamed, not removed — and their edit lived in
      Réglages with no door pointing at it. `buildChore` gained `editHref` + `onDelete`,
      both riding the peek's ⋯ (a glance surface keeps its row furniture; ACTIONS door #8
      puts the overflow split in the adapter). The delete is **deferred**, the same tier
      the board's own check already uses for that row, with `visible()` wired on all five
      derivations so the row vanishes everywhere in scope at once.
- [x] A corvée is edited INLINE in Réglages (its row expands into the ＋ form) — there is
      no edit scene to open. « Modifier » therefore names that place via `settingsHref`
      (door #11, the Réglages mirror). Removing the hunt is the win; inventing a second
      editor would not have been.
- [~] **Routine and habitude keep their delete inside the editor**, and that is right:
      both already have a reachable EDIT door on the surface (the routine card's ✎, the
      habit peek's « Modifier »), and the delete is one tap further in. The rule worth
      holding is « fixable where seen », not « every destructive action on every glance
      surface » — a board that offers delete beside « Fait » is how a mis-tap becomes a
      loss. Recorded rather than built.
- [~] **Todo's delete stays inside its tap-to-edit state** for the same reason: the row
      opens to an editor on tap, so the delete is one gesture away and never hidden
      behind a hunt.

### Day 5's other half — the guard the week kept needing
- [x] **Four times this week a label moved and a spec kept asserting the old words**
      (« Effacer le journal », « Événements », « En enlever un », « Tout effacer »). E2E
      is decoupled here, so each shipped first and went red later. Two new rules in
      `glossary.test.ts`:
      **(a)** every ACCENTED `name: '…'` literal in a spec must exist in FR or EN — 78 of
      them, 16 exemptions, all fixture data or composed labels;
      **(b)** any literal opening with a DELETE-FAMILY verb must exist too — which is what
      catches the unaccented ones the first rule cannot see.
- [x] Measured before deciding: a strict "every literal must exist" rule is NOT viable —
      **133 of 352** are fixture data (« Lait 2% 4L », « Papa »), test ids or composed
      labels, and an allow-list that long is one nobody maintains. Recorded in the guard.
- [x] Proven red on the real breakage that slipped through every earlier rule.

### Day 6 — The screens that never explained themselves · ✅ shipped
- [x] **`FormScene` forwards a `card`** — five form scenes (event, corvée, habitude,
      projet maison, routine) gained a « ? » and a door into the guide. They were the only
      screens in the app with no help at all, which is exactly backwards: they are where a
      first-timer meets fields she has to interpret. Zero new guide cards — every one names
      a card that already exists, so the 32-card ceiling holds.
- [x] Seven standalone scenes carded too (caisse, la liste ▸ modifier, recherche, voyage,
      voyage partagé, l'auto, avant de partir). Two entries kept a recorded ➖: DevKit (a
      developer surface) and QuickAddPage (the ⚡ chips ARE the explanation).
- [x] Three « ? » doors pointed at **alias** ids (`cashier`, `drawings`) rather than the
      live cards they redirect to. They worked, but this repo's rule is that in-code refs
      stay PRECISE (`helpRegistry.test.ts` says so for registries) — now `deals` and `mots`.
- [x] Guard in `tour-rule.test.ts`: every `SceneHead` names a live card or is listed with
      its reason, **proven red by making the shell stop forwarding** — after first removing
      an exemption of my own that had blinded it to exactly that regression.

### Day 6's verdict on the empty states — measured, and mostly already right
- [~] **"89 of 108 EmptyStates are bare" is not a list of 89 defects.** I read all four
      clusters the audit named before touching them:
      · `operator/shopping` — loading / no-postal-code / error / no-results: **status**
        messages, correctly bare;
      · `DealsBrowser` — search states (start, no results, no flyers): the same;
      · `IdeasDrawer` — the picker's own tabs (favourites, past, AI, kid): cell empties;
      · `CercleCarnetPage` — every one of its sections **already carries a `SectionAdd` ＋
        in its header**, 20px above the empty line. A door inside the text would duplicate
        an affordance already on screen — LEAN smell #8, which the doctrine forbids.
      `EmptyState`'s own header comment says a CELL empty stays bare and only a SECTION
      dead-end takes a door; the doctrine was being followed. The honest work was to check,
      not to add 80 chips. **If a genuine section dead-end turns up, it takes a door then.**

### Day 7 — The lexicon, the returning user, honest documents · ✅ shipped
- [x] `[[mot:<id>]]` in `lib/richText.tsx` — a third token beside `[[icon:]]` and
      `[[card:]]`, popping the glossary definition where the word stands
      (`components/GlossaryTerm.tsx`). **Réglages / Comprendre only**: a one-off read, so
      it costs a daily user nothing. Four terms marked at their first appearance; three
      guard rules (id resolves · label matches the term's own word · no mark outside the
      two surfaces), each proven red.
- [x] Widened `DISCOVERY_PROBES` and made `SectionIntro`'s "seen" flag replayable
      (`resetIntrosSeen()` → Réglages ▸ Découvrir, « Revoir les cartes de première
      visite »). The flag had been doing two jobs — "don't nag me" and "this household is
      past onboarding" — with no way back short of clearing site data.
- [x] Full matrix re-run (92 states, 0 failing), diffed against the Day-1 baseline:
      **zero `contentTopPx` changes**. A week of renames, four new edit/delete doors, the
      lexicon token and help on every form scene cost no surface a single pixel of chrome
      — which is the result the week was aiming at: the doors went behind furniture that
      already existed (peek ⋯, `RowActions`, `SceneHead`'s "?"), so none of them is new
      chrome on a daily path.
- [~] **`cashier-day` (412px) stays unbudgeted — the plan's instruction was wrong, and
      the screenshot is why.** LEAN's own rule is to look before ratcheting, so I opened
      the PNG: one card, vertically centred at thumb height, one item in the fixture.
      `contentTopPx` there measures how few deals are staged, not chrome. Budgeting it
      would invite someone to "fix" the one screen whose emptiness IS the design — the
      spec has argued this since 2026-08-27 and the argument holds.
- [x] **But the audit found a real one next door.** Four entries measure `content` and
      hold no budget; three had a stated reason, `voyage` had none — it was an oversight,
      not a decision, and it sat free to grow at 212px while `LEAN.md` spent its longest
      paragraph on that exact surface. Budgeted at **233**. « No budget » is now a
      required `noBudgetWhy` sentence enforced by a data test that runs before any
      browser opens, because an omission and a decision look identical in a diff.
- [x] Doc honesty. `REVIEW-PASS.md`'s banner said "15 findings still open" against **1**
      real box — twelve days after `STATE.md` had it right. Fixed, and **counted from its
      own boxes** by `docCounts.test.ts` now: the headline of a ledger is the part
      everyone reads and nobody re-derives.
- [~] **`LEAN.md`'s "64 states, 44 budgeted" was NOT stale** — the plan called it drift,
      but read in place the sentence is dated ("the first full CI sweep (2026-08-26…)"),
      i.e. a historical record of that run. Rewriting it would have destroyed a fact to
      fix a phantom. What was actually missing was any statement of the sweep's *current*
      size, so that was added beside it — 80 entries → 92 states, 65 budgeted — and all
      three numbers are now asserted from the spec.
- [x] The matrix parser written for those assertions **reported `0 entries`, confidently,
      twice**: the array is declared `Entry[] = [`, so `indexOf('[')` anchors on the
      *type's* brackets and reads an empty body; and three entries span several lines, so
      the per-line fallback was short by exactly three. Both are now comments on the
      extractor and a floor in the sanity block — the week's recurring lesson, one last
      time: a scanner that walks the wrong shape reports the wrong number and never
      throws.

---

## Part 2 — Decisions taken

| Idea | Winner | Losers | Why |
| --- | --- | --- | --- |
| off this surface | **Retirer** / Remove | Enlever | The thing survives — the person stays in the cercle |
| gone for good | **Supprimer** / Delete | — | The confirm must say what is lost (`confirmCopy.test.ts`) |
| empty a container | **Vider** / Clear | Effacer *(as a label)* | The list stays, it is simply empty |
| kill an access | **Révoquer** / Revoke | — | A link, a paired tablet |
| erase a MARK you made | **Effacer** / Erase | Effacer *(on an object)* | Ink, typed text, typed dates — never a thing of the household. Sharpened on day 2, after reading all 20 sites |
| a message left for someone | **Mot** / **Message** | EN "note" | FR keeps three words for three tables; EN had one for all three. Confirmed by Marc 2026-09-09 |
| something at a given time | **Rendez-vous** / **Appointment** | Événement · EN "Event" | FR settled day 3; the EN half was confirmed 2026-09-09 and swept the same day (17 strings), with `Event` pinned as an EN rival |
| the tab | **Maison** / Home | Le cercle · The circle | Renamed in the nav restructure; the copy never followed. Ids/routes frozen |

## Part 3 — Questions for Marc — **both answered 2026-09-09** ✅

- [x] **EN word for `mot` → « Message ».** Approved. Already swept on day 4 (the whole
      `mots.*` EN subtree says *message*); the answer is what lets the injectivity rule
      *keep* it — mot / fridge note / family note now hold three distinct EN words where
      English had collapsed all three onto "note".
- [x] **EN word for `rendez-vous` → « Appointment ».** Approved, and this one was **not**
      cosmetic: FR has said « rendez-vous » everywhere since day 3, while EN still said
      "Event" in **17** places — the search placeholder and category, the capture kind,
      the calendar legend, « Rendez-vous annuels », edit/delete/add, the empty state, the
      delete confirm, the stale-link toast, the share lead and the member-delete confirm.
      Swept, and `Event` is now a declared **EN rival** on the term, so the ratchet holds
      it at zero the way `fr:Événement` already was. Until today the guard was FR-only:
      the English half of « one word per idea » was documented and unenforced.

### What declaring the first ENGLISH rival exposed

Every rival until now was an accented French word. Those never appear in code, in a CSS
selector or in a spec's own title — so three weaknesses in the guard had never once been
touched. The first ASCII rival hit all three within a minute:

1. **The rival matcher was a plain substring test**, so « Event » also counted "prevent"
   and "eventually". There are none in the copy today, so the ratchet would have read 0
   and looked healthy while being wrong for the first author who writes one. It now uses
   a **Unicode letter boundary with an optional plural** — deliberately not `\b`, which
   is ASCII-only and can never match `\bÉvénement` (É is not a word character, so the
   boundary demands one before it; this repo has been bitten by the same ASCII-dead
   boundary before). Proven both ways: "eventually" no longer counts, « Events » still does.
2. **The e2e scan paired quotes across NEWLINES.** A French apostrophe in one line's
   comment matched a quote several lines below and reported the code between them as an
   asserted label — the same quote-pairing bug the census hit twice in Part 0, sitting
   latent here the whole time because no French rival ever appears in code. It produced
   84 hits, most of them nonsense spans. The character class excludes `\n` now, which
   matters most for **French**, where the apostrophe is the trigger.
3. **The scan cannot judge English, and now says so.** With the spans fixed, the
   remaining hits were the specs' own English: test titles (`test('add an event')`), CSS
   selectors (`.event-note textarea`), route segments (`/event/e1`). None is a label. The
   suite runs in French — its four English states screenshot and measure, and the only
   text any of them asserts is « Spaghetti maison », a fixture recipe name. So EN rivals
   are **skipped** there, and the premise is asserted rather than assumed: a new canary
   fails the build if an English-running spec ever asserts a string that is EN dictionary
   copy. That is this file's own principle applied honestly — *the ratchet counts, it
   does not classify* — instead of an exemption list that would grow a line per spec.

### 🔧 And the lexicon failed CI on a budget, which was the budget being right

The first push of this went red on `check:bundle`: the eager entry chunk came to
**432 KB against a 420 KB cap**. `GlossaryTerm.tsx` imported the term table statically,
and `renderRich` is reachable from the *board* — so the whole glossary, including every
term's `why` (prose written for whoever edits the file), was shipped to every household
on every boot for a feature that only ever renders in Réglages.

Fixed in the two places it was wrong, neither of which is "raise the number":

- the **table** loads on tap (`import()` inside the click, memoised) — a definition is
  only ever wanted by someone who just asked for one;
- the **mark itself** is `lazy()` behind a `Suspense` whose fallback is the plain word,
  so a Réglages-only component is no longer in the chunk that gates first paint.

Back to 429 899 bytes — **181 under the cap**. The stale « today ~386 KB » note beside
that budget is now corrected to say exactly how little room is left, because a comment
claiming comfort is what let this land in the first place.

And the sweep script made the census's original mistake a fourth time: its patterns were
single-quote anchored, so it missed `` `New event: ${title}` `` — the one **template
literal**. The ratchet caught it immediately, which is the entire argument for pinning a
ceiling at 0 in the same commit as the sweep rather than trusting the sweep.

## Part 4 — Parked, with the why

- [~] **Business's two delete tiers** — see *Day 4's verdict on Business* above; the split
      is correct, not drift.
- [~] **`cashier-day`'s 412px** — deliberate centred layout, re-looked at on 2026-09-09
      (Day 7). The metric is not measuring chrome on that screen.
- [~] **`LEAN.md`'s first-sweep numbers** — dated history, kept verbatim; the *current*
      numbers were added beside them rather than overwriting them (Day 7).
- [~] **`family-window` / `welcome` unbudgeted** — guest-link scenes that land on their
      empty state under an operator fixture, and an empty state may not be budgeted. They
      become budgetable the day a guest fixture exists; until then the reason is written
      in the table.

---

## Part 5 — What the week actually changed

Seven days, one theme: **the app said the same thing more than one way, and nothing was
written down.** What shipped:

| | Before | After |
| --- | --- | --- |
| Delete verbs | 6, one key spelled two ways | 5, each with an assigned meaning, guarded |
| Delete mechanisms | 5 (one undocumented, splicing polled caches) | 4, `undoRemove.ts` gone |
| The word list | none | `lib/glossary.ts` (size in the census above), ratcheted so synonyms cannot grow back |
| Fixable where you see it | corvée, projet, routine, habitude: no | all four: yes |
| Form scenes with help | 0 | all of them |
| A user's way back to the intros | clear site data | one control in Découvrir |
| Doc numbers | typed by hand, three stale | derived from code by `docCounts.test.ts` |
| The English copy | "Event" ×17 while FR said rendez-vous; one EN word for three FR note concepts | *Appointment* and *Message*, both **ratcheted** — the EN half is enforced, not just documented |

**The method that made it checkable, and the one thing to carry forward:** every guard
this week was **planted against the bug it was written for before being trusted**, and
that is not ceremony — it caught a blind guard that had been passing on 98 % of a deleted
file, a census that was wrong twice while sounding certain, a tour rule that invented
three orphans, and a matrix parser that read an empty array as zero. Five guards, five
times the first draft was green for the wrong reason. **A guard that has never been red
proves nothing.**
