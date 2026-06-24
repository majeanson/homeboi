import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { EntityDetailSheet } from './EntityDetailSheet'
import type { DetailModel } from '../../lib/detail'

// The shell-level host for the entity-detail peek: one EntityDetailSheet, one
// piece of "currently-open model" state, exposed through useEntityDetail() so ANY
// board/kitchen row can open a detail with a single call:
//
//   const detail = useEntityDetail()
//   <Act ... onOpen={() => detail.open(buildEvent(e, { t, lang, members }))} />
//
// Mounted inside HubLayout (under Router/Query/Profile/Audience), so the sheet
// can navigate, read hearts, and draw member faces. Parent-audience surfaces call
// open(); the toddler lens never does (it stays hear-first).
interface DetailApi {
  open: (model: DetailModel) => void
  close: () => void
}

const DetailContext = createContext<DetailApi>({ open: () => {}, close: () => {} })

export function DetailProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<DetailModel | null>(null)
  // The control (a board/kitchen row) that opened the peek — so closing returns focus
  // there instead of dropping it to <body>, keeping keyboard/AT users oriented (a11y).
  const openerRef = useRef<HTMLElement | null>(null)
  const open = useCallback((m: DetailModel) => {
    const el = document.activeElement
    openerRef.current = el instanceof HTMLElement ? el : null
    setModel(m)
  }, [])
  const close = useCallback(() => {
    setModel(null)
    const el = openerRef.current
    openerRef.current = null
    // After the sheet unmounts + its focus trap releases, return focus to the opener (if
    // it's still on the page — a row removed by the action is just skipped).
    if (el && el.isConnected) requestAnimationFrame(() => el.focus())
  }, [])
  return (
    <DetailContext.Provider value={{ open, close }}>
      {children}
      <EntityDetailSheet model={model} onClose={close} />
    </DetailContext.Provider>
  )
}

export const useEntityDetail = () => useContext(DetailContext)
