import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The board's compact lens (lib/widgetGrid.isCompact + components/board/CardLens): a
// card halved on a phone renders a genuinely small tile — icon + title + at most one
// quiet hint — instead of a squeezed full card, and grows to the zone's full width in
// place when tapped. Modeled on board-edit.spec.ts's helpers.
//
// « today » (mode 'always', so it's never empty) is the halved card throughout: its
// default META size is already 1, but an UN-SIZED card falls back to 'full' on a narrow
// grid (CardSlot's `grid?.narrow ? 'full' : undefined` fallback), so the compact form
// only shows up once a device has actually CHOSEN a half — exactly what seeding
// `cardPrefs.size` here reproduces.
const HOLD = 700 // > LONG_PRESS_MS (500), mirrors board-edit.spec.ts

const open = async (page: Page, size: Record<string, number> = { today: 1 }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await mockApi(page)
  await seedState(page, { cardPrefs: { size } })
  await page.goto('/board')
  await page.waitForSelector('.board-grid .wg-slot')
}

// `page.mouse` works in viewport coordinates and never scrolls — bring the element into
// view first, same rule board-edit.spec.ts follows.
const boxOf = async (page: Page, sel: string) => {
  const loc = page.locator(sel)
  await loc.scrollIntoViewIfNeeded()
  return (await loc.boundingBox())!
}

/** Press and hold the top edge of a card, without moving, to arm edit mode. */
async function hold(page: Page, card: string, ms = HOLD) {
  const box = await boxOf(page, `.wg-slot[data-card="${card}"]`)
  await page.mouse.move(box.x + box.width / 2, box.y + 12)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test.describe('board compact lens', () => {
  test('a halved card renders its mini tile — icon + title, no mid-word wrap', async ({ page }) => {
    await open(page)
    const tile = page.locator('.wg-slot[data-card="today"] .cardmini')
    await tile.scrollIntoViewIfNeeded()
    await expect(tile).toBeVisible()
    await expect(tile).toHaveAttribute('aria-expanded', 'false')
    await expect(tile.locator('.cardmini__ico')).toBeVisible()

    const title = tile.locator('.cardmini__title')
    await expect(title).toBeVisible()
    await expect(title).toHaveText('Aujourd’hui')

    // Never a squeezed full card ("Spaghetti" → "Spaghet/ti"): the title box must fit
    // within its 2-line clamp, not a taller stack of one-word-per-line wraps. Reading
    // clientHeight (not scrollHeight) catches the clamp actually engaging.
    const { height, lineHeight } = await title.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { height: el.getBoundingClientRect().height, lineHeight: parseFloat(cs.lineHeight) }
    })
    expect(height).toBeLessThanOrEqual(lineHeight * 2 + 1)
  })

  // #root/.hub__body clip overflow-x, so a too-wide child is HIDDEN, not caught by a
  // scrollWidth check — measure every visible descendant's own right edge instead
  // (same technique as board-edit.spec.ts's "does not bleed off the right edge" test).
  test('every visible child of the mini tile stays inside its own right edge', async ({ page }) => {
    await open(page)
    await page.locator('.wg-slot[data-card="today"] .cardmini').scrollIntoViewIfNeeded()

    const bad = await page.evaluate(() => {
      const tile = document.querySelector('.wg-slot[data-card="today"] .cardmini') as HTMLElement
      const right = tile.getBoundingClientRect().right
      const out: string[] = []
      for (const el of [tile, ...tile.querySelectorAll('*')]) {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && r.right > right + 1) out.push((el as HTMLElement).className)
      }
      return out
    })
    expect(bad, `overflowing: ${bad.join(' | ')}`).toEqual([])
  })

  test('tap grows the card in place; the reduce chip shrinks it back', async ({ page }) => {
    await open(page)
    const slot = page.locator('.wg-slot[data-card="today"]')
    const tile = slot.locator('.cardmini')
    const compactBox = await boxOf(page, '.wg-slot[data-card="today"] .cardmini')
    const gridBox = await boxOf(page, '.board-grid')

    await expect(slot).not.toHaveAttribute('data-expanded', /.*/)
    await tile.click()

    await expect(slot).toHaveAttribute('data-expanded', '')
    const grownBox = (await slot.boundingBox())!
    expect(grownBox.width).toBeGreaterThan(compactBox.width * 1.5)
    // The zone's full measured width — same grid the neighbours reflow inside.
    expect(grownBox.width).toBeCloseTo(gridBox.width, 0)

    // The mini tile is gone; the ordinary header + rows are back.
    await expect(slot.locator('.cardmini')).toHaveCount(0)
    const reduce = slot.locator('.sec-label__reduce')
    await expect(reduce).toHaveAttribute('aria-expanded', 'true')
    await expect(slot.locator('.act, .sec-label')).not.toHaveCount(0)

    await reduce.click()
    await expect(slot).not.toHaveAttribute('data-expanded', /.*/)
    await expect(slot.locator('.cardmini')).toBeVisible()
    const backBox = (await slot.boundingBox())!
    // Back to a half column, not necessarily the exact same sub-pixel width (a
    // neighbour's row-span can nudge the grid's rounding by a pixel or two).
    expect(Math.abs(backBox.width - compactBox.width)).toBeLessThan(6)
  })

  test('single-open: expanding a second card collapses the first', async ({ page }) => {
    await open(page, { today: 1, toFinish: 1 })
    const today = page.locator('.wg-slot[data-card="today"]')
    const toFinish = page.locator('.wg-slot[data-card="toFinish"]')

    await today.locator('.cardmini').scrollIntoViewIfNeeded()
    await today.locator('.cardmini').click()
    await expect(today).toHaveAttribute('data-expanded', '')

    await toFinish.locator('.cardmini').scrollIntoViewIfNeeded()
    await toFinish.locator('.cardmini').click()
    await expect(toFinish).toHaveAttribute('data-expanded', '')
    // Only one card is ever grown at a time.
    await expect(today).not.toHaveAttribute('data-expanded', /.*/)
    await expect(today.locator('.cardmini')).toBeVisible()
  })

  test('arming edit mode collapses an expanded card', async ({ page }) => {
    await open(page)
    const slot = page.locator('.wg-slot[data-card="today"]')

    await slot.locator('.cardmini').scrollIntoViewIfNeeded()
    await slot.locator('.cardmini').click()
    await expect(slot).toHaveAttribute('data-expanded', '')

    await hold(page, 'today')
    await expect(page.locator('.board-edit')).toBeVisible()
    await expect(slot).not.toHaveAttribute('data-expanded', /.*/)
    // Back to its compact tile, not the grown form, the moment edit mode arms.
    await expect(slot.locator('.cardmini')).toBeVisible()
  })
})
