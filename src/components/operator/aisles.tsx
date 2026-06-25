import { useEffect, useState } from 'react'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { DragPill } from '../DragPill'
import { StatusMessage } from '../StatusMessage'
import { OperatorSection } from './OperatorSection'
import { InlineIcon } from '../Icon'
import { AISLES, AISLE_BY_ID, type AisleId } from '../../lib/aisle'

// Réglages ▸ Magasinage. The household's grocery AISLE ORDER — drag the aisles into
// the layout of YOUR store, so La liste's "Par allée" sort follows your actual walk
// (produce → bakery → meat → …). Reorder-only (the aisle SET is fixed in phase 1):
// 'autres' is omitted because it's always pinned last (see aisleRanks). Persists on
// /api/household; saving invalidates HOUSEHOLD_KEY so the list re-sorts live (it
// reads the same key via useAisleOrder). Items are CLASSIFIED by reusing the row
// pictures (pictoFor) — this only sets the order, never counts anything (calm).
const ORDERABLE: AisleId[] = AISLES.filter((a) => a.id !== 'autres').map((a) => a.id)

// Filter a saved order to the orderable set, append any missing aisle in default
// order (e.g. a future built-in), so the editable list is always complete.
function normalize(saved: AisleId[] | null | undefined): AisleId[] {
  const seen = new Set<AisleId>()
  const out: AisleId[] = []
  for (const id of saved ?? []) if (ORDERABLE.includes(id) && !seen.has(id)) (seen.add(id), out.push(id))
  for (const id of ORDERABLE) if (!seen.has(id)) out.push(id)
  return out
}

export function AisleOrderSection() {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const ro = isGuest()
  const [order, setOrder] = useState<AisleId[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')

  useEffect(() => {
    api<{ aisleOrder?: AisleId[] | null }>('household')
      .then((r) => setOrder(normalize(r.aisleOrder)))
      .catch(() => setOrder([...ORDERABLE]))
  }, [])

  function save(next: AisleId[]) {
    setOrder(next)
    setStatus('idle')
    write('household', { method: 'PATCH', body: { aisleOrder: next }, affectedKeys: [HOUSEHOLD_KEY] })
      .then(() => setStatus('saved'))
      .catch(() => setStatus('bad'))
  }

  // Reuse the shared pointer DnD (same grip + ghost as La liste's reorder). A drop
  // moves the dragged aisle to the target index; we read the live order at drop time.
  const dnd = usePointerDnd({
    onDrop: (fromId, toZone) => {
      const from = Number(fromId)
      const to = Number(toZone)
      if (!order || !Number.isInteger(from) || !Number.isInteger(to) || from === to) return
      if (from < 0 || from >= order.length || to < 0 || to >= order.length) return
      const next = [...order]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      save(next)
    },
    holdMs: DND_HOLD_MS,
  })

  if (order === null) return <p className="loading mono">{t.common.loading}</p>

  return (
    <OperatorSection
      title={t.operator.aisleOrder}
      hint={t.operator.aisleOrderHint}
      action={
        !ro ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => save([...ORDERABLE])}>
            <InlineIcon name="arrow-counter-clockwise-bold" /> {t.operator.aisleReset}
          </button>
        ) : undefined
      }
    >
      <ul className="operator__list aisle-order">
        {order.map((id, i) => {
          const a = AISLE_BY_ID[id]
          return (
            <DragPill
              key={id}
              dnd={dnd}
              index={i}
              label={a.label[lang]}
              className="aisle-order__row"
              showGrip={!ro}
            >
              <span className="aisle-order__pos mono" aria-hidden="true">
                {i + 1}
              </span>
              <span className="aisle-order__emoji" aria-hidden="true">
                {a.emoji}
              </span>
              <span className="aisle-order__name">{a.label[lang]}</span>
            </DragPill>
          )
        })}
        {/* "Autres" is always last — shown greyed so it's clear unclassified items
            land at the end, but it can't be reordered. */}
        <li className="aisle-order__row aisle-order__row--pinned" aria-hidden="true">
          <span className="aisle-order__pos mono">{order.length + 1}</span>
          <span className="aisle-order__emoji">{AISLE_BY_ID.autres.emoji}</span>
          <span className="aisle-order__name">{AISLE_BY_ID.autres.label[lang]}</span>
        </li>
      </ul>
      {status === 'saved' && <StatusMessage tone="success">{t.operator.postalSaved}</StatusMessage>}
      {status === 'bad' && <StatusMessage tone="error">{t.operator.postalBad}</StatusMessage>}
      <DragGhost ghost={dnd.ghost} />
    </OperatorSection>
  )
}
