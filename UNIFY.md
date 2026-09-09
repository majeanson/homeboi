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

## Part 0 — The census (2026-09-09)

**Method** — user-visible VALUES only (both quote styles: `'…'` **and** backticks), from
`src/i18n.ts` / `src/i18n.en.ts`. Command:
`node scratchpad/census.mjs`, reproduced by `src/lib/glossary.test.ts`'s own scanner.

> The first draft of this census read single quotes only and reported « effacer » **6×**
> when the true number is **20** — every pluralising string in this app is a template
> literal (`${n} note effacée`), which is exactly where a delete reports itself. A word
> census that misses backticks misses the strings that name the act.

**Verbs (FR · user-visible values):** supprimer **30** · retirer **43** · effacer **20** ·
vider **15** · révoquer **2** · enlever **1**
**Verbs (EN):** remove **49** · delete **40** · clear **34** · revoke **13** · erase **6**

**Rival forms, pinned as ratchet ceilings in `glossary.test.ts`:**

| Form | Today | Target | Where |
| --- | --- | --- | --- |
| `fr:Enlever` | 1 | 0 | one stray at `i18n.ts:151` |
| `fr:Tâche` | 2 | 0 | not the « Tâches de la maison » pill — that is a container name |
| `fr:Événement` | 4 | 0 | search + capture, vs 14 « rendez-vous » |
| `fr:Le cercle` | 9 | 0 | a tab renamed Maison ▸ Famille; route + card id stay frozen |
| `en:The circle` | 13 | 0 | the same, worse, plus untranslated leaks |
| `fr:effac*` | 20 | ~8 | the floor is consequence prose (« sera effacé ») + the eraser |
| e2e specs pinning « Effacer … » | 2 | 0 | `config-panels`, `meals` — **E2E is decoupled, so these break AFTER a deploy** |

**Also counted:** EN strings that are exactly `'Notes'` **10** (three concepts wear it) ·
EN `carnet` untranslated **8** · `EmptyState` **108** sites (5 `action=`, 18 `guide=`) ·
`useUndoableRemove` **6** call sites · guide **32** cards · tours **9** · help registries
**8 / 122** entries · glossary **24** terms (5 verbs · 14 entities · 5 surfaces).

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

### Day 2 — One verb per act
- [ ] Triage the 20 « effacer » sites: labels move to `vider`/`supprimer` by meaning, prose
      stays. The smoking gun first — `todos.clearChecked` → « Vider les cochés ».
- [ ] The last « Enlever » (`i18n.ts:151`).
- [ ] EN follows the FR concept, not EN taste (remove 49 vs delete 40 with no mapping today).
- [ ] The two e2e specs renamed **in the same commit** as their labels.
- [ ] Lower every ratchet touched, in the same commit.

### Day 3 — One noun per thing
- [ ] « Événement » → « Rendez-vous » (4).
- [ ] « Le cercle » → Maison / Famille per site (9 FR + 13 EN). Route `/cercle/*` and guide
      card id `cercle` stay **frozen** — they live in already-texted family links.
- [ ] EN gaps: `Commerces` never reached English; `Carnet` → « Logbook » (8).
- [ ] The EN note collapse: `mot` → **Message**, fridge note, `note` → Note. ❓ below.
- [ ] Guide title collision: « La cuisine » titles both `kitchen` and `set-recipes`.
- [ ] One « Quoi de neuf » line per rename wave — not per string.

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
| take ink off a drawing | **Effacer** / Erase | — | Kept as a **fifth** verb on purpose, scoped to the eraser + consequence prose |
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
