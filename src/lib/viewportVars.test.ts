import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The promise: the keyboard never hides what you are typing, and it never leaves a
// ghost behind. `.kb-open` hides the tab bar and the ＋ FAB, so a false positive takes
// the bottom of the app away with no field on screen to justify it (« perte du footer »,
// « the bottom bar sometimes disappears »), and a latched --kb pads ~290 px off the next
// full-screen surface. Everything here runs against a stubbed visualViewport: the point
// is the stated invariants, not the iOS behaviour itself, which only a device can show.

const INNER = 800
const root = document.documentElement

type Mod = typeof import('./viewportVars')
let mod: Mod
const vv = Object.assign(new EventTarget(), { height: INNER, offsetTop: 0, scale: 1 })

// trackVisualViewport installs listeners for the app's lifetime and offers no teardown,
// so the harness records them to keep one case's closure from answering in the next.
const installed: [EventTarget, string, EventListenerOrEventListenerObject][] = []

function spyListeners(target: EventTarget) {
  const real = target.addEventListener.bind(target)
  vi.spyOn(target, 'addEventListener').mockImplementation(((
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: AddEventListenerOptions,
  ) => {
    installed.push([target, type, fn])
    real(type, fn, opts)
  }) as EventTarget['addEventListener'])
}

async function boot({ track = true } = {}) {
  vi.resetModules()
  mod = await import('./viewportVars')
  if (track) mod.trackVisualViewport()
}

const frame = () => vi.advanceTimersByTime(20)

function viewport(next: Partial<Pick<typeof vv, 'height' | 'offsetTop' | 'scale'>>) {
  Object.assign(vv, next)
  vv.dispatchEvent(new Event('resize'))
  frame()
}

const css = (name: string) => root.style.getPropertyValue(name)
const kbOpen = () => root.classList.contains('kb-open')

function field(tag: 'input' | 'textarea' | 'select' = 'input', type?: string) {
  const el = document.createElement(tag) as HTMLInputElement
  if (type) el.type = type
  el.scrollIntoView = vi.fn()
  document.body.appendChild(el)
  return el
}

function editable(el: HTMLElement) {
  Object.defineProperty(el, 'isContentEditable', { value: true })
  return el
}

function setHidden(hidden: boolean) {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden)
}

function box(el: HTMLElement, top: number, bottom: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    width: 100,
  } as DOMRect)
}

// A scroller with `road` px of travel. Past that it clamps, like the real thing.
function scroller(parent: HTMLElement = document.body, road = 5000, top = 0, bottom = INNER) {
  const el = document.createElement('div')
  el.style.overflowY = 'auto'
  let pos = 0
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => pos,
    set: (v: number) => {
      pos = Math.max(0, Math.min(road, v))
    },
  })
  Object.defineProperty(el, 'clientHeight', { value: 500 })
  Object.defineProperty(el, 'scrollHeight', { value: 3000 })
  parent.appendChild(el)
  box(el, top, bottom)
  return el
}

// A line of text where the layout says it is: a caret rect must agree with its own line.
function lineIn(parent: HTMLElement, top: number, bottom: number) {
  const line = parent.appendChild(document.createElement('p'))
  box(line, top, bottom)
  return line
}

const NO_RECT = { top: 0, bottom: 0 } as DOMRect

function caret(container: Node, offset: number, rect: Partial<DOMRect> | null, collapsed = true) {
  const range = {
    collapsed,
    startContainer: container,
    startOffset: offset,
    getClientRects: () => (rect ? [rect] : []),
    getBoundingClientRect: () => NO_RECT,
  }
  vi.spyOn(document, 'getSelection').mockReturnValue({
    rangeCount: 1,
    getRangeAt: () => range,
    isCollapsed: collapsed,
    anchorNode: container,
    focusNode: container,
    anchorOffset: offset,
    focusOffset: offset,
  } as unknown as Selection)
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(vv, { height: INNER, offsetTop: 0, scale: 1 })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: INNER })
  sessionStorage.clear()
  spyListeners(document)
  spyListeners(window)
  spyListeners(vv)
})

afterEach(() => {
  for (const [target, type, fn] of installed.splice(0)) target.removeEventListener(type, fn)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  root.className = ''
  root.removeAttribute('style')
  ;(document.activeElement as HTMLElement | null)?.blur?.()
})

