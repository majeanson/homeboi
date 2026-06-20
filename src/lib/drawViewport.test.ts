import { describe, it, expect } from 'vitest'
import { IDENTITY, toContent, toScreen, clampZoom, clampPan, settle, pinch, zoomAt } from './drawViewport'

describe('drawViewport', () => {
  it('identity maps screen<->content 1:1', () => {
    expect(toContent(IDENTITY, 40, 70)).toEqual({ x: 40, y: 70 })
    expect(toScreen(IDENTITY, 40, 70)).toEqual({ x: 40, y: 70 })
  })

  it('toContent inverts toScreen at any viewport', () => {
    const v = { z: 2.5, ox: -30, oy: -12 }
    const s = toScreen(v, 100, 80)
    const c = toContent(v, s.x, s.y)
    expect(c.x).toBeCloseTo(100)
    expect(c.y).toBeCloseTo(80)
  })

  it('clampZoom holds [1,5]', () => {
    expect(clampZoom(0.2)).toBe(1)
    expect(clampZoom(9)).toBe(5)
    expect(clampZoom(3)).toBe(3)
  })

  it('clampPan keeps magnified content covering the viewport, snaps z<=1 to identity', () => {
    // At z=2 over a 300x200 canvas, offset is bounded to [-(z-1)*w, 0] = [-300,0].
    expect(clampPan({ z: 2, ox: 100, oy: 50 }, 300, 200)).toEqual({ z: 2, ox: 0, oy: 0 })
    expect(clampPan({ z: 2, ox: -999, oy: -999 }, 300, 200)).toEqual({ z: 2, ox: -300, oy: -200 })
    expect(clampPan({ z: 1, ox: -50, oy: -50 }, 300, 200)).toEqual({ z: 1, ox: 0, oy: 0 })
  })

  it('settle snaps a near-1 zoom back to identity', () => {
    expect(settle({ z: 1.005, ox: -2, oy: -3 }, 300, 200)).toEqual(IDENTITY)
    expect(settle({ z: 1.5, ox: 0, oy: 0 }, 300, 200).z).toBe(1.5)
  })

  it('pinch keeps the content under the start midpoint pinned under the moving midpoint', () => {
    const w = 300
    const h = 200
    const start = IDENTITY
    const startMid = { x: 150, y: 100 }
    // Pinch out 2x with the midpoint held in place → 2x zoom centred there.
    const v = pinch(start, startMid, 100, startMid, 200, w, h)
    expect(v.z).toBe(2)
    // The content under the midpoint must still map back to the midpoint.
    const back = toScreen(v, ...Object.values(toContent(start, startMid.x, startMid.y)) as [number, number])
    expect(back.x).toBeCloseTo(150)
    expect(back.y).toBeCloseTo(100)
  })

  it('pinch clamps zoom to the max', () => {
    const v = pinch(IDENTITY, { x: 10, y: 10 }, 10, { x: 10, y: 10 }, 1000, 300, 200)
    expect(v.z).toBe(5)
  })

  it('zoomAt keeps the anchor point fixed', () => {
    const w = 300
    const h = 200
    const anchor = { x: 60, y: 40 }
    const v = zoomAt(IDENTITY, 2, anchor.x, anchor.y, w, h)
    expect(v.z).toBe(2)
    const c = toContent(IDENTITY, anchor.x, anchor.y)
    const s = toScreen(v, c.x, c.y)
    expect(s.x).toBeCloseTo(anchor.x)
    expect(s.y).toBeCloseTo(anchor.y)
  })

  it('zoomAt out to 1 settles to identity', () => {
    expect(zoomAt({ z: 1.2, ox: -10, oy: -8 }, 0.5, 0, 0, 300, 200)).toEqual(IDENTITY)
  })
})
