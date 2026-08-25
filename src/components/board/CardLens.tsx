import { createContext, useContext } from 'react'

// The per-CARD reading of the compact lens: is THIS slot rendered narrow enough to
// warrant a compact form, and has the household tapped it open? One provider per
// `CardSlot` (mirrors `useWidgetGrid`, which is per-ZONE) — a card rendered outside a
// slot (DevKit) reads `null` and renders its full form, same as
// `useWidgetGrid` does there.
//
// PHASE 1 (this file, the seam): `CardSlot` computes `compact` for real — measured
// span × the grid's measured column width, via `lib/widgetGrid.isCompact` — but
// `expanded` is always `false` and `expand`/`collapse` are no-ops. Nothing reads this
// context yet, so the board renders pixel-identical. A later phase wires the actual
// single-open, transient (never persisted) expand state, and teaches `Section` /
// `BoardCard` to render a generic compact form when `compact && !expanded`.
export interface CardLens {
  /** This slot's rendered width is below the compact threshold (`WG_COMPACT_MAX`). */
  compact: boolean
  /** Temporarily grown to the zone's full width. Transient — never persisted, resets
   *  on reload, and collapses the moment board edit mode arms. */
  expanded: boolean
  expand: () => void
  collapse: () => void
}

const Ctx = createContext<CardLens | null>(null)

export const CardLensProvider = Ctx.Provider

/** Read the compact lens for the card this hook is called from. Null outside a
 *  `CardSlot` (a card rendered standalone renders its full form, same as
 *  `useWidgetGrid`). */
export const useCardLens = (): CardLens | null => useContext(Ctx)
