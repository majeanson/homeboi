import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Réorganise ton babillard » — the on-board widget editor. Holding any card arms edit
// mode (lib/useLongPress); from there a card can be dragged (between zones, not just
// within one), resized, or removed. Everything writes the SAME per-device store the
// Réglages panel does (lib/boardCards), so the two stay in sync without any plumbing.
const HOLD = 700 // > LONG_PRESS_MS (500)

const open = async (page: Page) => {
  await mockApi(page)
  await seedState(page, {})
  await page.goto('/board')
  await page.waitForSelector('.board-grid .wg-slot')
}

// `page.mouse` works in viewport coordinates and never scrolls, unlike `.click()`. The
// board is a long inner scroller, so anything we press must be brought into view first —
// otherwise boundingBox() hands back coordinates the pointer can't reach.
const boxOf = async (page: Page, sel: string) => {
  const loc = page.locator(sel)
  await loc.scrollIntoViewIfNeeded()
  return (await loc.boundingBox())!
}

/** Press and hold the top edge of a card, without moving (travel aborts the hold). */
async function hold(page: Page, card: string, ms = HOLD) {
  const box = await boxOf(page, `.wg-slot[data-card="${card}"]`)
  await page.mouse.move(box.x + box.width / 2, box.y + 12)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

/** Drag `from`'s grip onto `to`'s slot. */
async function dragOnto(page: Page, from: string, to: string) {
  // Scroll BOTH into view before reading either box: a scroll triggered while measuring
  // the second one silently invalidates the first, and the press lands on stale pixels.
  await page.locator(`.wg-slot[data-card="${to}"]`).scrollIntoViewIfNeeded()
  await page.locator(`.wg-slot[data-card="${from}"]`).scrollIntoViewIfNeeded()
  const grip = await boxOf(page, `.wg-slot[data-card="${from}"] .wg-slot__grip`)
  const target = await boxOf(page, `.wg-slot[data-card="${to}"]`)
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  // Clear the 6px engage threshold, then land on the target.
  await page.mouse.move(grip.x + 30, grip.y + 30, { steps: 4 })
  await page.mouse.move(target.x + target.width / 2, target.y + 20, { steps: 8 })
  await page.mouse.up()
}

const zoneOf = (page: Page, card: string) =>
  page.locator(`.wg[data-zone] .wg-slot[data-card="${card}"]`).evaluate(
    (el) => (el.closest('.wg') as HTMLElement).dataset.zone,
  )

test.describe('board edit mode', () => {
  test('a long press arms edit mode; « Terminé » leaves it', async ({ page }) => {
    await open(page)
    await expect(page.locator('.board-edit')).toHaveCount(0)

    await hold(page, 'today')
    await expect(page.locator('.board-edit')).toBeVisible()
    await expect(page.locator('.board-grid.wg--editing')).toBeVisible()
    // The state lives in the URL so Réglages can deep-link into it.
    await expect(page).toHaveURL(/[?&]edit=1/)

    await page.getByRole('button', { name: 'Terminé' }).click()
    await expect(page.locator('.board-edit')).toHaveCount(0)
    await expect(page).not.toHaveURL(/[?&]edit=1/)
  })

  test('a quick tap never arms it — that press belongs to the card', async ({ page }) => {
    await open(page)
    await page.locator('.wg-slot[data-card="today"]').click({ position: { x: 10, y: 6 } })
    await expect(page.locator('.board-edit')).toHaveCount(0)
  })

  test('/board?edit=1 opens straight into it (the Réglages deep-link)', async ({ page }) => {
    await mockApi(page)
    await seedState(page, {})
    await page.goto('/board?edit=1')
    await expect(page.locator('.board-edit')).toBeVisible()
  })

  test('✕ removes a card, and the bar says where it went', async ({ page }) => {
    await open(page)
    await hold(page, 'today')
    await page.locator('.wg-slot[data-card="today"] .wg-slot__hide').click()

    await expect(page.locator('.wg-slot[data-card="today"]')).toHaveCount(0)
    // A one-way door would be a trap: the bar names the way back.
    await expect(page.locator('.board-edit')).toContainText('cachée')
    await expect(page.locator('.board-edit a')).toHaveAttribute('href', /tab=board&sub=layout/)

    // It survives a reload — this is a persisted device preference.
    await page.reload()
    await expect(page.locator('.wg-slot[data-card="today"]')).toHaveCount(0)
  })

  test('the size chip cycles the card through the widths', async ({ page }) => {
    await open(page)
    await hold(page, 'today')
    const slot = page.locator('.wg-slot[data-card="today"]')
    const chip = slot.locator('.wg-slot__size')

    await expect(chip).toHaveText('1')
    await chip.click()
    await expect(chip).toHaveText('2')
    await expect(slot).toHaveAttribute('style', /--wg-span-cols: ?2/)
    await chip.click()
    await expect(chip).toHaveText('3')
    await chip.click()
    await expect(chip).toHaveText('Max')
    await chip.click()
    await expect(chip).toHaveText('1')
  })

  test('a card drags from the band down into the masonry — the split is gone', async ({ page }) => {
    // Tall enough that the band and the first masonry card share a screen.
    await page.setViewportSize({ width: 1280, height: 1100 })
    await open(page)
    await hold(page, 'moments')
    expect(await zoneOf(page, 'moments')).toBe('band')

    await dragOnto(page, 'moments', 'autoCard')
    expect(await zoneOf(page, 'moments')).toBe('grid')

    await page.reload()
    await expect(page.locator('.wg-slot[data-card="moments"]')).toBeVisible()
    expect(await zoneOf(page, 'moments')).toBe('grid')
  })

  test('reordering inside the masonry persists', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page)
    await hold(page, 'today')

    const order = () =>
      page.locator('.board-grid > .wg-slot').evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.card),
      )
    const before = await order()
    await dragOnto(page, 'today', 'autoCard')
    const after = await order()
    expect(after).not.toEqual(before)
    expect(after.indexOf('today')).toBeLessThan(before.indexOf('today'))
  })

  // Edit mode hangs ✕ / ⠿ / size badges OUTSIDE each card's box (top:-8px, left/right:-8px).
  // On a phone the wall's padding is only 0.9rem, so this is exactly the kind of row that
  // has silently bled off the right edge here before — and `#root`/`.hub__body` set
  // `overflow-x:hidden`, so it would be CLIPPED, not caught. Measure per child.
  test('edit mode does not bleed off the right edge on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await mockApi(page)
    await seedState(page, {})
    await page.goto('/board?edit=1')
    await page.waitForSelector('.wg-slot__grip')

    const bad = await page.evaluate(() => {
      const wall = document.querySelector('.board-wall') as HTMLElement
      const right = wall.getBoundingClientRect().right
      const out: string[] = []
      for (const el of [...wall.querySelectorAll('.wg-slot, .wg-slot__ctl, .board-edit, .board-edit *')]) {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && r.right > right + 1) out.push(`${(el as HTMLElement).className}`.slice(0, 48))
      }
      return [...new Set(out)]
    })
    expect(bad, `overflowing: ${bad.join(' | ')}`).toEqual([])
    // And every card is a single column here — a size-3 widget must clamp, not overflow.
    const spans = await page.locator('.board-grid > .wg-slot').evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).style.getPropertyValue('--wg-span-cols')),
    )
    expect([...new Set(spans)]).toEqual(['1'])
  })

  // The two devices that must never edit: a read-only guest (the babysitter), and a cast
  // display — which renders this very <Board/> on a TV, with no pointer to hold.
  for (const { who, key } of [
    { who: 'a cast display', key: 'babillard-display' },
    { who: 'a guest', key: 'babillard-guest-token' },
  ]) {
    test(`${who} can never arm edit mode`, async ({ page }) => {
      await mockApi(page)
      await seedState(page, {})
      await page.addInitScript((k) => localStorage.setItem(k, '1'), key)
      await page.goto('/board')
      await page.waitForSelector('.board-grid')
      await hold(page, 'today').catch(() => {})
      await expect(page.locator('.board-edit')).toHaveCount(0)
      await expect(page.locator('.wg-slot__grip')).toHaveCount(0)
    })

    test(`${who} cannot force it with ?edit=1 either`, async ({ page }) => {
      await mockApi(page)
      await seedState(page, {})
      await page.addInitScript((k) => localStorage.setItem(k, '1'), key)
      await page.goto('/board?edit=1')
      await page.waitForSelector('.board-grid')
      await expect(page.locator('.board-edit')).toHaveCount(0)
    })
  }
})
