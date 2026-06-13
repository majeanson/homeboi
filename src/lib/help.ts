// "Tutorial mode" — whether the contextual "?" help dots show across the app.
// ON (default) = tutorial: a parent setting up the wall sees the little "?" next
// to each section, each deep-linking into the matching Guide card. OFF = expert:
// the dots vanish for a household that knows the app. Purely a display choice
// (no data, no gating); same context shape as Calm/Lang, localStorage for now.
import { createContext, useContext } from 'react'

export const HelpContext = createContext<{ tutorial: boolean; setTutorial: (v: boolean) => void }>({
  tutorial: true,
  setTutorial: () => {},
})

export const useHelp = () => useContext(HelpContext)
