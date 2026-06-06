// One shared opener for the ＋ Add bottom-sheet. HubLayout owns the sheet's state
// and renders the single <AddSheet>; anything inside the hub (the ＋ FAB, the
// mobile board's quick-capture bar) opens it through this context. Keeping ONE
// sheet mounted avoids duplicate dialogs (and duplicate selectors in e2e).
import { createContext, useContext } from 'react'

export const AddSheetContext = createContext<{ open: () => void }>({ open: () => {} })

export const useAddSheet = () => useContext(AddSheetContext)
