# 11 · Friction audit — the five weekly flows (2026-07-13)

> ✅ **CLOSED 2026-08-28 — tier 1 and tier 2 are done.** All five tier-1 seams and all
> nine tier-2 seams are resolved; five of the nine turned out to be already fixed and
> merely unticked, which is the standing lesson of this file. Only **tier 3** (the
> opportunistic polish list below) remains open. What follows is kept as the record.
>
> 🔴 *(Historical.)* **This was the highest-value unfixed pool in the repo, and it was
> blocked on a decision — not on analysis.** Marc declined the proposed F1–F5 fix-wave *grouping* on
> 2026-07-13; the **seams themselves were never disputed**, and nothing has changed about
> them since — **except where a row below says otherwise**. All five tier-1 entries
> are closed: **#1** (the planning window), **#2** (the share target — both halves: the
> data loss 2026-08-27, the mis-route UX 2026-08-28), **#3** (vanishing dated to-dos),
> most of **#4**, and **#5**, which turned out to have been fixed earlier and never
> ticked here. What remains of #4 (the habit morning-open on a locked kiosk) is a
> recorded decision, not a gap. See [`STATE.md`](../STATE.md) § 4-B.

> Five parallel read-only audits walked the flows a real household runs weekly:
> **plan the week · grocery run · cook tonight · kid mornings/bedtime ·
> capture + Sunday tidy.** Every seam below was verified against code (file:line
> in the per-flow reports), not remembered. This is FRICTION IN WHAT EXISTS —
> not feature ideas; the idea pool stays `05-feature-ideas.md` (21 never-built).
>
> Companion to `PARITY.md` (which audits cross-cutting *uniformity*; this audits
> *flow* friction — the seams uniformity can't see).

## The two cross-flow themes

1. **Glance surfaces that go silent at the decision moment.** The board says
   nothing at 17h with no supper planned; « Magasiner la semaine » hides rather
   than explains; a failed deal lookup renders as "no deals"; the locked kiosk
   hides every parent glance. The calm stance ("never nag") drifted into
   "never offer".
2. **No pressure-release on the accumulating surfaces.** Fridge notes, standing
   todos, seen mots — the highest-volume sinks are the only lists with no bulk
   clear and no decay, so the Sunday tidy is per-item labour. This quietly
   violates « finite lists that empty and stay empty ».

Plus one structural repeat: **/share re-implemented the capture spine** beside
`CaptureForm` (no useWrite, no undo, no « Corriger ») — the exact build-beside
failure mode CLAUDE.md warns about. *(The useWrite half was fixed 2026-08-27 and is now guarded by a
build-gating test. The re-implementation ITSELF was undone 2026-08-28: /share mounts
`CaptureForm` now, so the « Corriger » half came back for free — the clearest argument
in this file for fixing a build-beside by deleting it rather than by copying the
missing parts across.)*

## Ranked seams (cross-flow, worst first)

Tier 1 — blocks the ritual / loses data:

| # | Seam | Flow | Why first |
| - | ---- | ---- | --------- |
| 1 | ~~**Sunday planning can't reach Fri/Sat**~~ ✅ **FIXED 2026-08-27** — `windowDaysFor` is gone. The window ROLLS from today (`today .. today + N`), and N is a household setting: « Jours affichés », Réglages ▸ Cuisine ▸ Repas, 7 · 10 · 14, default 10. Any Sunday reaches the following Saturday **by construction**, since the floor is 7. Clamp unit-tested (`_lib/mealSlots.test.ts` — the old window had zero coverage), control e2e'd (`config-panels.spec.ts`) | plan | — |
| 2 | ~~**/share loses captures**~~ ✅ **FIXED 2026-08-27** — the capture now rides `useWrite` (queues + replays offline), and the rule itself is enforced by `src/lib/write-rule.test.ts` so it cannot drift back. Guarded by `e2e/capture-offline.spec.ts`. **Also fixed 2026-08-28** — the mis-route half. /share now MOUNTS `<CaptureForm seed=…>` instead of re-implementing it beside it, so the routed label (« Ajouté : X »), the « Corriger » re-route tiles and the capture undo all come from the ONE spine and cannot drift from it again — which is exactly how this path lost its outbox in the first place. The text branch no longer auto-returns to the board: a routed capture is when « Corriger » matters, and a 1 s bounce took it away before it could be read. Guarded by `e2e/share-routed.spec.ts` | tidy | ✅ closed |
| 3 | ~~**A dated loose todo silently vanishes after its day**~~ ✅ **FIXED 2026-08-27** — the board glance also selects past-day, undone, LOOSE todos, and they read as their own « En retard » group above the rest (the shape Entretien's carry-forward already uses). Nothing is rewritten and nothing is deleted: the row keeps its day. Query shape pinned by `src/lib/todos.test.ts`, behaviour by `e2e/todo-overdue.spec.ts` | tidy | — |
| 4 | ~~**The locked kiosk hides the departure checklist**~~ ✅ **PART FIXED 2026-08-27** — and the original wording was too strong: the checklist ITEMS did already reach the kid lens, but folded into « À faire », where « prends ta boîte à lunch » read the same as « ranger ta chambre ». They are their own « Avant de partir » section now, hear-first and read-only (the board still writes nothing at all). **Still behind the gate, deliberately:** « Le point du jour » (`habitCheckin.ts` bails on a non-parent audience) — it is written for a reader and would need its own toddler face first | kids | Morning surface reachable |
| 5 | ~~**A half-done routine pins the kiosk** + **no "switch kid" affordance**~~ ✅ **ALREADY FIXED (verified 2026-08-27)** — both halves shipped and were never ticked here: a ~60 s idle drift returns to the picker whatever the progress (`KidView.tsx:84`, "Kids seam #1"), and `backToFaces` + the "other kids" strip give the way back (`KidView.tsx:147`, "Kids seam #4") | kids | — |

Tier 2 — high-frequency annoyances (weekly ×N):

> **Re-verified 2026-08-27, and again 2026-08-28.** FIVE of these nine were ALREADY
> FIXED and still listed — #6 (the row's centre checks; the editor moved to a
> hold and the ⚙ Avancé ✏️), #7 (the empty hero offers « Choisir un souper »),
> #8 (an empty day cell plans in place). Half of #9 too: the board strip and
> « À compléter » had their brooms; only the mots pile lacked one. A ledger cell
> is a verdict, not a fact — the standing rule in CLAUDE.md — and this table cost
> about an hour of would-be rework to the sessions that trusted it. Tick a row in
> the same commit that resolves it.

| # | Seam | Flow |
| - | ---- | ---- |
| 6 | ✅ **2026-08-26/27** — List row's big centre target **navigates to the editor instead of checking** — the check is the small far-right disc; dozens of mis-taps per trip | shop |
| 7 | ✅ **shipped** (verified in code 2026-08-27, `DayHeroes` empty branch) — **17h empty « Ce soir » says nothing** — no supper block, no "des idées ?" door; suggestions/vide-frigo sit unreached in the kitchen drawer | cook |
| 8 | ✅ **shipped** (verified 2026-08-27, `e2e/kitchen-inline-plan.spec.ts`) — **Every supper costs a full-screen day scene** — no inline quick-add on the grid cell; ~7 heavy loads to fill a week | plan |
| 9 | ✅ **2026-08-27** (mots; the board strip and « À compléter » already had theirs) — **No bulk clear / decay** on fridge notes (media notes even confirm per-item), standing todos, seen mots | tidy |
| 10 | ✅ **2026-08-28** — **Leftovers unpostable from a recipe-backed meal** — tap routes to the recipe view, which lacked « Créer des restants ». « Il en reste ? » is now in the recipe scene's ⋯ overflow, through a shared `useAnnounceLeftover()` (`kitchen/Leftovers`) that also replaced the day editor's and the board peek's hand-rolled copies — they had drifted apart on invalidation, each refreshing only its own surface. NO undo toast from that scene, deliberately: `.recipe-modal` is z-index 80 and `.undo-toast` 40, so it would be painted underneath (cook mode's 2026-08-27 bug); the label flip is the confirmation. Guarded by `e2e/recipe-leftovers.spec.ts`, which also asserts the absent undo | cook |
| 11 | ✅ **shipped** (verified in code 2026-08-28, `AddSheet.tsx` `KITCHEN_ACTIONS`) — **« Magasiner la semaine » silently disappears** when the week is free-text. The tile stays put and goes disabled-with-why (`shopWeekWhy`, shown in-tile since touch has no tooltip), and stays tappable in help mode. A fourth row that was already done and never ticked | plan |
| 12 | ✅ **shipped** (verified in code 2026-08-28) — **No offline/stale banner on the in-store scenes** + **a failed lookup renders as "no deals"**. Both halves are done: `SceneHead` takes an `offline` prop and renders `<OfflineBanner>` above the head (cashier, price-match, flyers all pass it; `CashierMode` mounts one directly too), and `DealsBrowser` has a distinct `error` state — its own message + a `refetch()` retry, for the deals AND the flyer query — with a comment already citing "shop seam #3". `CirculairesPage` looked bare only because it is a ten-line wrapper that delegates to `DealsBrowser`. Fifth "already done, never ticked" row | shop |
| 13 | ✅ **2026-08-27** — **Mid-cook "ran out → flag low" doesn't exist** — cook mode has zero pantry affordance | cook |
| 14 | ✅ **2026-08-27** (migration 0122) — **« À régler » can't be snoozed/acknowledged** — an unresolvable friction re-nags every scan | tidy |

