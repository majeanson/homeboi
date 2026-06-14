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
  | 'routine'
  | 'list-item'
  | 'quick-add'
  | 'flyer'
  | 'recipe'
  | 'meal'
  | 'pantry'
  | 'cook'

// What the ＋ offers, per hub section (keyed by the first path segment). One
// action → the sheet skips the chooser and opens that form directly. Liste's ＋
// is a small chooser: add a line, restock past items (Ajout rapide), or shop the
// flyers — the last two are navigate-only tiles (see NAV_TARGET in AddSheet).
export const SECTION_MODES: Record<string, AddSheetMode[]> = {
  board: ['capture', 'event', 'chore', 'routine'],
  // `cook` isn't an "add" — it's a shortcut to cook mode for the next meal due —
  // but it rides the kitchen ＋ as the most-wanted kitchen action (see AddSheet,
  // where it's navigate-only and resolves its target from the meal plan).
  kitchen: ['cook', 'recipe', 'meal', 'pantry'],
  routines: ['routine'],
  liste: ['list-item', 'quick-add', 'flyer'],
}

// The operator-grade forms (same gating the old chooser had): a kiosk that
// isn't signed in never sees these tiles. Everything else (capture, list,
// kitchen adds) already works on a paired kiosk via its device token.
export const OPERATOR_MODES = new Set<AddSheetMode>(['event', 'chore', 'routine'])

export const AddSheetContext = createContext<{ open: (mode?: AddSheetMode, modes?: AddSheetMode[]) => void }>({
  open: () => {},
})

export const useAddSheet = () => useContext(AddSheetContext)