describe('where there is no visualViewport', () => {
  it('nothing happens: the CSS dvh fallbacks take over', async () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    await boot()
    expect(css('--vvh')).toBe('')
    expect(installed).toEqual([])
  })

  it('a navigation before tracking started is a harmless no-op', async () => {
    await boot({ track: false })
    expect(() => mod.remeasureViewport()).not.toThrow()
  })
})

describe('the published vars', () => {
  it('overlays learn the visible height and top at boot', async () => {
    Object.assign(vv, { height: 700.4, offsetTop: 12.6 })
    await boot()
    expect(css('--vvh')).toBe('700px')
    expect(css('--vvt')).toBe('13px')
  })

  it('a burst of viewport events writes at most once per frame', async () => {
    await boot()
    const setProperty = vi.spyOn(root.style, 'setProperty')
    vv.height = 700
    for (let i = 0; i < 5; i++) vv.dispatchEvent(new Event('resize'))
    frame()
    expect(setProperty.mock.calls.filter(([name]) => name === '--vvh')).toHaveLength(1)
  })

  it('a pinch in a Safari tab writes nothing: overlays would shimmer through the gesture', async () => {
    await boot()
    viewport({ height: 300, scale: 2 })
    expect(css('--vvh')).toBe(`${INNER}px`)
  })

  it('a suspended web view reports a collapsed viewport, which is not a keyboard', async () => {
    await boot()
    field().focus()
    setHidden(true)
    viewport({ height: 300 })
    expect(kbOpen()).toBe(false)
    expect(css('--vvh')).toBe(`${INNER}px`)
  })
})

describe('is a keyboard up?', () => {
  it('a focused field and a real shrink: the bottom chrome hides and sheets lift by the keyboard', async () => {
    await boot()
    field().focus()
    viewport({ height: 500 })
    expect(kbOpen()).toBe(true)
    expect(css('--kb')).toBe('300px')
    expect(css('--kb-fixed')).toBe('300px')
  })

  it('browser chrome or an accessory bar is not a keyboard, and lifts nothing', async () => {
    await boot()
    field().focus()
    viewport({ height: INNER - 120 })
    expect(kbOpen()).toBe(false)
    expect(css('--kb')).toBe('0px')
    viewport({ height: INNER - 121 })
    expect(kbOpen()).toBe(true)
  })

  it('a shrink with nothing focused never opens: the screenshot preview took the footer away', async () => {
    await boot()
    viewport({ height: 482 })
    expect(kbOpen()).toBe(false)
    expect(css('--kb')).toBe('0px')
    expect(css('--kb-fixed')).toBe('')
  })

  it.each([
    ['a checkbox', 'input', 'checkbox'],
    ['a button-typed input', 'input', 'button'],
    ['a file picker', 'input', 'file'],
  ] as const)('%s summons nothing, so its focus proves nothing', async (_name, tag, type) => {
    await boot()
    field(tag, type).focus()
    viewport({ height: 482 })
    expect(kbOpen()).toBe(false)
  })

  it.each([
    ['a text field', 'input', 'text'],
    ['a date field, whose picker wheel occludes like a keyboard', 'input', 'date'],
    ['a textarea', 'textarea', undefined],
    ['a select, likewise a wheel on iOS', 'select', undefined],
  ] as const)('%s can summon it', async (_name, tag, type) => {
    await boot()
    field(tag, type).focus()
    viewport({ height: 482 })
    expect(kbOpen()).toBe(true)
  })

  it('a contentEditable host can summon it too', async () => {
    await boot()
    const note = editable(document.body.appendChild(document.createElement('div')))
    note.tabIndex = 0
    note.focus()
    viewport({ height: 482 })
    expect(kbOpen()).toBe(true)
  })

  it('the iOS viewport push does not read as the keyboard leaving', async () => {
    await boot()
    field().focus()
    viewport({ height: 500 })
    viewport({ height: 500, offsetTop: 280 })
    expect(kbOpen()).toBe(true)
  })

  it('during the pan the two paddings together still equal the shrink', async () => {
    await boot()
    field().focus()
    viewport({ height: 500, offsetTop: 200 })
    expect(css('--kb')).toBe('100px')
    expect(css('--vvt')).toBe('200px')
  })

  it('a shell iOS glued to the visual viewport pays the full shrink: the pan does not relieve it', async () => {
    await boot()
    const shell = document.body.appendChild(document.createElement('div'))
    shell.style.position = 'fixed'
    const input = document.createElement('input')
    input.scrollIntoView = vi.fn()
    shell.appendChild(input)
    box(shell, -200, 600)
    input.focus()
    viewport({ height: 500, offsetTop: 200 })
    expect(css('--kb')).toBe('100px')
    expect(css('--kb-fixed')).toBe('300px')
  })

  it('a closed keyboard REMOVES --kb-fixed: a defined 0 would beat the CSS fallback', async () => {
    await boot()
    field().focus()
    viewport({ height: 500 })
    viewport({ height: INNER })
    expect(kbOpen()).toBe(false)
    expect(css('--kb')).toBe('0px')
    expect(css('--kb-fixed')).toBe('')
  })

  it('a noisy dip below the threshold never blurs the field: that loop made login unusable', async () => {
    await boot()
    const input = field()
    input.focus()
    const blur = vi.spyOn(input, 'blur')
    viewport({ height: 500 })
    viewport({ height: INNER - 50 })
    viewport({ height: 500 })
    expect(blur).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })
})

