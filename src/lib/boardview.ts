// How the parent board lays itself out, chosen per device and remembered (a wall
// kiosk and a phone each keep their own pick). Three takes on the SAME board data:
//   • bento  — the default calm grid (today / tomorrow / upcoming).
//   • next   — "Now & Next": the next thing up, big, departure-board style.
//   • lanes  — one column per family member (their events + current chore).
//   • month  — a six-week calendar of everything dated (events/meals/chores/notes).
//   • moment — « Moments »: a chosen window (tonight / tomorrow / a date / the week)
//              with each day's agenda + its « À compléter » handoff checklist.
//   • jour   — « La journée »: the unified PROTOTYPE — a face lens (Maisonnée / a
//              person) + scopes (Maintenant + « À régler », Aujourd'hui) rendered
//              through the shared DaySection. The eventual replacement for next +
//              lanes (+ moment); the old views stay as reference while we iterate.
// Persisted to localStorage; a tiny corner toggle on the board cycles it.
export type BoardView = 'bento' | 'next' | 'lanes' | 'month' | 'moment' | 'jour'

const KEY = 'babillard-boardview'

export function readBoardView(): BoardView {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'next' || v === 'lanes' || v === 'month' || v === 'moment' || v === 'jour') return v
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
