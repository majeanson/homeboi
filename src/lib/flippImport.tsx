import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { BOARD_KEY } from './queryKeys'
import { isGuest } from './device'
import { useConfirm } from './confirm'
import { useNotice } from './toast'
import { useT } from '../i18n'
import type { Deal } from './deals'
import { parseFlippHash, type FlippExport } from './flippList'
import { type ListItem, matchListItem, parseDeal, stageDeal, ensureListLine, checkListLine } from './picks'

// THE WAY BACK: Flipp → Babillard (2026-09-10, the evening the other direction
// landed in Marc's Flipp app). The bookmark's second answer reads Flipp's list and
// opens `/liste#flipp=<base64url>` on THIS origin — a hash, so it never reaches a
// server log, and ours, so no clipboard is involved. What comes back:
//   · a clipping the household made IN Flipp (browsing the app's flyers) → the deal
//     staged on the matching grocery line, or a new line carrying it (`stageDeal`,
//     the one deal↔item seam — never a duplicate line);
//   · a typed item not on our list → a new line (`ensureListLine`);
//   · anything CHECKED in Flipp at the store → checked here (a MARK, never a buy
//     logged — that stays « Vider les cochés »).
// Nothing is ever removed, and nothing is written before the household has read
// what would change and said yes. Same list, same rules, one more door.

export interface FlippImportPlan {
  deals: { name: string; deal: Deal }[]
  newLines: string[]
  checkIds: string[]
}

/** A Flipp clipping as the Deal our list stores — the fields the till reads. */
function dealFrom(c: FlippExport['clippings'][number]): Deal {
  const price = c.price == null ? null : Number(String(c.price).replace(',', '.'))
  return {
    id: c.flyerItemId,
    flyerId: c.flyerId,
    name: c.name,
    price: price != null && Number.isFinite(price) ? price : null,
    wasPrice: null,
    unitPrice: null,
    unitLabel: null,
    unitKind: null,
    unitApprox: false,
    merchant: c.merchantName,
    logo: c.merchantLogoUrl,
    premium: false,
    image: c.thumbnailUrl,
    validFrom: null,
    validTo: c.validTo,
    merchantId: c.merchantId,
    box: null,
  }
}

/** What an export would change on this list — pure, so it can be shown and tested. */
export function planFlippImport(e: FlippExport, list: ListItem[]): FlippImportPlan {
  const deals: FlippImportPlan['deals'] = []
  const newLines: string[] = []
  const checkIds = new Set<string>()
  const seenNew = new Set<string>()
  for (const c of e.clippings) {
    if (!c || !c.flyerItemId || !c.name) continue
    const m = matchListItem(list, c.name)
    const already = m ? parseDeal(m.deal_json)?.id === c.flyerItemId : false
    if (!already) deals.push({ name: c.name, deal: dealFrom(c) })
    if (c.checked && m && !m.checked_at) checkIds.add(m.id)
  }
  for (const it of e.items) {
    const term = (it?.term ?? '').trim()
    if (!term) continue
    const m = matchListItem(list, term)
    if (!m) {
      const key = term.toLowerCase()
      if (!seenNew.has(key)) {
        seenNew.add(key)
        newLines.push(term)
      }
      continue
    }
    if (it.checked && !m.checked_at) checkIds.add(m.id)
  }
  return { deals, newLines, checkIds: [...checkIds] }
}

/** Mounted by the Liste page: consumes `#flipp=` once the list is known, asks,
 *  applies. A guest (read-only) is told nothing came in — the hash is just dropped. */
export function useFlippImport() {
  const t = useT()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const notice = useNotice()
  const { data: board } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<{ list: ListItem[] }>('board'), ...live })
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !board) return
    const e = parseFlippHash(window.location.hash)
    if (!e) return
    done.current = true
    // Consume the hash FIRST: a refresh or a back-nav must not ask twice.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (isGuest()) return
    const plan = planFlippImport(e, board.list)
    const total = plan.deals.length + plan.newLines.length + plan.checkIds.length
    if (total === 0) {
      notice(t.list.flippImportNothing)
      return
    }
    void (async () => {
      const ok = await confirm({
        message: t.list.flippImportConfirm(plan.deals.length, plan.newLines.length, plan.checkIds.length),
        confirmLabel: t.list.flippImportGo,
      })
      if (!ok) return
      let n = 0
      for (const d of plan.deals) if ((await stageDeal(qc, d.name, d.deal)) != null) n++
      for (const term of plan.newLines) if ((await ensureListLine(qc, term)) != null) n++
      for (const id of plan.checkIds) if (await checkListLine(qc, id)) n++
      notice(t.list.flippImported(n))
    })()
  }, [board, qc, confirm, notice, t])
}
