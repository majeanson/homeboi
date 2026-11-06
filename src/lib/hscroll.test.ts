import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHScroll, type HScroll } from './hscroll'

// The promise: a row with a hidden scrollbar is still reachable with a mouse. Without
// this a wheel only ever emits deltaY, no browser maps that sideways, and whatever sits
// past the right edge is simply gone on a desktop (Réglages ▸ Système's nine subs were).
// And the row must never become a wheel trap the page cannot scroll past.

// Layout does not exist in happy-dom, so the row's geometry is what each case says it is.
const g = { scrollWidth: 0, clientWidth: 0, scrollLeft: 0 }
const GEOMETRY = ['scrollWidth', 'clientWidth', 'scrollLeft'] as const

beforeEach(() => {
  Object.assign(g, { scrollWidth: 0, clientWidth: 0, scrollLeft: 0 })
  for (const key of GEOMETRY) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => g[key],
      set: (v: number) => {
        g[key] = v
      },
    })
  }
})
afterEach(() => {
  for (const key of GEOMETRY) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mount(children?: ReactNode) {
  let h!: HScroll<HTMLDivElement>
  function Row() {
    h = useHScroll()
    return createElement('div', { ref: h.ref, 'data-testid': 'row' }, children)
  }
  const view = render(createElement(Row))
  return { view, get h() { return h }, el: view.getByTestId('row') }
}

const overflowing = (scrollLeft = 0) => Object.assign(g, { scrollWidth: 1000, clientWidth: 300, scrollLeft })
const rescan = (el: HTMLElement) => fireEvent.scroll(el)

describe('what the row says about itself', () => {
  it('a row that fits grows no chevrons and no edge fade', () => {
    Object.assign(g, { scrollWidth: 300, clientWidth: 300 })
    const r = mount()
    expect(r.h.overflowing).toBe(false)
    expect(r.el.hasAttribute('data-hs')).toBe(false)
  })

  it('half a pixel of rounding is not overflow: it would pin the chevrons on forever', () => {
    Object.assign(g, { scrollWidth: 301, clientWidth: 300 })
    expect(mount().h.overflowing).toBe(false)
  })

  it('a cut-off row carries the fade on the side it continues, so a phone sees it continues', () => {
    overflowing(0)
    const r = mount()
    expect(r.h.overflowing).toBe(true)
    expect(r.h.atStart).toBe(true)
    expect(r.el.hasAttribute('data-hs')).toBe(true)
    expect(r.el.hasAttribute('data-hs-start')).toBe(false)
    expect(r.el.hasAttribute('data-hs-end')).toBe(true)

    g.scrollLeft = 300
    rescan(r.el)
    expect(r.h.atStart).toBe(false)
    expect(r.h.atEnd).toBe(false)
    expect(r.el.hasAttribute('data-hs-start')).toBe(true)
    expect(r.el.hasAttribute('data-hs-end')).toBe(true)

    g.scrollLeft = 700
    rescan(r.el)
    expect(r.h.atEnd).toBe(true)
    expect(r.el.hasAttribute('data-hs-end')).toBe(false)
  })

  it('a tab added to the row is noticed: content growing never changes the row box', async () => {
    Object.assign(g, { scrollWidth: 300, clientWidth: 300 })
    const r = mount()
    overflowing(0)
    act(() => void r.el.appendChild(document.createElement('button')))
    await waitFor(() => expect(r.el.hasAttribute('data-hs')).toBe(true))
  })

  it('the children are watched as well as the row: a pill that grows is what makes it overflow', () => {
    const observed: Element[] = []
    let fire!: () => void
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          fire = cb
        }
        observe(el: Element) {
          observed.push(el)
        }
        disconnect() {}
      },
    )
    const r = mount(createElement('button', { 'data-testid': 'pill' }))
    expect(observed).toContain(r.view.getByTestId('pill'))
    overflowing(0)
    act(() => fire())
    expect(r.h.overflowing).toBe(true)
  })
})

