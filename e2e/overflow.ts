import { expect, type Page } from '@playwright/test'

// Shared per-element right-edge overflow guard (extracted from
// add-sheet-overflow.spec.ts so the state-matrix suite can assert it on every
// captured state). The measurement is a per-descendant bounding-rect check: for
// every visible descendant, its right edge must not exceed the box's right edge.
// That sees through `overflow-x:hidden` clips, which `scrollWidth - clientWidth`
// cannot — the classic way a too-wide row ships unnoticed here.

// The largest amount (px) by which any VISIBLE descendant of `selector` runs past
// its right edge, plus the classic sideways-pan number. <= 1 = clean (sub-pixel).
// Several `.sheet`s stay always-mounted at once, so a page with more than one
// needs the OPEN one's own modifier class, not the bare '.sheet'.
export async function worstRightBleed(
  page: Page,
  selector = '.sheet',
): Promise<{ bleed: number; pan: number; culprit: string }> {
  return page.evaluate((sel) => {
    const sheet = document.querySelector(sel) as HTMLElement | null
    if (!sheet) return { bleed: -1, pan: -1, culprit: `no ${sel}` }
    const edge = sheet.getBoundingClientRect().right
    // A `.rail` (lib/Layout.tsx) is a SANCTIONED horizontal scroller — content
    // wider than it legitimately extends past its own visible edge, scrollable,
    // never clipped-and-lost the way an un-wrapped Cluster row would be. Skip any
    // element whose nearest scrollable ancestor (up to the box) sets its own
    // `overflow-x: auto`/`scroll` — its "bleed" past the BOX edge is contained
    // by that ancestor's own scrollbar, not a hidden clip bug.
    const insideOwnScroller = (el: HTMLElement): boolean => {
      let p = el.parentElement
      while (p && p !== sheet) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
        p = p.parentElement
      }
      return false
    }
    let bleed = 0
    let culprit = ''
    for (const el of Array.from(sheet.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue // hidden / collapsed — ignore
      if (insideOwnScroller(el)) continue
      const over = r.right - edge
      if (over > bleed) {
        bleed = over
        culprit = (el.className || el.tagName).toString().slice(0, 80)
      }
    }
    return { bleed, pan: sheet.scrollWidth - sheet.clientWidth, culprit }
  }, selector)
}

// `clip` — which cross-axis containment the box must declare. A `.sheet` explicitly
// sets `overflow-x:hidden`. A `.scene__body` only sets `overflow-y:auto`, which CSS
// computes to `overflow-x:auto` (the pair can't mix `visible` with a scroll value);
// the pan assertion above is what actually proves the scene never scrolls sideways.
export async function assertClean(page: Page, label: string, selector = '.sheet', clip: 'hidden' | 'auto' = 'hidden') {
  const { bleed, pan, culprit } = await worstRightBleed(page, selector)
  expect(pan, `${label}: sheet pans sideways`).toBeLessThanOrEqual(1)
  expect(bleed, `${label}: "${culprit}" bleeds off the right edge`).toBeLessThanOrEqual(1)
  // The box must explicitly clip the cross axis regardless.
  const overflowX = await page.evaluate((sel) => {
    const s = document.querySelector(sel) as HTMLElement | null
    return s ? getComputedStyle(s).overflowX : ''
  }, selector)
  expect(overflowX, `${label}: box overflow-x`).toBe(clip)
}
