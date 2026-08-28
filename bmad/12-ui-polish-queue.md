# 12 · UI polish queue — approved "todo soon" (2026-07-13)

> Marc-approved subset of the post-friction-audit suggestion list. Not scheduled;
> pick items off this queue when a session wants a contained UI/UX win. All are
> client-side unless noted. Numbers keep the original proposal's ids.

1. ✅ **DONE 2026-08-27** — **`<Skeleton>` primitive** — generalize the board's ghost tiles (5c64b3e) into
   a `.skeleton` family in /dev/kit; sweep Kitchen grid, recipe book, Cercle
   lists, Réglages panels off their mixed `<Loading/>` spinners.
6. ✅ **DONE 2026-08-27** (five section dead ends; cells deliberately left bare) — **Every `EmptyState` opens a door** — audit all call sites (~88); each gets an
   add / guide / settings action (the « Ce soir » fix generalized). The primitive
   already carries `guide`; add an `action` slot.
8. ✅ **DONE 2026-08-27** — **Night-mode contrast pass** — AA-audit `--ink-soft` on wash backgrounds at
   night; add a contrast state to /dev/kit so regressions stay visible.
10. ✅ **DONE 2026-08-27** — **Elevation tokens sweep** — fold bespoke `box-shadow`s into the `--shadow-*`
    scale; document the levels in devkit ▸ Fondations.
11. ✅ **DONE 2026-08-27** — **`:focus-visible` ring consistency** — one token ring across chips, member
    discs, board tiles, kid tiles.
13. ✅ **DONE 2026-08-27** — **PWA theming polish** — manifest `theme_color`/splash matched to day/night.
14. ✅ **DONE 2026-08-27** — **360px typographic rhythm pass** — one heading ramp for HubHead vs SceneHead
    on narrow phones.
16. ✅ **DONE 2026-08-27** — **Ctrl+Z fires the newest undo entry** (desktop) — the toast already holds it.
17. ✅ **DONE 2026-08-27** — **Pull-to-refresh on mobile hub bodies** — invalidate the tab's keys.
18. ✅ **DONE 2026-08-27** — **FAB long-press → instant voice capture** — hold ＋, speak, release; rides
    the existing mic + capture spine.
25. ✅ **DONE 2026-08-27** — **Age cue on fridge notes** — quiet `formatAgo` stamp (client-only; origin
    marker would need a column — out of scope).
26. ✅ **DONE 2026-08-27** — **Stale deep-link bounce says why** — cook/multi-cook/recipe links to a
    deleted recipe get a toast instead of a silent /kitchen landing.

Rejected from the same list (do not re-propose without new information): 2, 3,
4, 5, 7, 9, 12, 15, 19, 20, 21, 22, 23, 24, 27 — parked, several remain
documented as tier-3 seams in `11-friction-audit.md`.

**Active direction instead (Marc, same day):** routines UI/UX/accessibility —
a frictionless parent/toddler routine experience (e.g. going BACK to reselect a
step). Exploration in progress.