Tier 3 — polish (fix opportunistically, or bundle with the tier above):

- Cashier ✓ is a second ephemeral check-state disjoint from the list (shop).
- Staples chips re-ask what pantry-low/list already know (plan).
- Gather tick ~27px beside a read-aloud zone; cook-bar icons crowded (cook).
- No meal-done — the supper hero headlines an eaten meal all evening (cook).
- Cold kitchen grid flashes a Jan-1970 week (`weekStart ?? 0`) (plan).
- Abandoned routine stopwatch logs absurd laps; empty shell routine invisible to
  the kid with no cue; `calm.ts` comment contradicts actual behaviour (kids).
- « Par allée » hides the drag grip (no in-aisle tweak); online-only search
  fires doomed requests instead of disabling (shop).
- 🔶 **2026-08-27** an AGE marker shipped on fridge notes (bmad/12 #25); an ORIGIN marker still needs a column — out of scope. Capture-routed notes carry no origin marker after the sheet closes (tidy).
- ✅ **2026-08-27** Stale cook/multi-cook deep-links bounce to /kitchen silently (cook).
- No "last week" review anywhere in the kitchen (grid is forward-only) (plan).

## Verified healthy (the audits checked, and these hold)

Offline writes + idempotent replay across list/meals/todos/routines; deferred
removal everywhere a poll could resurrect a row; « Corriger » mis-route recovery
in the ＋ spine (NOT /share); cashier flyer-image prefetch; AI-off degradation at
every step; guest read-only gating; wall-clock cook timers surviving dish
switches; the nightly routine reset.

## Suggested fix-waves (proposal — decide before executing)

- ~~**Wave F1 « the ritual works »**~~ — ✅ **shipped 2026-08-27.** The planning window
  rolls from today and is a household setting; /share writes through useWrite; overdue
  loose todos surface as a quiet « En retard » group. (Left open from the wave's
  original wording: /share's routed-label / « Corriger » recovery UI.)
- **Wave F2 « the kiosk belongs to the family »** (items 4–5): idle
  return-to-picker regardless of completion; an always-there "whose routine?"
  face chip; a gated parent peek (departure + habit check-in) on the locked
  kiosk.
- ~~**Wave F3 « the glance answers »** (items 6, 7, 11, 12)~~ — ✅ **all four shipped**
  (6 + 7 by 2026-08-27; 11 and 12 were found already done when re-verified 2026-08-28).
- **Wave F4 « the tidy empties »** (items 9, 14, 3-adjacent): bulk clear with
  one undoable batch on Notes; decay/age cues on standing todos + seen mots;
  À régler acknowledge.
- **Wave F5 « cooking hands »** (items 10, 13 + tier-3 cook polish): leftover
  action on the recipe sheet; flag-low from the gather list; target sizes.
