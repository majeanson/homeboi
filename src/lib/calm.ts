// "Calm mode" — the household's one toggle over the kid-routine REWARD.
//
// It governs exactly ONE thing, and this is the whole list:
//   ON (default): a finished routine ends reward-free — the recap ("sweet dreams",
//     the story again in pictures, the ⏱ total, a deliberate « Recommencer ») and
//     nothing to collect. No sticker offer, and the sticker wall doesn't exist.
//   OFF: the same recap, plus the child places ONE sticker on their wall
//     (RoutinePlayer's picker, the Routines-tab entry, /routine/stickers).
//
// It is NOT "no redo" — « Recommencer » is always there, on both settings (it used
// to claim otherwise in three places, while the code did the opposite). And it does
// NOT unlock the STRUCTURAL calm guarantees: no points, no streaks, no badges, no
// push, no inventory, finite lists — those are enforced in the schema by
// functions/db/migrations/calm-tenets.test.ts and can't be toggled at all.
//
// Same context shape as Lang/Audience; localStorage for now (promote to
// households.calm_mode when settings persist server-side — see bmad/04, OD-1).
import { createContext, useContext } from 'react'

export const CalmContext = createContext<{ calm: boolean; setCalm: (c: boolean) => void }>({
  calm: true,
  setCalm: () => {},
})

export const useCalm = () => useContext(CalmContext)
