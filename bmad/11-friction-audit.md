# 11 · Friction audit — the five weekly flows (2026-07-13)

> 🔴 **This is the highest-value unfixed pool in the repo, and it is blocked on a
> decision — not on analysis.** Marc declined the proposed F1–F5 fix-wave *grouping* on
> 2026-07-13; the **seams themselves were never disputed**, and nothing has changed about
> them since — **except where a row below says otherwise**. Two of the five tier-1
> entries are now closed: **#2** (`/share` losing captures) was fixed 2026-08-27, and
> **#5** turned out to have been fixed earlier and never ticked here. **#1, #3 and #4
> are live and verified in code on 2026-08-27.** Ask about them **individually** before
> executing anything. See [`STATE.md`](../STATE.md) § 4-B.

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
failure mode CLAUDE.md warns about. *(The useWrite half was fixed 2026-08-27 and is
now guarded by a build-gating test; the undo/« Corriger » half stands.)*

## Ranked seams (cross-flow, worst first)

Tier 1 — blocks the ritual / loses data:

| # | Seam | Flow | Why first |
| - | ---- | ---- | --------- |
| 1 | **Sunday planning can't reach Fri/Sat** — the Tuesday-anchored `windowDaysFor` shows 4–5 cells on Sun/Mon; no picker in the app reaches the coming weekend | plan | The core ritual is impossible on the two evenings it happens |
| 2 | ~~**/share loses captures**~~ ✅ **FIXED 2026-08-27** — the capture now rides `useWrite` (queues + replays offline), and the rule itself is enforced by `src/lib/write-rule.test.ts` so it cannot drift back. Guarded by `e2e/capture-offline.spec.ts`. **Still open:** no routed-label/undo/« Corriger » on /share, and the scene shows no offline banner (it sits outside HubLayout — same as seam #12) | tidy | Data loss FIXED; mis-route UX remains |
| 3 | **A dated loose todo silently vanishes after its day** — never swept, never rolled forward, invisible to board glance / Moments / À régler | tidy | Lost intended work |
| 4 | **The locked kiosk (`?kid=1`) hides every parent glance** — departure checklist + habit morning-open unreachable except via the 3s-hold+math gate, every morning | kids | One-tablet households lose the 7h10 surface |
| 5 | ~~**A half-done routine pins the kiosk** + **no "switch kid" affordance**~~ ✅ **ALREADY FIXED (verified 2026-08-27)** — both halves shipped and were never ticked here: a ~60 s idle drift returns to the picker whatever the progress (`KidView.tsx:84`, "Kids seam #1"), and `backToFaces` + the "other kids" strip give the way back (`KidView.tsx:147`, "Kids seam #4") | kids | — |

Tier 2 — high-frequency annoyances (weekly ×N):

| # | Seam | Flow |
| - | ---- | ---- |
| 6 | List row's big centre target **navigates to the editor instead of checking** — the check is the small far-right disc; dozens of mis-taps per trip | shop |
| 7 | **17h empty « Ce soir » says nothing** — no supper block, no "des idées ?" door; suggestions/vide-frigo sit unreached in the kitchen drawer | cook |
| 8 | **Every supper costs a full-screen day scene** — no inline quick-add on the grid cell; ~7 heavy loads to fill a week | plan |
| 9 | **No bulk clear / decay** on fridge notes (media notes even confirm per-item), standing todos, seen mots | tidy |
| 10 | **Leftovers unpostable from a recipe-backed meal** — tap routes to the recipe view, which lacks « Créer des restants » | cook |
| 11 | **« Magasiner la semaine » silently disappears** when the week is free-text (tile filtered, not disabled-with-why) | plan |
| 12 | **No offline/stale banner on the in-store scenes** (cashier/price-match/flyers are outside HubLayout) + **a failed lookup renders as "no deals"** with no retry | shop |
| 13 | **Mid-cook "ran out → flag low" doesn't exist** — cook mode has zero pantry affordance | cook |
| 14 | **« À régler » can't be snoozed/acknowledged** — an unresolvable friction re-nags every scan | tidy |

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
- Capture-routed notes carry no origin/age marker after the sheet closes (tidy).
- Stale cook/multi-cook deep-links bounce to /kitchen silently (cook).
- No "last week" review anywhere in the kitchen (grid is forward-only) (plan).

## Verified healthy (the audits checked, and these hold)

Offline writes + idempotent replay across list/meals/todos/routines; deferred
removal everywhere a poll could resurrect a row; « Corriger » mis-route recovery
in the ＋ spine (NOT /share); cashier flyer-image prefetch; AI-off degradation at
every step; guest read-only gating; wall-clock cook timers surviving dish
switches; the nightly routine reset.

## Suggested fix-waves (proposal — decide before executing)

- **Wave F1 « the ritual works »** (tier 1, items 1–3): planning window ≥
  today→next-Sunday; /share renders the capture spine (or minimally useWrite +
  routed/undo); overdue loose todos roll forward or surface as a quiet group.
- **Wave F2 « the kiosk belongs to the family »** (items 4–5): idle
  return-to-picker regardless of completion; an always-there "whose routine?"
  face chip; a gated parent peek (departure + habit check-in) on the locked
  kiosk.
- **Wave F3 « the glance answers »** (items 6, 7, 11, 12): tap-to-check on the
  list row; an empty « Ce soir » CTA; « Magasiner » disabled-with-why; offline
  chip + retryable error state on the in-store scenes.
- **Wave F4 « the tidy empties »** (items 9, 14, 3-adjacent): bulk clear with
  one undoable batch on Notes; decay/age cues on standing todos + seen mots;
  À régler acknowledge.
- **Wave F5 « cooking hands »** (items 10, 13 + tier-3 cook polish): leftover
  action on the recipe sheet; flag-low from the gather list; target sizes.
