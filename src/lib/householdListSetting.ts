import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from './api'
import { useWrite } from './write'
import { useUndoToast } from './toast'
import { HOUSEHOLD_KEY } from './queryKeys'
import { PALETTE } from './colors'

// A "household list setting" — a small editable list of `{id, name, colour}` items
// stored in ONE `households.*` JSON column and edited from a Réglages section. Today:
// **cars** (« L'auto ») and **reserveLocations** (La réserve), which were byte-for-byte
// copies of the same state + read-seed + whole-array PATCH + optimistic-save +
// undoable-delete logic. This hook owns all of it so the two can't drift and a future
// such setting reuses it instead of hand-rolling.
//
// READ: once on mount via `api('household')` (the editor owns local state — it does NOT
// re-render on the board's HOUSEHOLD_KEY poll), seeded with localized defaults when the
// column was never set. WRITE: a whole-array PATCH via `useWrite` (offline-safe,
// invalidates HOUSEHOLD_KEY so every reader — useCars / useReserveLocations — re-reads).
// KNOWN LIMITATION (carried, not introduced): the whole-array PATCH means two concurrent
// operator tabs last-write-win; acceptable under one-operator-per-household (kiosks are
// blocked from these writes server-side).
export interface HouseholdListItem {
  id: string
  name: string
  color?: string // "#rrggbb"
}

export function useHouseholdListSetting<T extends HouseholdListItem>(
  field: string, // the /api/household read + PATCH key ('cars' | 'reserveLocations')
  seed: () => T[], // localized defaults when the column was never set
  clearedMessage: (name: string) => string, // undo-toast copy for a delete
): {
  items: T[] | null
  status: 'idle' | 'saved' | 'bad'
  setItems: Dispatch<SetStateAction<T[] | null>>
  rename: (id: string, name: string) => void
  recolor: (id: string, color: string) => void
  remove: (id: string) => void
  add: (name: string) => void
} {
  const write = useWrite()
  const undo = useUndoToast()
  const [items, setItems] = useState<T[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')

  // Seed from the stored list, or the localized defaults when never set. Mount-once —
  // the seed labels are stable for the session (the read hook owns freshness elsewhere).
  useEffect(() => {
    api<Record<string, T[] | null | undefined>>('household')
      .then((r) => setItems(r[field] ?? seed()))
      .catch(() => setItems(seed()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = useCallback(
    async (next: T[]) => {
      setStatus('idle')
      try {
        await write('household', { method: 'PATCH', body: { [field]: next }, affectedKeys: [HOUSEHOLD_KEY] })
        setStatus('saved')
      } catch {
        setStatus('bad')
      }
    },
    [write, field],
  )

  // Optimistic local update + persist. Used by rename/recolor/add directly, and as the
  // deferred commit behind a delete's undo toast.
  const save = useCallback(
    (next: T[]) => {
      setItems(next)
      void persist(next)
    },
    [persist],
  )

  // Handlers read the closure `items` (recreated each render after every setItems, like
  // the original sections did) and keep side-effects OUT of the setState updater, so a
  // StrictMode double-invoked updater can't double-persist.
  const rename = (id: string, name: string) => {
    if (items) save(items.map((x) => (x.id === id ? { ...x, name } : x)))
  }
  const recolor = (id: string, color: string) => {
    if (items) save(items.map((x) => (x.id === id ? { ...x, color } : x)))
  }
  // Remove behind the deferred undo toast (the app-wide calm-delete shape): drop it from
  // the view now, hold the PATCH. Undo restores the prior list (nothing reached the
  // server); commit persists the trimmed list.
  const remove = (id: string) => {
    if (!items) return
    const prev = items
    const it = prev.find((x) => x.id === id)
    const next = prev.filter((x) => x.id !== id)
    setItems(next)
    undo({ message: clearedMessage(it?.name ?? ''), onUndo: () => setItems(prev), onCommit: () => void persist(next) })
  }
  const add = (rawName: string) => {
    if (!items) return
    const name = rawName.trim().slice(0, 40)
    if (!name) return
    const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 12)
    const color = PALETTE[items.length % PALETTE.length]
    save([...items, { id, name, color } as T])
  }

  return { items, status, setItems, rename, recolor, remove, add }
}