describe('the healers: a stale latch must clear, a live keyboard must not', () => {
  async function latched() {
    await boot()
    const input = field()
    input.focus()
    viewport({ height: 500 })
    expect(kbOpen()).toBe(true)
    return input
  }

  // iOS closed the keyboard because its field was removed: no resize, no focusout.
  async function stale() {
    const input = await latched()
    input.remove()
    vv.height = INNER
  }

  it('a keyboard genuinely up across a navigation keeps its fit: the old field left with the route', async () => {
    const input = await latched()
    input.remove()
    mod.remeasureViewport()
    frame()
    expect(kbOpen()).toBe(true)
    expect(css('--kb')).toBe('300px')
  })

  it('a navigation clears the band a removed field left latched', async () => {
    await stale()
    mod.remeasureViewport()
    frame()
    expect(kbOpen()).toBe(false)
    expect(css('--kb')).toBe('0px')
  })

  it('it re-reads as the dismissal animation runs: one immediate read is not enough', async () => {
    const input = await latched()
    input.remove()
    mod.remeasureViewport()
    frame()
    vv.height = INNER
    vi.advanceTimersByTime(500)
    expect(kbOpen()).toBe(false)
  })

  it('idle hands heal too: the watchdog clears it within a tick, with no event at all', async () => {
    await stale()
    vi.advanceTimersByTime(1100)
    expect(kbOpen()).toBe(false)
  })

  it('the watchdog never fights a live field', async () => {
    await latched()
    vv.height = INNER
    vi.advanceTimersByTime(3000)
    expect(kbOpen()).toBe(true)
  })

  it('the watchdog waits out a hidden page', async () => {
    await stale()
    setHidden(true)
    vi.advanceTimersByTime(3000)
    expect(kbOpen()).toBe(true)
  })

  it('a tap heals a form that unmounted with no route change', async () => {
    await stale()
    document.dispatchEvent(new Event('pointerup'))
    frame()
    expect(kbOpen()).toBe(false)
  })

  it('a tap with a field focused is a no-op', async () => {
    await latched()
    vv.height = INNER
    document.dispatchEvent(new Event('pointerup'))
    frame()
    expect(kbOpen()).toBe(true)
  })

  it('a blur re-reads once the keyboard settled, for a browser that sends no resize', async () => {
    const input = await latched()
    vv.height = INNER
    input.blur()
    vi.advanceTimersByTime(299)
    expect(kbOpen()).toBe(true)
    vi.advanceTimersByTime(40)
    expect(kbOpen()).toBe(false)
  })

  it.each([
    ['visibilitychange', () => document],
    ['focus', () => window],
    ['pageshow', () => window],
  ] as const)('coming back by %s re-measures', async (type, target) => {
    await stale()
    target().dispatchEvent(new Event(type))
    frame()
    expect(kbOpen()).toBe(false)
  })

  it('a frame queued on the way out never ran: coming back clears the latch that made resize deaf', async () => {
    await latched()
    setHidden(true)
    vi.stubGlobal('requestAnimationFrame', () => 0) // rAF is frozen while hidden
    vv.dispatchEvent(new Event('resize'))
    vi.unstubAllGlobals()
    setHidden(false)
    vv.height = INNER
    document.dispatchEvent(new Event('visibilitychange'))
    frame()
    expect(kbOpen()).toBe(false)
  })

  it('a suspend that hides the page does not re-read until it is back', async () => {
    await latched()
    setHidden(true)
    vv.height = INNER
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(600)
    expect(kbOpen()).toBe(true)
  })
})

