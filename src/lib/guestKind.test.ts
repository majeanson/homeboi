import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getGuestKind, setGuestKind, setGuestToken } from './device'
import { useGuestKind } from './guestKind'

// The promise: a link guest lands on the right scene without a flash. The kind is asked
// of the server once, then a reload routes synchronously off what was cached; and a
// failed answer leaves the door read-only rather than guessing at a kind.

const api = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ api }))

beforeEach(() => {
  localStorage.clear()
  api.mockReset()
})

describe('useGuestKind', () => {
  it('a visitor who is not a link guest asks the server nothing', () => {
    const { result } = renderHook(() => useGuestKind())
    expect(result.current).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it('a reload with a cached kind routes on the first render, with no round trip', () => {
    setGuestToken('t')
    setGuestKind('sitter')
    const { result } = renderHook(() => useGuestKind())
    expect(result.current).toBe('sitter')
    expect(api).not.toHaveBeenCalled()
  })

  it('a first visit asks once, then remembers the answer for the next reload', async () => {
    setGuestToken('t')
    api.mockResolvedValue({ kind: 'family' })
    const { result } = renderHook(() => useGuestKind())
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe('family'))
    expect(api).toHaveBeenCalledExactlyOnceWith('guest/whoami')
    expect(getGuestKind()).toBe('family')
  })

  it('a guest the server cannot name is a legacy Démo link', async () => {
    setGuestToken('t')
    api.mockResolvedValue({ kind: null })
    const { result } = renderHook(() => useGuestKind())
    await waitFor(() => expect(result.current).toBe('showcase'))
    expect(getGuestKind()).toBe('showcase')
  })

  it('offline or refused, the kind stays unknown and nothing false is cached', async () => {
    setGuestToken('t')
    let reject!: (e: Error) => void
    api.mockReturnValue(new Promise((_, r) => (reject = r)))
    const { result } = renderHook(() => useGuestKind())
    await act(async () => reject(new Error('offline')))
    expect(result.current).toBeNull()
    expect(getGuestKind()).toBeNull()
  })

  it('an answer that lands after the hub left is dropped, not cached', async () => {
    setGuestToken('t')
    let resolve!: (v: { kind: string }) => void
    api.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = renderHook(() => useGuestKind())
    unmount()
    await act(async () => resolve({ kind: 'welcome' }))
    expect(getGuestKind()).toBeNull()
  })
})
