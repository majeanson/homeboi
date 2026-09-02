import type { QueryClient } from '@tanstack/react-query'
import { BOARD_KEY } from './queryKeys'
import { noRushStart, type NoRushRow } from './listOrder'

// The ONE optimistic "new grocery line" cache splice, shared by every door that
// adds to La liste (the page's own add bar, the ＋ sheet's « Ajouter à la liste »,
// the ⚡ Quick add chips). It existed only on Liste's inline bar — so on the two
// FAB doors an offline/queued add painted NOTHING (« the quick add button doesn't
// add any item at all », Marc, 2026-09-02): the write was queued honestly, but no
// row appeared until the outbox replayed. Same slot the server settles a new line
// into (end of the errands, above the trailing « pas pressé » block).
interface BoardListFrame {
  list: Array<NoRushRow & { id: string; text: string; source?: string; checked_at: number | null }>
}

export function spliceListLine(qc: QueryClient, tmpId: string, text: string): void {
  qc.setQueryData<BoardListFrame>(BOARD_KEY, (b) => {
    if (!b) return b
    const list = [...b.list]
    list.splice(noRushStart(list), 0, { id: tmpId, text, source: 'manual', checked_at: null })
    return { ...b, list }
  })
}
