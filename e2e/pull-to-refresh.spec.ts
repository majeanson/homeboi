import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Pull-to-refresh on the hub body (bmad/12 #17).
//
// The gesture had to be built by hand: `html, body` are `overflow: hidden` with
// `overscroll-behavior: none`, so the document never overscrolls and no browser
// offers its own pull-to-refresh. See src/lib/pullToRefresh.ts.
//
// Playwright's touchscreen API only taps, so the drag is dispatched as raw
// TouchEvents. That's honest here — the hook listens for exactly those.
const PHONE = { width: 390, height: 780 }

async function drag(page: Page, dy: number, dx = 0, release = true) {
  await page.evaluate(
    ([dyv, dxv, rel]) => {
      const el = document.querySelector('.hub__body') as HTMLElement
      const rect = el.getBoundingClientRect()
      const x0 = rect.left + rect.width / 2
      const y0 = rect.top + 20
      const touch = (x: number, y: number) =>
        new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
      const fire = (type: string, x: number, y: number) => {
        const t = touch(x, y)
        el.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === 'touchend' ? [] : [t],
            targetTouches: type === 'touchend' ? [] : [t],
            changedTouches: [t],
          }),
        )
      }
      fire('touchstart', x0, y0)
      // Several steps, as a real finger produces — the hook only engages past a
      // small slop, and reads dx vs dy to reject a sideways swipe.
      for (let i = 1; i <= 6; i++) fire('touchmove', x0 + (dxv * i) / 6, y0 + (dyv * i) / 6)
      if (rel) fire('touchend', x0 + dxv, y0 + dyv)
    },
    [dy, dx, release] as const,
  )
}

test.describe('pull to refresh', () => {
  test.use({ viewport: PHONE })

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
  })

  test('a long pull refetches; a short one and a sideways swipe do not', async ({ page }) => {
    await seedState(page, { surface: 'mobile' })
    await page.goto('/liste')
    await page.waitForSelector('.hub__body')

    // /liste reads BOARD_KEY (`GET /api/board`) — that's the query an
    // unfiltered invalidate must refetch here.
    let listCalls = 0
    page.on('request', (r) => {
      if (r.url().includes('/api/board')) listCalls++
    })

    // Short pull — under the threshold. Nothing refetches.
    await drag(page, 40)
    await page.waitForTimeout(200)
    expect(listCalls).toBe(0)

    // Mostly sideways: a Rail / SubTabs swipe living inside the body must never
    // be swallowed by the pull.
    await drag(page, 60, 200)
    await page.waitForTimeout(200)
    expect(listCalls).toBe(0)

    // A real pull, past PULL_THRESHOLD / RESISTANCE.
    await drag(page, 180)
    await expect.poll(() => listCalls, { timeout: 5000 }).toBeGreaterThan(0)
  })

  test('the indicator opens while dragging and arms past the threshold', async ({ page }) => {
    await seedState(page, { surface: 'mobile' })
    await page.goto('/liste')
    await page.waitForSelector('.hub__body')

    // Held mid-drag (no touchend) so the indicator is observable.
    await drag(page, 180, 0, false)
    const ptr = page.locator('.hub__ptr')
    await expect(ptr).toBeVisible()
    await expect(ptr).toHaveClass(/hub__ptr--armed/)
    // It's a flow child, not an overlay: it pushes content down rather than
    // covering it, so nothing is ever hidden behind it.
    expect(await ptr.evaluate((el) => getComputedStyle(el).position)).toBe('static')
  })

  test('a kiosk has no pull gesture at all', async ({ page }) => {
    // A wall tablet is glanced at, not held — and it already polls. A sleeve
    // brushing the screen must not fire a refetch.
    await seedState(page, { surface: 'kiosk' })
    await page.goto('/liste')
    await page.waitForSelector('.hub__body')
    await drag(page, 180, 0, false)
    await expect(page.locator('.hub__ptr')).toHaveCount(0)
  })
})
