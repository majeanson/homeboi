import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { EditField } from '../EditField'
import { CheckRow } from '../CheckRow'
import { BOARD_KEY } from '../../lib/queryKeys'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'
import { type LowRow, type PantryData, PANTRY_KEY, USE_SOON_KEY } from './types'

// Garde-manger: the "running low" list (never a full inventory — brief tenet 3)
// and the "use soon" list. Owns its own adds + undo-deferred clears; the parent
// page only passes the rows (it keeps the queries for the unauth gate). `help` is
// the kitchen's page-level help mode — makes the two headings explainable in place.
export function PantryTab({ low, soon, help }: { low: LowRow[]; soon: LowRow[]; help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  // Bulletproof calm-delete for these two LIVE-POLLED lists: hide the row in local
  // state + filter it out of the render, hold the real write behind the undo toast,
  // and await a refetch before un-hiding — so a background poll can't resurrect it
  // mid-undo (the "remove fast, it comes back, then vanishes" glitch). One instance
  // per list (low / use-soon), since each has its own query key + poll.
  const lowRemoval = useDeferredRemoval(PANTRY_KEY)
  const soonRemoval = useDeferredRemoval(USE_SOON_KEY)
  // The low/use-soon adds are EditField — it hides its own box for a read-only guest.
  // CheckRow already hides its own check/rename/delete for a guest.
  const [newLow, setNewLow] = useState('')
  const [newSoon, setNewSoon] = useState('')

  // Add one low item. `viaVoice` skips the put-it-back-on-failure (the field is
  // already cleared by the voice path and the spoken word is gone anyway).
  async function postLow(item: string, viaVoice = false) {
    const v = item.trim()
    if (!v) return
    try {
      await write('pantry', { method: 'POST', body: { item: v }, affectedKeys: [PANTRY_KEY] })
    } catch {
      // A failed write must not eat what was typed — put it back to retry. (Offline
      // queues instead of throwing, so the field clears and the item syncs later.)
      if (!viaVoice) setNewLow(v)
    }
  }
  // Speak a string of items into the low list, hands-free — same continuous +
  // split + pause-cut mic as La liste, so "patate … blé d'inde … tarte" lands as
  // three. Each finished phrase posts straight away. [shared VoiceButton]
  const lowVoice = useVoiceInput(
    (text) => {
      setNewLow('')
      void postLow(text, true)
    },
    { continuous: true, split: true },
  )

  // Checking a low item is the ONLY thing that puts it on the shopping list:
  // marking something low never touched the list (see api/pantry POST). The tap
  // adds it to the shared list AND clears the low flag — deferred behind the undo
  // toast so a mis-tap costs nothing and never round-trips.
  function checkLowItem(l: LowRow) {
    lowRemoval.remove([l.id], t.undo.addedToList(l.item), async () => {
      // Add to the shared list first, then drop the low flag.
      await write('list', { method: 'POST', body: { text: l.item }, affectedKeys: [BOARD_KEY] }).catch(() => {})
      await write('pantry', { method: 'DELETE', body: { id: l.id }, affectedKeys: [PANTRY_KEY] }).catch(() => {})
    })
  }
  // Delete a low item WITHOUT putting it on the list (the 🗑️) — a real gap before:
  // a mis-typed "running low" could only leave by being shopped. Deferred undo.
  function removeLowItem(l: LowRow) {
    lowRemoval.remove([l.id], t.undo.cleared(l.item), () =>
      write('pantry', { method: 'DELETE', body: { id: l.id }, affectedKeys: [PANTRY_KEY] }).catch(() => {}),
    )
  }
  // Rename a low item in place (the ✏️). Optimistic, then persist.
  async function renameLowItem(l: LowRow, item: string) {
    const v = item.trim()
    if (!v || v === l.item) return
    qc.setQueryData<PantryData>(PANTRY_KEY, (d) =>
      d ? { low: d.low.map((x) => (x.id === l.id ? { ...x, item: v } : x)) } : d,
    )
    await write('pantry', { method: 'PATCH', body: { id: l.id, item: v }, affectedKeys: [PANTRY_KEY] }).catch(() => {})
  }

  async function postSoon(item: string, viaVoice = false) {
    const v = item.trim()
    if (!v) return
    try {
      await write('use-soon', { method: 'POST', body: { item: v }, affectedKeys: [USE_SOON_KEY] })
    } catch {
      if (!viaVoice) setNewSoon(v)
    }
  }
  const soonVoice = useVoiceInput(
    (text) => {
      setNewSoon('')
      void postSoon(text, true)
    },
    { continuous: true, split: true },
  )

  // Clear a use-soon item (used it / tossed it). Deferred behind the undo toast,
  // like the low list. No list side-effects — use-soon never touches shopping.
  function clearSoonItem(s: LowRow) {
    soonRemoval.remove([s.id], t.undo.cleared(s.item), () =>
      write('use-soon', { method: 'DELETE', body: { id: s.id }, affectedKeys: [USE_SOON_KEY] }).catch(() => {}),
    )
  }
  async function renameSoonItem(s: LowRow, item: string) {
    const v = item.trim()
    if (!v || v === s.item) return
    qc.setQueryData<{ soon: LowRow[] }>(USE_SOON_KEY, (d) =>
      d ? { soon: d.soon.map((x) => (x.id === s.id ? { ...x, item: v } : x)) } : d,
    )
    await write('use-soon', { method: 'PATCH', body: { id: s.id, item: v }, affectedKeys: [USE_SOON_KEY] }).catch(
      () => {},
    )
  }

  return (
    <>
      <section>
        <HelpTitle help={help} k="low">{t.kitchen.low}</HelpTitle>
        {help?.bubbleFor('low')}
        <EditField
          value={newLow}
          onChange={setNewLow}
          onSubmit={(v) => {
            setNewLow('')
            void postLow(v)
          }}
          voice={lowVoice}
          submitLabel={t.capture.add}
          placeholder={lowVoice.listening ? t.capture.listening : t.kitchen.lowAdd}
          ariaLabel={t.kitchen.lowAdd}
        />
        {lowRemoval.visible(low).length === 0 ? (
          <p className="board__empty mono">{t.kitchen.lowEmpty}</p>
        ) : (
          <ul className="kitchen__low">
            {lowRemoval.visible(low).map((l) => (
              <CheckRow
                key={l.id}
                item={l.item}
                note={t.kitchen.addToList}
                onCheck={() => checkLowItem(l)}
                checkLabel={t.kitchen.addToList}
                onRename={(item) => renameLowItem(l, item)}
                onDelete={() => removeLowItem(l)}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <HelpTitle help={help} k="useSoon">{t.kitchen.useSoon}</HelpTitle>
        {help?.bubbleFor('useSoon')}
        <EditField
          value={newSoon}
          onChange={setNewSoon}
          onSubmit={(v) => {
            setNewSoon('')
            void postSoon(v)
          }}
          voice={soonVoice}
          submitLabel={t.capture.add}
          placeholder={soonVoice.listening ? t.capture.listening : t.kitchen.useSoonAdd}
          ariaLabel={t.kitchen.useSoonAdd}
        />
        {soonRemoval.visible(soon).length === 0 ? (
          <p className="board__empty mono">{t.kitchen.useSoonEmpty}</p>
        ) : (
          <ul className="kitchen__soon">
            {soonRemoval.visible(soon).map((s) => (
              <CheckRow
                key={s.id}
                item={s.item}
                onCheck={() => clearSoonItem(s)}
                checkLabel={t.kitchen.useSoonCheck}
                onRename={(item) => renameSoonItem(s, item)}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