describe('the mouse wheel', () => {
  const wheel = (el: HTMLElement, init: WheelEventInit) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
    act(() => void el.dispatchEvent(event))
    return event
  }

  it('a vertical wheel over an overflowing row moves it sideways', () => {
    overflowing(100)
    const r = mount()
    const e = wheel(r.el, { deltaY: 60 })
    expect(e.defaultPrevented).toBe(true)
    expect(g.scrollLeft).toBe(160)
  })

  it('a wheel that reports lines is sized in pixels, so a Firefox notch is not one pixel', () => {
    overflowing(100)
    const r = mount()
    wheel(r.el, { deltaY: 3, deltaMode: 1 })
    expect(g.scrollLeft).toBe(148)
  })

  it('at the right end the page gets the wheel back: the row is never a trap', () => {
    overflowing(700)
    const r = mount()
    const e = wheel(r.el, { deltaY: 60 })
    expect(e.defaultPrevented).toBe(false)
    expect(g.scrollLeft).toBe(700)
  })

  it('at the left end the page gets the wheel back too', () => {
    overflowing(0)
    const r = mount()
    expect(wheel(r.el, { deltaY: -60 }).defaultPrevented).toBe(false)
  })

  it('a row that fits leaves the wheel to the page', () => {
    Object.assign(g, { scrollWidth: 300, clientWidth: 300 })
    const r = mount()
    expect(wheel(r.el, { deltaY: 60 }).defaultPrevented).toBe(false)
  })

  it('a trackpad swipe is left to the browser, which already scrolls it natively', () => {
    overflowing(100)
    const r = mount()
    expect(wheel(r.el, { deltaY: 10, deltaX: 40 }).defaultPrevented).toBe(false)
    expect(g.scrollLeft).toBe(100)
  })

  it('ctrl+wheel is pinch-zoom, not a scroll', () => {
    overflowing(100)
    const r = mount()
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60 })
    // happy-dom's WheelEvent drops ctrlKey from its init.
    Object.defineProperty(event, 'ctrlKey', { value: true })
    act(() => void r.el.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(false)
    expect(g.scrollLeft).toBe(100)
  })

  it('a row that left the screen stops translating the wheel', () => {
    overflowing(100)
    const r = mount()
    const { el } = r
    const fresh = wheel.bind(null, el)
    r.view.unmount()
    expect(fresh({ deltaY: 60 }).defaultPrevented).toBe(false)
  })
})

describe('the chevrons and deep links', () => {
  it('a chevron steps most of a screenful, so the last pill stays in sight', () => {
    overflowing(0)
    const r = mount()
    const scrollBy = vi.fn()
    r.el.scrollBy = scrollBy
    r.h.page(1)
    expect(scrollBy.mock.calls[0]?.[0].left).toBe(240)
    r.h.page(-1)
    expect(scrollBy.mock.calls[1]?.[0].left).toBe(-240)
  })

  it('a chevron on a tiny row still moves far enough to do something', () => {
    Object.assign(g, { scrollWidth: 500, clientWidth: 100 })
    const r = mount()
    const scrollBy = vi.fn()
    r.el.scrollBy = scrollBy
    r.h.page(1)
    expect(scrollBy.mock.calls[0]?.[0].left).toBe(120)
  })

  function toViewCase(childLeft: number, scrollLeft = 200) {
    overflowing(scrollLeft)
    const r = mount()
    const scrollTo = vi.fn()
    r.el.scrollTo = scrollTo
    const child = document.createElement('button')
    child.scrollIntoView = vi.fn()
    vi.spyOn(r.el, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 300 } as DOMRect)
    vi.spyOn(child, 'getBoundingClientRect').mockReturnValue({ left: childLeft, width: 100 } as DOMRect)
    return { r, scrollTo, child }
  }

  it('a deep-linked tab lands centred in the row', () => {
    const { r, scrollTo, child } = toViewCase(400)
    r.h.toView(child)
    expect(scrollTo.mock.calls[0]?.[0].left).toBe(200 + 400 - 100)
  })

  it('the page itself never moves: only the row scrolls', () => {
    const { r, child } = toViewCase(400)
    r.h.toView(child)
    expect(child.scrollIntoView).not.toHaveBeenCalled()
  })

  it('a tab near either end clamps to the road the row actually has', () => {
    const near = toViewCase(-500)
    near.r.h.toView(near.child)
    expect(near.scrollTo.mock.calls[0]?.[0].left).toBe(0)
    near.r.view.unmount()
    const far = toViewCase(5000)
    far.r.h.toView(far.child)
    expect(far.scrollTo.mock.calls[0]?.[0].left).toBe(700)
  })

  it('an instant landing does not glide, for a page that opens already scrolled', () => {
    const { r, scrollTo, child } = toViewCase(400)
    r.h.toView(child, true)
    expect(scrollTo.mock.calls[0]?.[0].behavior).toBe('auto')
  })

  it('a row that fits has nothing to scroll to', () => {
    Object.assign(g, { scrollWidth: 300, clientWidth: 300 })
    const r = mount()
    const scrollTo = vi.fn()
    r.el.scrollTo = scrollTo
    r.h.toView(document.createElement('button'))
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
