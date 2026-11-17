import { test, expect } from './fixtures'
import { BOARD } from './mocks'
import { DEALS, stagedDeal } from './dealFixture'

// Review #14 (2026-11-17), Mélanie at the Maxi till: « Montrer à la caisse » ▸
// « framboises » said « Prix pour framboises », the dates, « Circulaire Super C · via
// Flipp »… and no price, on the card or its tile. An item staged from the FULL flyer
// can state no single number (a multi-buy, « 30 % »): the price slot printed nothing.
// Now: the ad's own words when it has them, else « Voir la circulaire », never a blank.

test('a priceless staged deal shows the ad’s words, or points at the flyer', async ({ app, page }) => {
  const worded = { ...stagedDeal(DEALS[0]!, false), name: 'Framboises', price: null, priceText: '2 / 5 $' }
  const bare = { ...stagedDeal(DEALS[1]!, false), name: 'Bleuets', price: null }
  const board = {
    ...BOARD,
    list: [
      { ...BOARD.list[0]!, text: 'Framboises', deal_json: JSON.stringify(worded) },
      { ...BOARD.list[1]!, text: 'Bleuets', deal_json: JSON.stringify(bare) },
    ],
  }
  await app.boot({ route: '/liste', wait: '.hub', viewport: { width: 390, height: 844 }, api: { overrides: { board } } })
  await page.getByRole('button', { name: /Montrer à la caisse/ }).click()

  const tile = (name: string) => page.locator('.cashier__tile').filter({ hasText: name })
  await expect(tile('Framboises').locator('.cashier__tile-price')).toHaveText('2 / 5 $')
  await expect(tile('Bleuets').locator('.cashier__tile-price')).toHaveText('Voir la circulaire')

  await tile('Framboises').click()
  await expect(page.locator('.bigcard__price')).toHaveText('2 / 5 $')
})