describe('pinning the focused field', () => {
  it('the keyboard arriving pins the field near the top, then re-pins as the layout settles', async () => {
    await boot()
    const input = field()
    input.focus()
    viewport({ height: 500 })
    const pin = vi.mocked(input.scrollIntoView)
    expect(pin.mock.calls[0][0]).toEqual({ block: 'start', behavior: 'smooth' })
    vi.advanceTimersByTime(1000)
    expect(pin).toHaveBeenCalledTimes(5)
    expect(pin.mock.calls[4][0]).toEqual({ block: 'start', behavior: 'auto' })
  })

  it('the retries are bounded: a later manual scroll while typing is never fought', async () => {
    await boot()
    const input = field()
    input.focus()
    viewport({ height: 500 })
    vi.advanceTimersByTime(1000)
    const calls = vi.mocked(input.scrollIntoView).mock.calls.length
    vi.advanceTimersByTime(10_000)
    expect(input.scrollIntoView).toHaveBeenCalledTimes(calls)
  })

  it('on a desktop a click on a field does not jump the page', async () => {
    await boot()
    const input = field()
    input.focus()
    vi.advanceTimersByTime(1000)
    expect(input.scrollIntoView).not.toHaveBeenCalled()
  })

  it('moving between fields with the keyboard up re-pins: no viewport event will', async () => {
    await boot()
    const first = field()
    const second = field()
    first.focus()
    viewport({ height: 500 })
    vi.advanceTimersByTime(1000)
    second.focus()
    expect(second.scrollIntoView).toHaveBeenCalled()
  })

  it('a checkbox tapped with the keyboard up is left where it is', async () => {
    await boot()
    const input = field()
    const box = field('input', 'checkbox')
    input.focus()
    viewport({ height: 500 })
    box.focus() // mid-settle: the retries already queued must not land on it either
    vi.advanceTimersByTime(1000)
    expect(box.scrollIntoView).not.toHaveBeenCalled()
  })

  it('a field that left mid-settle is not scrolled', async () => {
    await boot()
    const input = field()
    input.focus()
    viewport({ height: 500 })
    vi.mocked(input.scrollIntoView).mockClear()
    input.remove()
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(input) // what iOS still reports
    vi.advanceTimersByTime(1000)
    expect(input.scrollIntoView).not.toHaveBeenCalled()
  })

  it('focus moving resets the settle retries instead of stacking them', async () => {
    await boot()
    const input = field()
    input.focus()
    viewport({ height: 500 })
    input.dispatchEvent(new Event('focusin', { bubbles: true }))
    vi.mocked(input.scrollIntoView).mockClear()
    vi.advanceTimersByTime(1000)
    expect(input.scrollIntoView).toHaveBeenCalledTimes(4)
  })

  it('in a data-kb-reveal panel the action below the field is revealed instead', async () => {
    await boot()
    const panel = document.body.appendChild(document.createElement('div'))
    panel.setAttribute('data-kb-reveal', '')
    const input = document.createElement('input')
    input.scrollIntoView = vi.fn()
    const button = document.createElement('button')
    button.scrollIntoView = vi.fn()
    panel.append(input, button)
    box(input, 100, 140)
    box(button, 160, 200)
    input.focus()
    viewport({ height: 500 })
    expect(button.scrollIntoView).toHaveBeenCalled()
    expect(input.scrollIntoView).not.toHaveBeenCalled()
  })

  it('without the opt-in the button stays where it is', async () => {
    await boot()
    const panel = document.body.appendChild(document.createElement('div'))
    const input = document.createElement('input')
    input.scrollIntoView = vi.fn()
    const button = document.createElement('button')
    button.scrollIntoView = vi.fn()
    panel.append(input, button)
    box(input, 100, 140)
    box(button, 160, 200)
    input.focus()
    viewport({ height: 500 })
    expect(button.scrollIntoView).not.toHaveBeenCalled()
  })

  it('a tall contentEditable pins the CARET: the host is already in view while the line is not', async () => {
    await boot()
    const sc = scroller()
    const note = editable(sc.appendChild(document.createElement('div')))
    note.tabIndex = 0
    note.scrollIntoView = vi.fn()
    note.focus()
    caret(note, 0, { top: 600, bottom: 620 })
    viewport({ height: 500 })
    expect(note.scrollIntoView).not.toHaveBeenCalled()
    expect(sc.scrollTop).toBe(144)
  })
})

