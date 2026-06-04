// "Calm mode" — the household's opt-out of the kid-routine completion friction.
// Default ON: the routine finishes and STOPS (no redo), per the brief's calm
// tenet. OFF: cards stay visible and re-tappable so a routine never dead-ends.
// This only governs INTERACTION friction; the STRUCTURAL guarantees (no points,
// no push, finite lists) are not toggleable and stay enforced. Same context
// shape as Lang/Audience; localStorage for now (promote to households.calm_mode
// when settings persist server-side — see bmad/04, OD-1).
import { createContext, useContext } from 'react'

export const CalmContext = createContext<{ calm: boolean; setCalm: (c: boolean) => void }>({
  calm: true,
  setCalm: () => {},
})

export const useCalm = () => useContext(CalmContext)
