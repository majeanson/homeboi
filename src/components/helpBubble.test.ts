import { describe, expect, it } from 'vitest'
import { bubblePlace } from './HelpBubble'

// Review #20: help mode's bubble opened at the foot of the screen, over another card. It
// sits beside the finger now — centred under it, inside the viewport, above it when the
// tap was low.
const view = { w: 390, h: 844 }
const size = { w: 300, h: 140 }

describe('bubblePlace', () => {
  it('centres under the tap', () => {
    expect(bubblePlace({ x: 195, y: 200 }, size, view)).toEqual({ left: 45, top: 212 })
  })
  it('stays inside the screen at either edge', () => {
    expect(bubblePlace({ x: 10, y: 200 }, size, view).left).toBe(8)
    expect(bubblePlace({ x: 385, y: 200 }, size, view).left).toBe(390 - 300 - 8)
  })
  it('opens above a tap too low to fit below', () => {
    expect(bubblePlace({ x: 195, y: 800 }, size, view).top).toBe(800 - 12 - 140)
  })
})