describe('caretIntoView', () => {
  it('a caret under the keyboard rises just enough to clear it', async () => {
    await boot()
    vv.height = 500
    const sc = scroller()
    const line = lineIn(sc, 580, 600)
    caret(line, 0, { top: 580, bottom: 600 })
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBe(600 - (500 - 24))
  })

  it('a caret already in the band moves nothing, so it can run on every keystroke', async () => {
    await boot()
    const sc = scroller()
    sc.scrollTop = 50
    const line = lineIn(sc, 300, 320)
    caret(line, 0, { top: 300, bottom: 320 })
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBe(50)
  })

  it('a caret above the band comes back down', async () => {
    await boot()
    const sc = scroller(document.body, 5000, 100, 700)
    sc.scrollTop = 200
    const line = lineIn(sc, 50, 70)
    caret(line, 0, { top: 50, bottom: 70 })
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBe(200 - (100 + 24 - 50))
  })

  it('an expanded selection is a handle being dragged: following it fights the finger', async () => {
    await boot()
    vv.height = 500
    const sc = scroller()
    const line = lineIn(sc, 580, 600)
    caret(line, 0, { top: 580, bottom: 600 }, false)
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBe(0)
  })

  it('a selection elsewhere on the page is none of this scroller’s business', async () => {
    await boot()
    vv.height = 500
    const sc = scroller()
    const other = document.body.appendChild(document.createElement('p'))
    caret(other, 0, { top: 580, bottom: 600 })
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBe(0)
  })

  it('no selection at all is a quiet no-op', async () => {
    await boot()
    vi.spyOn(document, 'getSelection').mockReturnValue(null)
    expect(() => mod.caretIntoView(scroller())).not.toThrow()
  })

  it('a caret with no rect (the empty line Enter just made) is measured by its line', async () => {
    await boot()
    vv.height = 500
    const sc = scroller()
    const host = editable(sc.appendChild(document.createElement('div')))
    const line = host.appendChild(document.createElement('p'))
    box(line, 580, 600)
    caret(host, 0, null)
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBe(600 - (500 - 24))
  })

  it('a stale rect outside its own line is a lie: the line is measured instead', async () => {
    await boot()
    vv.height = 500
    const sc = scroller()
    const host = editable(sc.appendChild(document.createElement('div')))
    const line = host.appendChild(document.createElement('p'))
    box(line, 580, 600)
    caret(line, 0, { top: 200, bottom: 220 })
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBe(600 - (500 - 24))
  })

  it('no rect and no line to measure leaves the scroll alone', async () => {
    await boot()
    vv.height = 500
    const sc = scroller()
    const text = sc.appendChild(document.createTextNode('x'))
    caret(text, 0, null)
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBe(0)
  })

  it('a scroller out of road spills the rest to its ancestors', async () => {
    await boot()
    vv.height = 500
    const outer = scroller()
    const inner = scroller(outer, 100)
    const line = lineIn(inner, 580, 600)
    caret(line, 0, { top: 580, bottom: 600 })
    mod.caretIntoView(inner)
    expect(inner.scrollTop).toBe(100)
    expect(outer.scrollTop).toBe(124 - 100)
  })

  it('it clamps to what is visible, not to the box: a fixed surface keeps its height under the keyboard', async () => {
    await boot()
    vv.height = 500
    const sc = scroller(document.body, 5000, 0, 800)
    const line = lineIn(sc, 480, 500)
    caret(line, 0, { top: 480, bottom: 500 })
    mod.caretIntoView(sc)
    expect(sc.scrollTop).toBeGreaterThan(0)
  })
})

