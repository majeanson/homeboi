import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SurfaceContext, useSurface } from './surface'

// The promise: a stranger is treated as a stranger. With no provider above it, a surface
// reads as a phone (so any deep link renders the phone layout) and as NOT chosen (so
// the `/` smart entry shows the marketing page instead of an empty board).

describe('useSurface', () => {
  it('with nothing chosen, a deep link gets the phone layout and the door stays marketing', () => {
    const { result } = renderHook(() => useSurface())
    expect(result.current.surface).toBe('mobile')
    expect(result.current.chosen).toBe(false)
  })

  it('the default setter is inert: a stray call outside the provider cannot throw', () => {
    const { result } = renderHook(() => useSurface())
    expect(() => result.current.setSurface('kiosk')).not.toThrow()
  })

  it('a tablet set up as a kiosk reads as a kiosk, deliberately', () => {
    const setSurface = vi.fn()
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(SurfaceContext.Provider, { value: { surface: 'kiosk', setSurface, chosen: true } }, children)
    const { result } = renderHook(() => useSurface(), { wrapper })
    expect(result.current.surface).toBe('kiosk')
    expect(result.current.chosen).toBe(true)
    result.current.setSurface('mobile')
    expect(setSurface).toHaveBeenCalledWith('mobile')
  })
})
