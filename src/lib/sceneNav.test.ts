import { act, fireEvent, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useEscapeKey, useSceneClose } from './sceneNav'

// The promise: every way out of a full-screen scene agrees. The ✕, the iOS back-swipe
// and Escape all go back where you came from, and a scene opened cold from a link
// still has somewhere to go.

function mount(entries: string[]) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: entries, initialIndex: entries.length - 1 }, children)
  return renderHook(
    () => ({ close: useSceneClose('/kitchen'), loc: useLocation(), nav: useNavigate() }),
    { wrapper },
  )
}

describe('useSceneClose', () => {
  it('a scene reached from inside the app pops back to where you were', () => {
    const { result } = mount(['/board'])
    act(() => result.current.nav('/cook/1'))
    act(() => result.current.close())
    expect(result.current.loc.pathname).toBe('/board')
  })

  it('a cold deep link has nothing to pop, so it lands on the parent route', () => {
    const { result } = mount(['/cook/1'])
    act(() => result.current.close())
    expect(result.current.loc.pathname).toBe('/kitchen')
  })

  it('the cold exit replaces the scene: back does not reopen what you just closed', () => {
    const { result } = mount(['/cook/1'])
    act(() => result.current.close())
    act(() => result.current.nav('/board'))
    act(() => result.current.nav(-1))
    expect(result.current.loc.pathname).toBe('/kitchen')
    act(() => result.current.nav(-1))
    expect(result.current.loc.pathname).toBe('/kitchen')
  })
})

describe('useEscapeKey', () => {
  it('Escape closes the scene, and no other key does', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeKey(onClose))
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a scene with a nested overlay defers: one press never collapses both layers', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeKey(onClose, false))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a closed scene stops listening: Escape does not reach it after it is gone', () => {
    const onClose = vi.fn()
    const { unmount } = renderHook(() => useEscapeKey(onClose))
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
