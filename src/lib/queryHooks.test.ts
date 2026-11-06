import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY_NOTES_KEY, LEFTOVERS_KEY, MEALS_KEY, PANTRY_KEY } from '../components/kitchen/types'
import { liveInterval } from './query'
import { BOARD_KEY } from './queryKeys'
import { useBoardData, useDayNotes, useLeftovers, useMeals, usePantry, useRecipes } from './queryHooks'
import { RECIPES_KEY } from './recipes'

// The promise: every page reading the board, the plan or the pantry reads the SAME
// cache. A key typo would split one cache into two (one page fresh, the other stale),
// an endpoint typo would 404 one page, and a hook that drops `live` would silently stop
// a shared surface from noticing another phone's change.

const api = vi.hoisted(() => vi.fn())
vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), api }))

const HOOKS = [
  ['useBoardData', useBoardData, BOARD_KEY, 'board'],
  ['useRecipes', useRecipes, RECIPES_KEY, 'recipes'],
  ['useMeals', useMeals, MEALS_KEY, 'meals'],
  ['useDayNotes', useDayNotes, DAY_NOTES_KEY, 'day-notes'],
  ['usePantry', usePantry, PANTRY_KEY, 'pantry'],
  ['useLeftovers', useLeftovers, LEFTOVERS_KEY, 'meal-leftovers'],
] as const

function client() {
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

beforeEach(() => {
  api.mockReset()
  api.mockResolvedValue({ ok: true })
})

describe.each(HOOKS)('%s', (_name, useHook, key, endpoint) => {
  it('reads its endpoint and lands in the one shared cache', async () => {
    const { qc, wrapper } = client()
    const { result } = renderHook(() => useHook(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ ok: true }))
    expect(api).toHaveBeenCalledExactlyOnceWith(endpoint)
    expect(qc.getQueryData(key)).toEqual({ ok: true })
  })

  it('polls like every shared surface, in the gear query.ts decides', () => {
    const { qc, wrapper } = client()
    renderHook(() => useHook(), { wrapper })
    const query = qc.getQueryCache().find({ queryKey: key })
    expect(query?.meta?.live).toBe(true)
    expect(query?.observers[0]?.options.refetchInterval).toBe(liveInterval)
  })

  it('two surfaces mounted together cost one request', async () => {
    const { wrapper } = client()
    renderHook(
      () => {
        useHook()
        return useHook()
      },
      { wrapper },
    )
    await waitFor(() => expect(api).toHaveBeenCalled())
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('a gated read does not fetch until the page says so', () => {
    const { wrapper } = client()
    renderHook(() => useHook({ enabled: false }), { wrapper })
    expect(api).not.toHaveBeenCalled()
  })

  it('a caller override wins over the defaults', () => {
    const { qc, wrapper } = client()
    renderHook(() => useHook({ retry: false }), { wrapper })
    expect(qc.getQueryCache().find({ queryKey: key })?.observers[0]?.options.retry).toBe(false)
  })
})
