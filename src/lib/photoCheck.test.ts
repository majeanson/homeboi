// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BLUR_BELOW, EDGE_ABOVE, SHADOW_ABOVE, assessGray, warningsOf } from './photoCheck'

// A synthetic printed page: white paper, dark « text » as short horizontal strokes on a
// line grid, a margin all round. Deterministic (no randomness) so the thresholds mean
// the same thing on every run.
const W = 320
const H = 400
function page(opts: { margin?: number; blur?: boolean; shadow?: boolean; toEdge?: boolean } = {}): Uint8Array {
  const margin = opts.toEdge ? 0 : (opts.margin ?? 24)
  const g = new Uint8Array(W * H).fill(235)
  for (let y = margin; y < H - margin; y++) {
    const onLine = (y - margin) % 14 < 6
    if (!onLine) continue
    for (let x = margin; x < W - margin; x++) {
      // strokes 5 px wide, gaps 3 px — character-scale edges
      if ((x - margin) % 8 < 5) g[y * W + x] = 30
    }
  }
  if (opts.shadow) {
    // A hand's shadow: the lower-left third darkened by 60 %, text still there.
    for (let y = Math.floor(H * 0.6); y < H; y++) for (let x = 0; x < Math.floor(W * 0.5); x++) g[y * W + x] = Math.round(g[y * W + x] * 0.4)
  }
  if (opts.blur) {
    // Two 15×15 box passes — a shaken phone's σ ≈ 2 blur on 5-px strokes, which on the
    // real corpus photos takes sharpness from 937–3454 down to 8–17 (calibration).
    let cur = g
    for (let pass = 0; pass < 2; pass++) {
      const out = new Uint8Array(W * H)
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let s = 0
          let n = 0
          for (let dy = -7; dy <= 7; dy++) {
            for (let dx = -7; dx <= 7; dx++) {
              const yy = y + dy
              const xx = x + dx
              if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue
              s += cur[yy * W + xx]
              n++
            }
          }
          out[y * W + x] = Math.round(s / n)
        }
      }
      cur = out
    }
    return cur
  }
  return g
}

describe('photoCheck — what a photo says before a reader runs', () => {
  it('a sharp, lit, framed page raises no warning', () => {
    const a = assessGray(page(), W, H)
    expect(a.sharpness).toBeGreaterThan(BLUR_BELOW)
    expect(a.shadow).toBeLessThanOrEqual(SHADOW_ABOVE)
    expect(a.edge).toBeLessThanOrEqual(EDGE_ABOVE)
    expect(warningsOf(a)).toEqual([])
  })
  it('a blurred page is flagged « blur » — and sharpness orders the two', () => {
    const sharp = assessGray(page(), W, H)
    const soft = assessGray(page({ blur: true }), W, H)
    expect(soft.sharpness).toBeLessThan(sharp.sharpness)
    expect(warningsOf(soft)).toContain('blur')
  })
  // Measured on the corpus: a printed food photo scores like text under a hand, so the
  // shadow measure is reported but never warned (SHADOW_ABOVE is Infinity on purpose).
  it('a shadow is measured but never warned — on a glossy page it cannot be told from a printed photo', () => {
    const a = assessGray(page({ shadow: true }), W, H)
    expect(a.shadow).toBeGreaterThan(0)
    expect(warningsOf(a)).not.toContain('shadow')
  })
  it('text running to the frame’s edge is flagged « edge »', () => {
    expect(warningsOf(assessGray(page({ toEdge: true }), W, H))).toContain('edge')
  })
  it('a tiny or empty image says nothing', () => {
    expect(warningsOf(assessGray(new Uint8Array(0), 0, 0))).toEqual([])
    expect(warningsOf(assessGray(new Uint8Array(32 * 32), 32, 32))).toEqual([])
  })
})
