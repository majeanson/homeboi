// One shared opener for the ＋ Add bottom-sheet. HubLayout owns the sheet's state
// and renders the single <AddSheet>; anything inside the hub (the ＋ FAB, the
// mobile board's quick-capture bar) opens it through this context. Keeping ONE
// sheet mounted avoids duplicate dialogs (and duplicate selectors in e2e).
// `open('routine')` jumps straight to that form (the Routines page's ＋), the
// no-arg call keeps the quick-capture default.
import { createContext, useContext } from 'react'

export type AddSheetMode = 'capture' | 'event' | 'chore' | 'routine'

export const AddSheetContext = createContext<{ open: (mode?: AddSheetMode) => void }>({ open: () => {} })

export const useAddSheet = () => useContext(AddSheetContext)
