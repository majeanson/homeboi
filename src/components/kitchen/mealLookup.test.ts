import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recipe } from '../../lib/recipes'
import { useRecipeForMeal } from './mealLookup'

// THE meal→recipe resolver: the exact link survives a rename, a loose title match rescues
// free-text meals, and a caller already holding the recipes must not cost a second fetch.

const api = vi.hoisted(() => vi.fn())
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api }))

const recipe = (id: string, title: string) => ({ id, title }) as Recipe

function resolver(recipes?: Recipe[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
  return renderHook(() => useRecipeForMeal(recipes), { wrapper })
}

beforeEach(() => {
  api.mockReset()
})

describe('useRecipeForMeal', () => {
  const held = [recipe('r1', 'Pâté chinois'), recipe('r2', 'Soupe aux pois')]

  it('prefers the link over the title, so a renamed meal keeps its recipe', () => {
    const { result } = resolver(held)
    expect(result.current({ recipe_id: 'r2', title: 'Pâté chinois' })?.id).toBe('r2')
  })

  it('falls back to a title match that ignores case and stray spaces', () => {
    const { result } = resolver(held)
    expect(result.current({ title: '  pâté CHINOIS ' })?.id).toBe('r1')
  })

  it('falls back to the title when the link points at a recipe that is gone', () => {
    const { result } = resolver(held)
    expect(result.current({ recipe_id: 'deleted', title: 'Soupe aux pois' })?.id).toBe('r2')
  })

  it('answers undefined for a free-text meal nothing matches', () => {
    const { result } = resolver(held)
    expect(result.current({ title: 'Restants' })).toBeUndefined()
  })

  it('does not fetch when the caller already holds the recipes', () => {
    resolver(held)
    expect(api).not.toHaveBeenCalled()
  })

  it('reads the recipes itself when it was handed none', async () => {
    api.mockResolvedValue({ recipes: [recipe('r3', 'Tourtière')] })
    const { result } = resolver()
    expect(result.current({ title: 'Tourtière' })).toBeUndefined()
    await waitFor(() => expect(result.current({ title: 'Tourtière' })?.id).toBe('r3'))
    expect(api).toHaveBeenCalledWith('recipes')
  })
})
