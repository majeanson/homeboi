import { render, renderHook } from '@testing-library/react'
import { createElement, useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardEmptyContext, useReportEmpty } from './useReportEmpty'

// The promise: a board card says « nothing to show » once, truthfully, and stops saying
// it when it leaves. The slot uses that report to collapse the card (mode `auto`) or
// keep it with an EmptyState (mode `always`), so a stale report hides a live card.

const report = vi.fn()
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(CardEmptyContext.Provider, { value: report }, children)

beforeEach(() => void report.mockReset())

describe('useReportEmpty', () => {
  it('outside a slot it is inert: a card renders standalone in /dev/kit or a scene', () => {
    expect(() => renderHook(() => useReportEmpty(true))).not.toThrow()
  })

  it('a card reports what it found, once', () => {
    renderHook(() => useReportEmpty(true), { wrapper })
    expect(report.mock.calls).toEqual([[true]])
  })

  it('a re-render with the same answer writes nothing to the shell', () => {
    const { rerender } = renderHook(() => useReportEmpty(true), { wrapper })
    rerender()
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('a card that fills up reports exactly once: no false-then-true churn on the shell', () => {
    const { rerender } = renderHook(({ empty }) => useReportEmpty(empty), {
      wrapper,
      initialProps: { empty: true },
    })
    report.mockClear()
    rerender({ empty: false })
    expect(report.mock.calls).toEqual([[false]])
  })

  it('a card that leaves stops claiming to be empty, so a slot left mounted does not stay collapsed', () => {
    const { unmount } = renderHook(() => useReportEmpty(true), { wrapper })
    report.mockClear()
    unmount()
    expect(report.mock.calls).toEqual([[false]])
  })

  it('an unstable reporter from the shell still settles on the truth', () => {
    // CardSlot's setter is stable today; the hook promises not to depend on it. A shell
    // that hands down a fresh arrow per render must neither freeze nor lose the report.
    let renders = 0
    let seen: boolean | null = null
    function Card() {
      useReportEmpty(true)
      return null
    }
    function Shell() {
      const [reported, setReported] = useState<boolean | null>(null)
      renders += 1
      seen = reported
      return createElement(CardEmptyContext.Provider, { value: (e) => setReported(e) }, createElement(Card))
    }
    render(createElement(Shell))
    expect(seen).toBe(true)
    expect(renders).toBeLessThan(6)
  })
})
