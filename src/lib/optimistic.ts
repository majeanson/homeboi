import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isGuest } from './device'

// The one optimistic-write shape used across the app, factored out of the pages
// that each re-spelled it (KidView's card toggle, Liste's ghost add): apply the
// change to the cached data at once so the tap feels instant on a cheap tablet,
// roll back + resync if the write fails. (Distinct from the undo-toast pattern
// in lib/toast — that DEFERS the write; this one fires it immediately.)
export function useOptimisticMutation<TData, TVars>(opts: {
  queryKey: string[]
  mutationFn: (v: TVars) => Promise<unknown>
  apply: (old: TData, v: TVars) => TData
  // Keys to refetch once the write lands (success or failure) — e.g. the list a
  // ghost add feeds into. Leave empty when the live poll is freshness enough.
  invalidateOnSettled?: string[][]
}) {
  const qc = useQueryClient()
  return useMutation({
    // Read-only guest: never fire the write (mirrors the writeWith chokepoint).
    // This is the OTHER write path — KidView's routine progress — so guard it the
    // same way: no network, and onMutate below skips the optimistic cache change,
    // so nothing can even appear to change for a guest.
    mutationFn: (v: TVars) => (isGuest() ? Promise.resolve() : opts.mutationFn(v)),
    onMutate: async (v: TVars) => {
      if (isGuest()) return { prev: undefined }
      await qc.cancelQueries({ queryKey: opts.queryKey })
      const prev = qc.getQueryData<TData>(opts.queryKey)
      qc.setQueryData<TData>(opts.queryKey, (old) => (old === undefined ? old : opts.apply(old, v)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(opts.queryKey, ctx.prev)
      qc.invalidateQueries({ queryKey: opts.queryKey })
    },
    onSettled: () => {
      for (const k of opts.invalidateOnSettled ?? []) qc.invalidateQueries({ queryKey: k })
    },
  })
}