describe('the floating accessory pill on an iOS home-screen app', () => {
  async function typing(userAgent: string, standalone: boolean) {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: standalone } as MediaQueryList)
    await boot()
    const sc = scroller()
    const input = sc.appendChild(document.createElement('input'))
    input.scrollIntoView = vi.fn()
    input.focus()
    viewport({ height: 500 })
    sc.scrollTop = 0
    const line = lineIn(sc, 440, 460)
    caret(line, 0, { top: 440, bottom: 460 })
    mod.caretIntoView(sc)
    return sc.scrollTop
  }

  it('standalone iOS reserves its band above the keyboard', async () => {
    expect(await typing('Mozilla/5.0 (iPhone)', true)).toBe(460 - (500 - 64 - 24))
  })

  it('an iOS Safari tab keeps the bar inside the keyboard: nothing to reserve', async () => {
    expect(await typing('Mozilla/5.0 (iPhone)', false)).toBe(0)
  })

  it('an installed Android app has no floating pill either', async () => {
    expect(await typing('Mozilla/5.0 (Linux; Android 14)', true)).toBe(0)
  })
})

describe('typing follows the caret', () => {
  const input = () => document.dispatchEvent(new Event('input'))
  const selection = () => document.dispatchEvent(new Event('selectionchange'))

  async function typingIn(top: number, bottom: number) {
    await boot()
    const sc = scroller()
    const el = sc.appendChild(document.createElement('input'))
    el.scrollIntoView = vi.fn()
    // A field is a scroller in its own right: scrolling it would take its text from the caret.
    el.style.overflowY = 'auto'
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true })
    Object.defineProperty(el, 'clientHeight', { value: 40 })
    Object.defineProperty(el, 'scrollHeight', { value: 400 })
    box(el, top, bottom)
    el.focus()
    viewport({ height: 500 })
    vi.advanceTimersByTime(1000)
    sc.scrollTop = 0
    return { sc, el }
  }

  it('a field pushed under the keyboard is nudged back above it, by its ancestors', async () => {
    const { sc, el } = await typingIn(560, 600)
    input()
    frame()
    expect(sc.scrollTop).toBe(600 - (500 - 24))
    expect(el.scrollTop).toBe(0)
  })

  it('a field left in the panned-out band above comes back down, on both sides', async () => {
    const { sc } = await typingIn(100, 140)
    sc.scrollTop = 300
    vv.offsetTop = 200
    vi.spyOn(sc, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 800 } as DOMRect)
    input()
    frame()
    expect(sc.scrollTop).toBe(300 + (100 - (200 + 12)))
  })

  it('a field in the band is left alone: a manual peek while typing is never fought', async () => {
    const { sc } = await typingIn(200, 240)
    input()
    frame()
    expect(sc.scrollTop).toBe(0)
  })

  it('a burst of keystrokes costs one pass', async () => {
    const { sc } = await typingIn(560, 600)
    const spy = vi.spyOn(sc, 'scrollTop', 'set')
    input()
    input()
    input()
    frame()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('with no keyboard it is a constant-time no-op', async () => {
    await boot()
    const sc = scroller()
    const el = sc.appendChild(document.createElement('input'))
    box(el, 900, 940)
    el.focus()
    input()
    frame()
    expect(sc.scrollTop).toBe(0)
  })

  it('a TALL textarea measures the caret line: revealing its bottom edge pushed line 1 off the top', async () => {
    await boot()
    const sc = scroller()
    const area = sc.appendChild(document.createElement('textarea'))
    area.scrollIntoView = vi.fn()
    area.style.lineHeight = '20px'
    area.value = 'première ligne\nla suite'
    area.selectionStart = 3
    box(area, 100, 700)
    area.focus()
    viewport({ height: 500 })
    vi.advanceTimersByTime(1000)
    sc.scrollTop = 0
    input()
    frame()
    expect(sc.scrollTop).toBe(0)
  })

  it('the textarea mirror stays one hidden node, however many keystrokes it measures', async () => {
    await boot()
    const sc = scroller()
    const area = sc.appendChild(document.createElement('textarea'))
    area.scrollIntoView = vi.fn()
    area.style.lineHeight = '20px'
    box(area, 100, 700)
    area.focus()
    viewport({ height: 500 })
    vi.advanceTimersByTime(1000)
    input()
    frame()
    input()
    frame()
    expect(document.querySelectorAll('body > div[aria-hidden="true"]')).toHaveLength(1)
  })

  it('a contentEditable follows its caret through the nearest scroller', async () => {
    await boot()
    const sc = scroller()
    const note = editable(sc.appendChild(document.createElement('div')))
    note.tabIndex = 0
    note.focus()
    caret(note, 0, { top: 300, bottom: 320 })
    viewport({ height: 500 })
    vi.advanceTimersByTime(1000)
    caret(note, 0, { top: 600, bottom: 620 })
    input()
    frame()
    expect(sc.scrollTop).toBe(620 - (500 - 24))
  })

  async function noteWithCaret() {
    await boot()
    const sc = scroller()
    const note = editable(sc.appendChild(document.createElement('div')))
    note.tabIndex = 0
    note.focus()
    caret(note, 3, { top: 300, bottom: 320 })
    viewport({ height: 500 })
    vi.advanceTimersByTime(1000)
    selection()
    frame()
    return { sc, note }
  }

  it('a spurious selectionchange while scrolling is a same-place repeat: it does not yank back', async () => {
    const { sc, note } = await noteWithCaret()
    caret(note, 3, { top: 600, bottom: 620 })
    selection()
    frame()
    expect(sc.scrollTop).toBe(0)
  })

  it('a caret that truly moved is followed', async () => {
    const { sc, note } = await noteWithCaret()
    caret(note, 4, { top: 600, bottom: 620 })
    selection()
    frame()
    expect(sc.scrollTop).toBeGreaterThan(0)
  })

  it('a handle drag is not followed', async () => {
    const { sc, note } = await noteWithCaret()
    caret(note, 4, { top: 600, bottom: 620 }, false)
    selection()
    frame()
    expect(sc.scrollTop).toBe(0)
  })
})

