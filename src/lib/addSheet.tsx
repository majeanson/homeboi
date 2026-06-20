// One shared opener for the ＋ Add bottom-sheet. HubLayout owns the sheet's state
// and renders the single <AddSheet>; anything inside the hub opens it through
// this context. Keeping ONE sheet mounted avoids duplicate dialogs (and
// duplicate selectors in e2e). `open('routine')` jumps straight to that form;
// the no-arg call opens the CURRENT SECTION's default — the ＋ means "add a
// recipe" in the kitchen and "add to the list" on Liste, not one generic sheet.
// An optional `modes` overrides the section's chooser: Réglages (where the ＋ FAB
// is hidden) opens a single-form sheet, e.g. open('chore', ['chore']).
import { createContext, useContext } from 'react'

export type AddSheetMode =
  | 'capture'
  | 'event'
  | 'chore'
  | 'todo'
  | 'routine'
  // The Routines ＋ opens a small in-sheet picker (NOT a straight jump to the
  // builder): a "new routine" button plus the household's existing routines, each
  // tappable to edit. `routine` stays the create-only nav used by the board tile
  // and the Réglages add button; `routine-pick` is the manage-from-the-tab sheet.
  | 'routine-pick'
  | 'plan-today'
  | 'plan-tomorrow'
  // #17 departure mode — navigate-only to /board/departure (a leaving-the-house
  // screen: a chosen checklist template + today's events + weather). Not a form.
  | 'departure'
  | 'list-item'
  | 'quick-add'
  | 'flyer'
  | 'auto-pick'
  // Share the list out (the OS share sheet) — runs in place like auto-pick. Lives
  // behind the ＋ so the list page itself stays just the list.
  | 'share'
  | 'recipe'
  // Prepare the printable toddler recipe/activity book (#45) — navigate-only to
  // /kitchen/book. A ＋ action, NOT an on-page button in the recipe view.
  | 'book'
  | 'meal'
  | 'leftovers'
  | 'pantry'
  | 'reserve'
  | 'cook'
  // « Le cercle » ＋ chooser — all four are navigate-only (NAV_TARGET): a person
  // form, the family builder, and the connect / new-group flows opened on /cercle
  // via a ?param the page reads. No in-sheet form.
  | 'person'
  | 'family'
  | 'connect'
  | 'group'

// What the ＋ offers, per hub section (keyed by the first path segment). One
// action → the sheet skips the chooser and opens that form directly. Liste's ＋
// is a small chooser: add a line, restock past items (Ajout rapide), shop the
// flyers, or auto-pick the week's best prices. quick-add/flyer are navigate-only
// tiles (see NAV_TARGET in AddSheet); `auto-pick` runs an action in place (stages
// the best deal per line, then jumps to the cashier) — the page itself stays just
// the list, so no shopping action lives as an on-page button anymore.
export const SECTION_MODES: Record<string, AddSheetMode[]> = {
  // plan-today / plan-tomorrow are navigate-only shortcuts to the full day planner
  // (/kitchen/day/<date>): one place to set a day's meals + events + chores + note.
  // Their dates are dynamic, so AddSheet resolves the target at click time (like
  // cook/auto-pick) rather than through the static NAV_TARGET table.
  board: ['capture', 'event', 'chore', 'todo', 'routine', 'plan-today', 'plan-tomorrow', 'departure'],
  // `cook` isn't an "add" — it's a shortcut to cook mode for the next meal due —
  // but it rides the kitchen ＋ as the most-wanted kitchen action (see AddSheet,
  // where it's navigate-only and resolves its target from the meal plan). `reserve`
  // adds to La réserve (freezer/back-of-pantry stash), the third Garde-manger list.
  kitchen: ['cook', 'recipe', 'book', 'meal', 'leftovers', 'pantry', 'reserve'],
  // The Routines tab's ＋ is the manage picker (create new + edit existing),
  // resolved in-sheet — see the `routine-pick` panel in AddSheet.
  routines: ['routine-pick'],
  liste: ['list-item', 'quick-add', 'flyer', 'auto-pick', 'share'],
  // Le cercle: add a person, build a family, connect two people, or a new group —
  // all navigate-only tiles (the page opens connect/group from a ?param).
  cercle: ['person', 'family', 'connect', 'group'],
}

// The operator-grade forms a kiosk that isn't signed in never sees as ＋ tiles.
// NOTE: `routine-pick` is deliberately NOT here — managing kid routines is the
// wall tablet's own job and the /api/routines POST/PATCH already accept a paired
// kiosk's device token (only member admin + device pairing stay operator-only,
// see functions/api/routines.ts). So the Routines-tab ＋ manage picker (new + edit
// existing) works on a parent-audience kiosk, matching the backend. Everything
// else here (event/chore add forms, capture, list, kitchen adds) is unchanged.
export const OPERATOR_MODES = new Set<AddSheetMode>(['event', 'chore', 'routine'])

// The operator forms are full-screen SCENE routes now, not in-sheet forms: a
// tall multi-field form (a routine's name + member chips + template + card deck)
// strands its inputs under the mobile keyboard inside a height-capped sheet. As
// scenes they pin to the visible viewport and scroll. Every launch point routes
// here: the board chooser tiles (NAV_TARGET in AddSheet), the routines ＋ FAB and
// the Réglages add buttons (open() in HubLayout).
export const FORM_ROUTES: Partial<Record<AddSheetMode, string>> = {
  event: '/event/new',
  chore: '/chore/new',
  routine: '/routine/new',
}

export const AddSheetContext = createContext<{ open: (mode?: AddSheetMode, modes?: AddSheetMode[]) => void }>({
  open: () => {},
})

export const useAddSheet = () => useContext(AddSheetContext)
