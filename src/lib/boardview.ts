// How the parent board lays itself out, chosen per device and remembered (a wall
// kiosk and a phone each keep their own pick). Three takes on the SAME board data:
//   • bento  — the default calm grid (today / tomorrow / upcoming).
//   • next   — "Now & Next": the next thing up, big, departure-board style.
//   • lanes  — one column per family member (their events + current chore).
//   • month  — a six-week calendar of everything dated (events/meals/chores/notes).
// Persisted to localStorage; a tiny corner toggle on the board cycles it.
export type BoardView = 'bento' | 'next' | 'lanes' | 'month'

const KEY = 'babillard-boardview'

export function readBoardView(): BoardView {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'next' || v === 'lanes' || v === 'month') return v
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
