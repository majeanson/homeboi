import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EffortDots, EffortMark } from './EffortDots'
import { Segmented } from './Segmented'

// EffortDots rides Segmented, which had to learn « nothing picked » (value null) for it. The
// lesson from phase 3 (pictoFor): extending a shared primitive must not move its other callers.
// So Segmented's own contract with a picked value is pinned first, unchanged, then the new
// null case, then the dots on top of it.

afterEach(cleanup)

const radios = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
const opts = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }] as const

describe('Segmented — the existing contract, with a value picked', () => {
  it('one checked radio, one tab stop, arrows wrap and pick', () => {
    const onChange = vi.fn()
    const { container } = render(createElement(Segmented<'a' | 'b' | 'c'>, { ariaLabel: 'x', value: 'b', onChange, options: opts }))
    const r = radios(container)
    expect(r.map((x) => x.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(r.map((x) => x.tabIndex)).toEqual([-1, 0, -1])
    fireEvent.keyDown(r[1]!, { key: 'ArrowRight' })
    fireEvent.keyDown(r[1]!, { key: 'ArrowLeft' })
    fireEvent.keyDown(r[1]!, { key: 'End' })
    fireEvent.keyDown(r[1]!, { key: 'Home' })
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['c', 'a', 'c', 'a'])
  })

  it('from the first, back wraps to the last (unchanged)', () => {
    const onChange = vi.fn()
    const { container } = render(createElement(Segmented<'a' | 'b' | 'c'>, { ariaLabel: 'x', value: 'a', onChange, options: opts }))
    fireEvent.keyDown(radios(container)[0]!, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('c')
  })
})

describe('Segmented — nothing picked (value null)', () => {
  it('no radio is checked, the first holds the tab stop, forward picks the first, back the last', () => {
    const onChange = vi.fn()
    const { container } = render(createElement(Segmented<'a' | 'b' | 'c'>, { ariaLabel: 'x', value: null, onChange, options: opts }))
    const r = radios(container)
    expect(r.every((x) => x.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(r.map((x) => x.tabIndex)).toEqual([0, -1, -1])
    fireEvent.keyDown(r[0]!, { key: 'ArrowRight' })
    fireEvent.keyDown(r[0]!, { key: 'ArrowLeft' })
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['a', 'c'])
  })
})

describe('EffortDots', () => {
  it('five named radios in one group; the dots up to the pick are filled', () => {
    const { container, getByRole } = render(createElement(EffortDots, { value: 3, onChange: () => {} }))
    expect(getByRole('radiogroup').getAttribute('aria-label')).toBe('Effort')
    const r = radios(container)
    expect(r.map((x) => x.getAttribute('aria-label'))).toEqual(['Tout simple (1 sur 5)', 'Facile (2 sur 5)', 'Moyen (3 sur 5)', 'Exigeant (4 sur 5)', 'Gros effort (5 sur 5)'])
    expect(r.map((x) => x.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false', 'false'])
    expect(r.map((x) => !!x.querySelector('.is-filled'))).toEqual([true, true, true, false, false])
  })

  it('tap to set, tap the same dot to clear, Delete clears too', () => {
    const onChange = vi.fn()
    const { container } = render(createElement(EffortDots, { value: 2, onChange }))
    const r = radios(container)
    fireEvent.click(r[3]!)
    fireEvent.click(r[1]!)
    fireEvent.keyDown(r[1]!, { key: 'Delete' })
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([4, null, null])
  })

  it('not said: nothing checked, nothing filled, Delete does nothing', () => {
    const onChange = vi.fn()
    const { container } = render(createElement(EffortDots, { value: null, onChange }))
    const r = radios(container)
    expect(r.some((x) => x.getAttribute('aria-checked') === 'true' || x.querySelector('.is-filled'))).toBe(false)
    fireEvent.keyDown(r[0]!, { key: 'Backspace' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('EffortMark', () => {
  it('names itself when said, renders nothing when not', () => {
    const said = render(createElement(EffortMark, { value: 5 }))
    expect(said.getByRole('img').getAttribute('aria-label')).toBe('Effort : Gros effort')
    cleanup()
    for (const v of [null, undefined, 0, 6]) {
      const { container } = render(createElement(EffortMark, { value: v }))
      expect(container.innerHTML).toBe('')
      cleanup()
    }
  })
})
