import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The recipe book's header, leaned: a COLLAPSED magnifier that becomes the search
// field on tap, an ICON-ONLY Collections segment, and no third "livre de cuisine"
// segment (that book is the toddler lens's door — KidKitchen's « Mon livre » tile —
// plus the kitchen ＋ ▸ « Faire un livre » and its guide card). Locks the four
// things a later "let's make room for X" edit would quietly undo: the loupe still
// opens AND lands the caret, a live query still keeps the field on screen, the
// icon-only tab still has an accessible name, and the two filter rows still fit a
// 390px phone.
const openBook = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/kitchen')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
  await page.locator('.recipe-card').first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('the search loupe expands, filters, and collapses back', async ({ page }) => {
  await openBook(page)
  const open = page.locator('.searchfield__open')
  await expect(open).toBeVisible() // collapsed by default — no field eating a line

  // One tap opens AND focuses: an expand that costs a second tap for the caret is
  // worse than the always-open field it replaced.
  await open.click()
  const input = page.locator('.searchfield__input')
  await expect(input).toBeFocused()
  await input.fill('bisc')
  await expect(page.locator('.recipe-card')).toHaveCount(1)

  // A live query pins the field open even without focus — it's the reason the grid
  // below is narrowed, so it must never collapse out from under the result.
  await page.locator('.recipes-title, h2').first().click({ force: true })
  await expect(input).toBeVisible()

  // ✕ clears and closes in one go.
  await page.locator('.searchfield__clear').click()
  await expect(open).toBeVisible()
  await expect(page.locator('.recipe-card')).toHaveCount(4)
})

test('the view toggle is Aa + an icon-only, still-named Collections — and no book segment', async ({ page }) => {
  await openBook(page)
  await expect(page.locator('.recipe-view-toggle__book')).toHaveCount(0)

  const collections = page.getByRole('tab', { name: 'Collections' })
  await expect(collections).toBeVisible()
  await expect(collections).toHaveText('') // the glyph carries it; aria-label names it
  await collections.click()

  // Grouped sections speak for themselves — the old "Touche des étiquettes…" hint
  // line is gone and must not creep back.
  await expect(page.locator('.recipe-collections-hint')).toHaveCount(0)
  await expect(page.locator('.recipe-group__head').first()).toBeVisible()
})

test('the leaned filter rows keep every control inside a 390px phone', async ({ page }) => {
  await openBook(page)
  // Per-child bounds check (scrollWidth reads 0 through the shell's overflow-x
  // clip). Descendants of a deliberate side-scroller are exempt: the pills + tag
  // rows scroll sideways by design.
  const bleeding = await page.evaluate(() => {
    const root = document.querySelector('.hub__body') as HTMLElement
    const edge = root.getBoundingClientRect().right
    const inScroller = (el: Element | null) => {
      for (let n = el; n && n !== root; n = n.parentElement)
        if (getComputedStyle(n).overflowX !== 'visible') return true
      return false
    }
    return [...root.querySelectorAll<HTMLElement>('*')]
      .filter((el) => {
        const b = el.getBoundingClientRect()
        return b.width > 0 && b.right > edge + 1 && !inScroller(el)
      })
      .map((el) => String(el.className))
      .slice(0, 10)
  })
  expect(bleeding, 'nothing bleeds past the right edge').toEqual([])
})
