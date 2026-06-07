// The "cashier list": flyer deals the household staged to show at the till, kept
// per device in localStorage and keyed by the shared-list item they price-match.
// Lifted out of Liste so EVERY surface that finds a deal — the per-item price-match
// sheet, the deals browser, the full-flyer viewer — can stage one in a single tap
// and have it reflect on the list row AND flow to the cashier stepper. A pick
// survives its grocery item being checked off (you build the list at home, present
// it in store), so it's its own store, not derived from the list.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type Deal, type Pick } from './deals'

export type PickEntry = { deal: Deal; itemText: string }
export type Picks = Record<string, PickEntry>

const KEY = 'babillard-cashier-picks'

function load(): Picks {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Picks) : {}
  } catch {
    return {}
  }
}

const PicksContext = createContext<{
  picks: Picks
  pick: (itemId: string, itemText: string, deal: Deal) => void
  remove: (itemId: string) => void
  clear: () => void
}>({ picks: {}, pick: () => {}, remove: () => {}, clear: () => {} })

export function PicksProvider({ children }: { children: ReactNode }) {
  const [picks, setPicks] = useState<Picks>(load)

  // Persist so the picks are there at the store (deals go stale weekly — re-pick then).
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(picks))
    } catch {
      /* storage full / private mode — picks just won't persist */
    }
  }, [picks])

  const pick = (itemId: string, itemText: string, deal: Deal) =>
    setPicks((p) => ({ ...p, [itemId]: { deal, itemText } }))
  const remove = (itemId: string) =>
    setPicks((p) => {
      const { [itemId]: _, ...rest } = p
      return rest
    })
  const clear = () => setPicks({})

  return <PicksContext.Provider value={{ picks, pick, remove, clear }}>{children}</PicksContext.Provider>
}

export const usePicks = () => useContext(PicksContext)

// The Pick[] the cashier stepper wants, built from the store directly so a pick
// survives even after its grocery item is checked off the list.
export function toPickList(picks: Picks): Pick[] {
  return Object.entries(picks).map(([itemId, v]) => ({ itemId, itemText: v.itemText, deal: v.deal }))
}