describe('zoom stays locked', () => {
  const cancelable = (type: string, props: object) =>
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), props)

  it('ctrl+wheel and a trackpad pinch are stopped; a plain wheel still scrolls', async () => {
    await boot()
    const pinch = cancelable('wheel', { ctrlKey: true })
    window.dispatchEvent(pinch)
    expect(pinch.defaultPrevented).toBe(true)
    const plain = cancelable('wheel', { ctrlKey: false })
    window.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)
  })

  it('a second finger landing on an Android tablet is cancelled; one finger still scrolls', async () => {
    await boot()
    const pinch = cancelable('touchmove', { touches: [{}, {}] })
    document.dispatchEvent(pinch)
    expect(pinch.defaultPrevented).toBe(true)
    const swipe = cancelable('touchmove', { touches: [{}] })
    document.dispatchEvent(swipe)
    expect(swipe.defaultPrevented).toBe(false)
  })

  it.each(['gesturestart', 'gesturechange', 'gestureend'])('%s is blocked in a Safari tab', async (type) => {
    await boot()
    const gesture = cancelable(type, {})
    document.dispatchEvent(gesture)
    expect(gesture.defaultPrevented).toBe(true)
  })
})

describe('the on-device diagnostic', () => {
  const overlay = () => Array.from(document.body.children).find((c) => c.textContent?.includes('kbInset='))

  it('costs nothing when off', async () => {
    await boot()
    vi.advanceTimersByTime(1000)
    expect(overlay()).toBeUndefined()
  })

  it('once asked for, it sticks for the session and paints the live numbers', async () => {
    sessionStorage.setItem('bbKbDebug', '1')
    await boot()
    const input = field()
    input.focus()
    viewport({ height: 500 })
    vi.advanceTimersByTime(300)
    expect(overlay()?.textContent).toContain('kbInset=300 open=true')
    expect(overlay()?.textContent).toContain('ae=INPUT')
  })
})
