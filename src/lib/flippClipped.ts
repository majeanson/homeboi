import { createDeviceStore } from './createDeviceStore'

// Where the Flipp loop stands on THIS device — the picks whose Flipp item page the
// till grid has opened so far (by Flipp flyer_item_id).
//
// Device-local on purpose, not household data: a Flipp clipping lives in the
// browser that made it (flipp.com's own localStorage — probed 2026-09-10), so the
// phone that stepped through the loop is the phone whose Flipp list holds the
// result; the wall tablet has nothing to show for it. It is a bookmark, not a score:
// it says which pick the stepper opens next, and « Reprendre du début » clears it.
// A stale id (last week's deal) simply matches no current pick.
const store = createDeviceStore<number[]>('babillard-flipp-clipped', [], {
  // The default decoder merges over `defaults` as an OBJECT — on an array that
  // would come back as {0: …}. Arrays decode plainly.
  read: (raw) => {
    if (!raw) return []
    try {
      const v = JSON.parse(raw) as unknown
      return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []
    } catch {
      return []
    }
  },
})

export const useFlippClipped = store.use
export function markFlippClipped(id: number) {
  const cur = store.get()
  if (cur.includes(id)) return
  // Bounded: a device that shops for years never grows this past a few weeks of deals.
  store.set([...cur, id].slice(-200))
}
export const resetFlippClipped = store.reset
