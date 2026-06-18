import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
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
  const open = useCallback((m: DetailModel) => setModel(m), [])
  const close = useCallback(() => setModel(null), [])
  return (
    <DetailContext.Provider value={{ open, close }}>
      {children}
      <EntityDetailSheet model={model} onClose={close} />
    </DetailContext.Provider>
  )
}

export const useEntityDetail = () => useContext(DetailContext)
