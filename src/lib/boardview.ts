// How the parent board lays itself out, chosen per device and remembered (a wall
// kiosk and a phone each keep their own pick). TWO takes on the SAME board data:
//   • bento  — « Grille »: today / tomorrow / upcoming, the everyday glance.
//   • semaine — « La semaine » (2026-09-15): seven days from TODAY, spelled out.
//              The rung this ladder was missing — day / month / year existed and the
//              unit a household actually plans in did not. Month is too dense at
//              390px to answer "who's where Thursday"; the day page is too narrow to
//              answer "is Thursday already full". Same /api/month payload, same
//              builder (components/board/dayLines), different layout.
//   • month  — « Mois »: a six-week calendar of everything dated (events/meals/
//              chores/notes); tap a day to plan it.
//   • annee  — « L'année » (A-1, bmad/09): twelve mini-months of only the year's
//              FIXED points (fêtes, birthdays, trips, upkeep, long jeu) — a
//              horizon, not a planner; tap a month to open it in Mois.
// The per-person split is the FACE PICKER beside the toggle (Maisonnée = everyone,
// a face = just their items), not a separate layout. A single day is the DAY PAGE
// (/kitchen/day/:date), reached by tapping a date in Mois — not a glance view.
// (The retired next/lanes/moment/jour layouts migrate to 'bento' below.)
// Persisted to localStorage; the corner toggle on the board flips it.
export type BoardView = 'bento' | 'semaine' | 'month' | 'annee'

const KEY = 'babillard-boardview'

export function readBoardView(): BoardView {
  try {
    // Only 'month'/'annee' survive as alternates; every legacy value (next/lanes/
    // moment/jour) falls through to the default grid so an old device doesn't land nowhere.
    const v = localStorage.getItem(KEY)
    if (v === 'semaine' || v === 'month' || v === 'annee') return v
  } catch {
    /* noop */
  }
  return 'bento'
}

export function saveBoardView(v: BoardView): void {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* noop */
  }
}
