import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { importStage, useElapsed } from './importProgress'

// « So the cook doesn't feel it is stuck » (Marc, 2026-10-27). A link import is ONE
// request that can run 45 s — our own fetch (15 s), then Browser Run, then a model
// organising the text — and the button sat on « Importation… » the whole time. The
// stage line names what is happening NOW, from the time spent; these pin the phases
// (they are the copy's promise) and the clock behind them.

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('importStage — honest phases from the time spent', () => {
  it('a link: fetch, read, the slow site\'s other door (our fetch gives up at 15 s), then « encore un instant »', () => {
    expect(importStage('url', 0, true)).toBe('linkFetch')
    expect(importStage('url', 3, true)).toBe('linkFetch')
    expect(importStage('url', 4, true)).toBe('linkRead')
    expect(importStage('url', 15, true)).toBe('linkRead')
    expect(importStage('url', 16, true)).toBe('linkSlow')
    expect(importStage('url', 29, true)).toBe('linkSlow')
    expect(importStage('url', 30, true)).toBe('long')
    expect(importStage('url', 44, false)).toBe('long')
  })
  it('a paste: organising, then the model choosing lines — never « l’IA » when the AI is off', () => {
    expect(importStage('text', 0, true)).toBe('paste')
    expect(importStage('text', 7, true)).toBe('paste')
    expect(importStage('text', 8, true)).toBe('pasteAi')
    expect(importStage('text', 8, false)).toBe('paste')
    expect(importStage('text', 30, true)).toBe('long')
  })
  it('the bookmark: the page it sent, then the model, then « encore un instant »', () => {
    expect(importStage('page', 0, true)).toBe('bookmark')
    expect(importStage('page', 8, true)).toBe('pasteAi')
    expect(importStage('page', 8, false)).toBe('bookmark')
    expect(importStage('page', 30, true)).toBe('long')
  })
})

describe('useElapsed — whole seconds while active, back to 0 when it stops', () => {
  let root: Root
  let seen: number[]
  const Probe = ({ on }: { on: boolean }) => {
    seen.push(useElapsed(on))
    return null
  }
  const last = () => seen[seen.length - 1]
  beforeEach(() => {
    vi.useFakeTimers()
    seen = []
    document.body.innerHTML = ''
    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('counts up once a second while active', () => {
    act(() => root.render(createElement(Probe, { on: true })))
    expect(last()).toBe(0)
    act(() => void vi.advanceTimersByTime(1000))
    expect(last()).toBe(1)
    act(() => void vi.advanceTimersByTime(4000))
    expect(last()).toBe(5)
  })
  it('stays at 0 while idle, and a new run starts from 0 again', () => {
    act(() => root.render(createElement(Probe, { on: false })))
    act(() => void vi.advanceTimersByTime(3000))
    expect(last()).toBe(0)
    act(() => root.render(createElement(Probe, { on: true })))
    act(() => void vi.advanceTimersByTime(17_000))
    expect(last()).toBe(17)
    act(() => root.render(createElement(Probe, { on: false })))
    expect(last()).toBe(0)
    act(() => root.render(createElement(Probe, { on: true })))
    expect(last()).toBe(0)
    act(() => void vi.advanceTimersByTime(2000))
    expect(last()).toBe(2)
  })
})
