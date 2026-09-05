import { describe, it, expect } from 'vitest'
import { autoScrollStep, edgeSpeed, dropCueOf, dropEdgeClass } from './dnd'

// The two pure halves of lib/dnd: what a drop over a zone MEANS, and when a held
// drag pans the page. Both are rules the browser can't be asked about cheaply, and
// both were reported as bugs from the phone — so they live here, DOM-free, in the
// same spirit as lib/widgetGrid's grid geometry.

const rect = (top: number, height: number) => ({ top, bottom: top + height, height })

describe('edgeSpeed — the auto-scroll ramp', () => {
  const r = rect(0, 700) // band = clamp(48, 700*0.15 = 105, 120) = 105

  it('is zero through the neutral middle', () => {
    expect(edgeSpeed(350, r)).toBe(0)
    expect(edgeSpeed(200, r)).toBe(0)
    expect(edgeSpeed(500, r)).toBe(0)
  })

  it('pulls UP near the top and DOWN near the bottom', () => {
    expect(edgeSpeed(10, r)).toBeLessThan(0)
    expect(edgeSpeed(690, r)).toBeGreaterThan(0)
  })

  it('ramps with depth — the closer to the edge, the faster', () => {
    expect(Math.abs(edgeSpeed(5, r))).toBeGreaterThan(Math.abs(edgeSpeed(80, r)))
    expect(edgeSpeed(695, r)).toBeGreaterThan(edgeSpeed(620, r))
  })

  it('a pointer past the edge entirely still scrolls, at full speed, never faster', () => {
    // A finger dragged off the top of the scroller (onto the header) must not produce
    // a runaway negative — the ramp is clamped at the edge, not extrapolated past it.
    expect(edgeSpeed(-50, r)).toBe(edgeSpeed(0, r))
  })

  // The bug this clamp exists for: a short list would be two touching bands with no
  // neutral middle, so holding anywhere in it panned the list out from under you.
  it('always leaves a neutral middle, however short the scroller', () => {
    const tiny = rect(0, 100) // a 48px floor at each end would leave 4px
    expect(edgeSpeed(50, tiny)).toBe(0)
    expect(edgeSpeed(2, tiny)).toBeLessThan(0)
    expect(edgeSpeed(98, tiny)).toBeGreaterThan(0)
  })
})

describe('autoScrollStep — the arming latch', () => {
  const r = rect(0, 700)

  it('grabbing a card ALREADY in the band does not scroll', () => {
    // The reported shape of "helpful auto-scroll" going wrong: you asked to move a
    // card, not to pan the page.
    expect(autoScrollStep(10, r, false)).toEqual({ dy: 0, armed: false })
  })

  it('…and stays put for as long as the finger stays in the band', () => {
    let armed = false
    for (const y of [10, 20, 5, 30]) {
      const s = autoScrollStep(y, r, armed)
      armed = s.armed
      expect(s.dy).toBe(0)
    }
  })

  it('reaching the neutral middle arms it', () => {
    expect(autoScrollStep(350, r, false).armed).toBe(true)
  })

  it('once armed, returning to the band scrolls', () => {
    const { armed } = autoScrollStep(350, r, false)
    expect(autoScrollStep(10, r, armed).dy).toBeLessThan(0)
  })

  it('a drag that starts mid-screen pans the moment it reaches an edge', () => {
    // The whole point of the feature: one gesture from the top of a long board to the
    // bottom, instead of drop-and-regrab per screenful.
    const first = autoScrollStep(350, r, false) // the drag's first move
    expect(first.dy).toBe(0)
    expect(autoScrollStep(690, r, first.armed).dy).toBeGreaterThan(0)
  })
})

describe('dropCueOf — what releasing here would do', () => {
  const dnd = (activeId: string | null, over: string | null, overEdge: 'before' | 'after' | null) => ({ activeId, over, overEdge })

  it('names the pointer-chosen side of a reorder zone', () => {
    expect(dropCueOf(dnd('2', '5', 'before'), '5')).toBe('before')
    expect(dropCueOf(dnd('2', '5', 'after'), '5')).toBe('after')
  })

  it('a zone with no insert axis is a container — it reads « into »', () => {
    expect(dropCueOf(dnd('2', '5', null), '5')).toBe('into')
  })

  it('is null for every row that is not the one under the pointer', () => {
    expect(dropCueOf(dnd('2', '5', 'before'), '4')).toBeNull()
    expect(dropCueOf(dnd(null, '5', 'before'), '5')).toBeNull()
    expect(dropCueOf(dnd('2', null, null), '5')).toBeNull()
  })

  it('never cues a move onto the dragged row itself', () => {
    expect(dropCueOf(dnd('5', '5', 'before'), '5')).toBeNull()
  })

  it('a compound zone key says for itself whether it is the dragged one', () => {
    // The board keys slots « zone:cardId » while the drag carries the bare card id,
    // so `id === activeId` would never be true and a card could cue a drop on itself.
    expect(dropCueOf(dnd('today', 'grid:today', 'after'), 'grid:today', true)).toBeNull()
    expect(dropCueOf(dnd('today', 'grid:photos', 'after'), 'grid:photos', false)).toBe('after')
  })
})

describe('dropEdgeClass — the cue as a physical edge', () => {
  it('a column of rows reads top/bottom', () => {
    expect(dropEdgeClass('before', 'y')).toBe('top')
    expect(dropEdgeClass('after', 'y')).toBe('bottom')
  })

  it('a row of cards reads left/right', () => {
    expect(dropEdgeClass('before', 'x')).toBe('left')
    expect(dropEdgeClass('after', 'x')).toBe('right')
  })

  it('« into » draws no line — it wears the dotted outline instead', () => {
    expect(dropEdgeClass('into', 'x')).toBeNull()
    expect(dropEdgeClass('into', 'y')).toBeNull()
    expect(dropEdgeClass(null, 'y')).toBeNull()
  })
})
