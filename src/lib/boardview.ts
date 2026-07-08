// How the parent board lays itself out, chosen per device and remembered (a wall
// kiosk and a phone each keep their own pick). TWO takes on the SAME board data:
//   • bento  — « Grille »: today / tomorrow / upcoming, the everyday glance.
//   • month  — « Mois »: a six-week calendar of everything dated (events/meals/
//              chores/notes); tap a day to plan it.
//   • annee  — « L'année » (A-1, bmad/09): twelve mini-months of only the year's
//              FIXED points (fêtes, birthdays, trips, upkeep, long jeu) — a
//              horizon, not a planner; tap a month to open it in Mois.
// The per-person split is the FACE PICKER beside the toggle (Maisonnée = everyone,
// a face = just their items), not a separate layout; the windowed recap/handoff is
// the « Moments » SCENE (/moment), reached by a button — not a third glance view.
// (The retired next/lanes/moment/jour layouts migrate to 'bento' below.)
// Persisted to localStorage; the corner toggle on the board flips it.
export type BoardView = 'bento' | 'month' | 'annee'

const KEY = 'babillard-boardview'

export function readBoardView(): BoardView {
  try {
    // Only 'month'/'annee' survive as alternates; every legacy value (next/lanes/
    // moment/jour) falls through to the default grid so an old device doesn't land nowhere.
    const v = localStorage.getItem(KEY)
    if (v === 'month' || v === 'annee') return v
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
