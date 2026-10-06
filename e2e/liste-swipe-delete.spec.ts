import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Swipe-left delete on La liste, END TO END — the guard for « I swipe and the items
// always come back » (2026-10-06, round four of this bug, and the first round whose
// cause was ever observable in a test).
//
// Why no spec could catch it before: the mock answered every `DELETE /api/list`
// with a bare ok while KEEPING the row, so the refetched board frame always still
// contained what was just deleted — any spec asserting « swiped means gone past the
// refetch » would have been red against a mock, not the app. The mock now removes
// the row (like the server), and THIS spec holds the whole visible contract:
//
//   swipe → the row hides at once + the undo toast offers « Annuler »
//         → the held DELETE fires after the undo window, carrying the row's id AND
//           its text + the gesture's asOf (what lets the server heal a stale id —
//           the production failure was a frame whose ids the database no longer had,
//           and a delete by id alone then removed nothing while answering ok)
//         → the next refetched frame does not resurrect the row.
//
// Raw TouchEvents, like pull-to-refresh.spec.ts: Playwright's touchscreen only
// taps, and useSwipeToDelete listens for exactly these.
const PHONE = { width: 390, height: 780 }

// A flat leftward swipe on `sel` — |dy| stays 0 so the hook's vertical-biased axis
// lock arms horizontal, and the travel clears max(90px, 35% of the row's width).
async function swipeLeft(page: Page, sel: string, dx = -220) {
  await page.evaluate(
    ([selector, travel]) => {
      const el = document.querySelector(selector as string) as HTMLElement
      if (!el) throw new Error(`no element for ${selector}`)
      const rect = el.getBoundingClientRect()
      const x0 = rect.left + rect.width * 0.8
      const y0 = rect.top + rect.height / 2
      const touch = (x: number, y: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
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
      for (let i = 1; i <= 6; i++) fire('touchmove', x0 + ((travel as number) * i) / 6, y0)
      fire('touchend', x0 + (travel as number), y0)
    },
    [sel, dx] as const,
  )
}

const ROW = '.list-row[data-item-id="l2"]' // « Pain », a plain fixture row

test.describe('swipe-delete on La liste', () => {
  test.use({ viewport: PHONE, hasTouch: true })

  test.beforeEach(async ({ page }) => {
    // reducedMotion makes the slide-out call onDelete synchronously — the gesture
    // contract is the same, without 300 ms animation waits in every assertion.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { surface: 'mobile' })
    await page.goto('/liste')
    await page.waitForSelector('.list-rows')
  })

  test('a swiped row dies for real: hidden at once, deleted on commit, still gone past the refetch', async ({ page }) => {
    await expect(page.locator(ROW)).toBeVisible()

    const [req] = await Promise.all([
      // The DELETE is held behind the undo toast (15 s, toast.tsx DEFAULT_UNDO_MS).
      page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/list'), { timeout: 20_000 }),
      swipeLeft(page, `${ROW} .list-row__main`),
      // The row hides immediately and the undo toast offers the way back.
      expect(page.locator(ROW)).toBeHidden(),
      expect(page.locator('.undo-toast')).toBeVisible(),
    ])

    // The write carries the id AND the stale-frame lifeline: the line's text + the
    // gesture's time, so the server can delete the same ITEM when the id is one the
    // database no longer has (functions/api/list.ts onRequestDelete, 2026-10-06).
    const body = JSON.parse(req.postData() || '{}')
    expect(body).toMatchObject({ id: 'l2', text: 'Pain' })
    expect(typeof body.asOf, 'asOf = the gesture’s epoch seconds').toBe('number')

    // The resurrection check: a frame fetched AFTER the delete landed must not
    // repaint the row (the deferred removal un-hides once the scope is fresh — if
    // the frame still contained l2, « Pain » would come straight back here).
    await page.waitForResponse((r) => r.url().includes('/api/board') && r.request().method() === 'GET', { timeout: 20_000 })
    await page.waitForTimeout(500)
    await expect(page.locator(ROW)).toHaveCount(0)
    await expect(page.locator('.list-rows')).not.toContainText('Pain')
  })

  test('« Annuler » brings the row back and the DELETE never fires', async ({ page }) => {
    let deletes = 0
    page.on('request', (r) => {
      if (r.method() === 'DELETE' && r.url().includes('/api/list')) deletes++
    })

    await swipeLeft(page, `${ROW} .list-row__main`)
    await expect(page.locator(ROW)).toBeHidden()
    await page.locator('.undo-toast').getByRole('button', { name: 'Annuler' }).click()

    // Back at once — the held write was cancelled, nothing reached the network.
    await expect(page.locator(ROW)).toBeVisible()
    // Outlive the undo window (15 s) to prove the cancelled commit stays cancelled.
    await page.waitForTimeout(17_000)
    expect(deletes, 'an undone delete must never fire').toBe(0)
    await expect(page.locator(ROW)).toBeVisible()
  })

  // « Vider les cochés » is the batch twin: same stale-id hole, same guard. The request must
  // carry the ticked lines' NAMES and the gesture's time (what lets the server stand a
  // same-named line in for an id it never had), and the cleared line must stay gone past the
  // refetch — the mock now removes it like the server does.
  test('« Vider les cochés » names what it clears and the line stays gone past the refetch', async ({ page }) => {
    await expect(page.locator(ROW)).toBeVisible()
    await page.locator(ROW + ' .list-row__toggle').click()
    await expect(page.locator(ROW + ' .list-row__main.done')).toBeVisible()

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/api/list') && (r.postData() ?? '').includes('clearChecked'), {
        timeout: 20_000,
      }),
      page.getByRole('button', { name: /Vider les cochés/ }).click(),
      expect(page.locator(ROW)).toBeHidden(),
    ])
    const body = JSON.parse(req.postData() || '{}')
    expect(body).toMatchObject({ clearChecked: true, ids: ['l2'], items: [{ id: 'l2', text: 'Pain' }] })
    expect(typeof body.asOf, 'asOf = the gesture’s epoch seconds').toBe('number')

    await page.waitForResponse((r) => r.url().includes('/api/board') && r.request().method() === 'GET', { timeout: 20_000 })
    await page.waitForTimeout(500)
    await expect(page.locator(ROW)).toHaveCount(0)
  })
})
