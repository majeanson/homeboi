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
| `fr:Tâche` | 2 | 0 | day 4 — and NOT the « Tâches de la maison » pill, which is a container name |
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
- [x] `src/lib/glossary.ts` — 24 terms as DATA: winner FR + EN, a two-sentence definition
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

### Day 4 — One mechanism per act
- [ ] Fold `useUndoableRemove`'s **6** sites into `useDeferredRemoval`; delete
      `lib/undoRemove.ts`; `knip` confirms. Read `agenda.tsx:49-57`'s own argument first —
      if a site is genuinely safe, that becomes a `[~]` with its why, not a silent drop.
- [ ] Business deletes the same way from the peek and from the form (deferred vs confirm today).
- [ ] Guard: no file may pair an optimistic cache splice with an undo toast. **Red on
      today's tree before the fold** — that is the strongest proof available.
- [ ] `ACTIONS.md` Part 1 gains the mechanism table (it documents 4 of 5).

### Day 5 — A door where the thing is seen
- [ ] Corvée, projet maison, routine, habitude, à-compléter gain edit + delete where they
      appear — through the peek's ⋯, not new row furniture (chrome is the tax).
- [ ] Voyage and voiture join the ACTIONS matrix at all (7 destructive sites, unaudited).
- [ ] Re-verify each cell before building: **4 of 7 sampled cells were stale**.
- [ ] Guard: every destructive call site is named in `ACTIONS.md` or allow-listed with a why.

### Day 6 — The screens that never explained themselves
- [ ] `FormScene` passes a `card` → 8 form scenes gain a « ? » and a guide door (zero new
      guide cards; the 32-ceiling holds).
- [ ] The 9 card-less scenes each get a card or a recorded ➖.
- [ ] Section-level empties get their door (clusters: `operator/shopping` 7, `DealsBrowser`
      5, `IdeasDrawer` 5, `CercleCarnetPage` 5). **Cell empties stay bare** — that half is
      as load-bearing as the other.
- [ ] Guard: a `SceneHead` without a card is allow-listed or fails; bare-empty count ratchets.

### Day 7 — The lexicon, the returning user, honest documents
- [ ] `[[mot:<id>]]` in `lib/richText.tsx` — a third token beside `[[icon:]]` and
      `[[card:]]`, popping the glossary definition in the existing `HelpBubble`. **Réglages /
      Comprendre only**: a one-off read, so it costs a daily user nothing.
- [ ] Widen `DISCOVERY_PROBES` (6 of ~23 concepts) and make `SectionIntro`'s "seen" flag
      replayable — the returning user's whole problem in two changes.
- [ ] Full matrix re-run, diffed against Part 0. Spend `cashier-day` (412px, unbudgeted)
      and give it a budget.
- [ ] Doc honesty: `REVIEW-PASS.md`'s banner says "15 findings still open" against **1**
      real box; `LEAN.md` says "64 states, 44 budgeted" against 92/67. Put whatever can be
      derived behind `docCounts.test.ts`.

---

## Part 2 — Decisions taken

| Idea | Winner | Losers | Why |
| --- | --- | --- | --- |
| off this surface | **Retirer** / Remove | Enlever | The thing survives — the person stays in the cercle |
| gone for good | **Supprimer** / Delete | — | The confirm must say what is lost (`confirmCopy.test.ts`) |
| empty a container | **Vider** / Clear | Effacer *(as a label)* | The list stays, it is simply empty |
| kill an access | **Révoquer** / Revoke | — | A link, a paired tablet |
| erase a MARK you made | **Effacer** / Erase | Effacer *(on an object)* | Ink, typed text, typed dates — never a thing of the household. Sharpened on day 2, after reading all 20 sites |
| a message left for someone | **Mot** / **Message** | EN "note" | FR keeps three words for three tables; EN had one for all three |
| the tab | **Maison** / Home | Le cercle · The circle | Renamed in the nav restructure; the copy never followed. Ids/routes frozen |

## Part 3 — Questions for Marc (❓ — not tasks)

- ❓ **EN word for `mot`.** « Message » is proposed (clean, and it keeps mot / fridge note /
  family note distinct in English). It flirts with chat semantics — say the word if you'd
  rather have "Word" or "Fridge note".
- ❓ **EN word for `rendez-vous`.** « Appointment » is proposed over "Event": the app's FR
  entity is a rendez-vous, and « événement » is the losing form.

## Part 4 — Parked, with the why

*(nothing yet)*
