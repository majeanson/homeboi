// The single TanStack Query client. Data-fetching state (loading, caching,
// polling, stale-while-revalidate, optimistic updates) lives here and in the
// per-resource hooks rather than being hand-rolled in every page.
//
// Platform-agnostic on purpose: this and the query hooks depend only on `api`
// (the one transport chokepoint), so the data layer would port to React
// Native/Expo by swapping `api`'s transport — no page logic changes.
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx (401 not-paired, 400 bad input) won't fix itself by retrying;
      // only retry transient server/network failures, and only briefly.
      retry: (count, err) => {
        if (err instanceof ApiError && err.status < 500) return false
        return count < 2
      },
      // Dedupe the burst of reads when several surfaces mount at once, without
      // masking real changes for long. Polling surfaces set their own interval.
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
})
