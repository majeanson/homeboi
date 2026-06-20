// The DrawPad canvas viewport (#14 zoom + pan): a scale `z` plus a CSS-px offset
// (ox, oy) mapping the drawing's CONTENT coordinates to what's on screen.
//   screen = content * z + offset      content = (screen - offset) / z
// Content coords are the canvas's logical CSS-px space (0..w, 0..h) — stable across
// zoom, so a stroke keeps its place when you zoom/pan. The pad applies this in
// render() (and inversely maps every pointer) so you can zoom in to add detail.
//
// Pure + framework-free so the math is unit-tested without a canvas. signature_pad
// can't itself map a zoomed coordinate (it stores `clientX - rect.left`, an offset
// with no scale), which is exactly why the pad routes ALL input through here.

export interface Viewport {
  z: number
  ox: number
  oy: number
}

export const IDENTITY: Viewport = { z: 1, ox: 0, oy: 0 }

const MIN_ZOOM = 1
const MAX_ZOOM = 5

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

// Screen/CSS px → content px (the inverse-map every pointer goes through).
export function toContent(v: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.ox) / v.z, y: (sy - v.oy) / v.z }
}

// Content px → screen/CSS px.
export function toScreen(v: Viewport, cx: number, cy: number): { x: number; y: number } {
  return { x: cx * v.z + v.ox, y: cy * v.z + v.oy }
}

// Keep the magnified content covering the viewport: at z>1 the offset is clamped so
// you can't drag the drawing off its own edges; at z<=1 there's nothing to pan, so
// it snaps back to the identity (no offset). `w`/`h` are the canvas CSS size.
export function clampPan(v: Viewport, w: number, h: number): Viewport {
  if (v.z <= 1) return { z: clampZoom(v.z), ox: 0, oy: 0 }
  const minOx = -(v.z - 1) * w
  const minOy = -(v.z - 1) * h
  return {
    z: v.z,
    ox: Math.min(0, Math.max(minOx, v.ox)),
    oy: Math.min(0, Math.max(minOy, v.oy)),
  }
}

// Snap a near-1 zoom back to a clean identity, so pinching out always lands exactly
// on the fitted view (no sub-pixel drift / stuck 1.002× pan).
export function settle(v: Viewport, w: number, h: number): Viewport {
  if (v.z <= 1.01) return IDENTITY
  return clampPan({ z: clampZoom(v.z), ox: v.ox, oy: v.oy }, w, h)
}

// Apply a two-finger pinch. Anchored so the content point under the gesture's start
// midpoint stays under the (now moved) current midpoint — pinch zooms AND pans in one
// gesture. `start` is the viewport when the second finger landed.
export function pinch(
  start: Viewport,
  startMid: { x: number; y: number },
  startDist: number,
  mid: { x: number; y: number },
  dist: number,
  w: number,
  h: number,
): Viewport {
  const z = clampZoom(start.z * (dist / (startDist || 1)))
  // The content point that was under the start midpoint, in the start viewport…
  const c = toContent(start, startMid.x, startMid.y)
  // …pinned under the current midpoint at the new zoom.
  return clampPan({ z, ox: mid.x - c.x * z, oy: mid.y - c.y * z }, w, h)
}

// Zoom toward a screen anchor (mouse wheel / + − buttons): the content under the
// anchor stays put while the scale changes by `factor`.
export function zoomAt(v: Viewport, factor: number, sx: number, sy: number, w: number, h: number): Viewport {
  const z = clampZoom(v.z * factor)
  const c = toContent(v, sx, sy)
  return settle({ z, ox: sx - c.x * z, oy: sy - c.y * z }, w, h)
}
