import { test, expect } from './fixtures'

// The per-section first-visit welcome card (SectionIntro): the first time a
// parent opens a themed tab, a calm "what this is" card sits above the section,
// links into the full Guide card, and is dismissible — once, then never again.
// Frontend-only against mocked APIs. `intros: true` leaves the cards un-dismissed
// (seedState pre-dismisses them everywhere else for stable screenshots).

// Keep the first-login guided tour from auto-navigating to /board (its overlay
// would gate the intro card off and pull us off the tab under test).

test('the first-visit card explains the section and deep-links into the Guide', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', state: { intros: true }, wait: '.hub' })
  const intro = page.locator('.section-intro')
  await expect(intro).toBeVisible()
  await expect(intro).toContainText('cuisine')
  // "En savoir plus" jumps into the matching Guide card (same path as HelpDot):
  // the card's themed Réglages tab, Comprendre lens, card param consumed.
  await intro.locator('.section-intro__more').click()
  await expect(page).toHaveURL(/\/settings\?tab=kitchen&lens=comprendre$/)
  const target = page.locator('.guide__card.is-target')
  await expect(target).toBeVisible()
  await expect(target).toContainText('cuisine')
})

// The nav restructure split the old « Le cercle » welcome card into two: Maison
// (routines/famille/social/business/carnets) and Les notes (Comprendre-only —
// its Guide card carries no `settings` field, but « En savoir plus » still lands
// on its own themed tab, not a fallback).
test('the Maison first-visit card explains the merged section', async ({ page, app }) => {
  await app.boot({ route: '/maison?section=business', state: { intros: true }, wait: '.hub' })
  const intro = page.locator('.section-intro')
  await expect(intro).toBeVisible()
  await expect(intro).toContainText('maison')
  await intro.locator('.section-intro__more').click()
  await expect(page).toHaveURL(/\/settings\?tab=maison&lens=comprendre$/)
  const target = page.locator('.guide__card.is-target')
  await expect(target).toBeVisible()
})

// The card follows the pill you are LOOKING at (solidify 4.4), the same table as the « ? »:
// a welcome about the whole tab sat above the routines.
test('Maison opens on routines, so its first-visit card is the routines one', async ({ page, app }) => {
  await app.boot({ route: '/maison', state: { intros: true }, wait: '.hub' })
  await expect(page.locator('.section-intro')).toHaveAttribute('aria-label', /routines/i)
})

test('the Les notes first-visit card explains the split-out section', async ({ page, app }) => {
  await app.boot({ route: '/notes', state: { intros: true }, wait: '.hub' })
  const intro = page.locator('.section-intro')
  await expect(intro).toBeVisible()
  await expect(intro).toContainText('notes')
  await intro.locator('.section-intro__more').click()
  await expect(page).toHaveURL(/\/settings\?tab=notes&lens=comprendre$/)
  const target = page.locator('.guide__card.is-target')
  await expect(target).toBeVisible()
})

test('dismissing the card hides it for good', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', state: { intros: true }, wait: '.hub' })
  const intro = page.locator('.section-intro')
  await expect(intro).toBeVisible()
  await intro.locator('.section-intro__dismiss').click()
  await expect(intro).toHaveCount(0)

  // The dismissal sticks across a reload (persisted in localStorage).
  await page.reload()
  await page.locator('.hub').first().waitFor({ state: 'visible' })
  await expect(page.locator('.section-intro')).toHaveCount(0)
})

test('the toddler lens never sees the welcome card', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', state: { audience: 'toddler', surface: 'kiosk', intros: true }, wait: '.hub' })
  await expect(page.locator('.section-intro')).toHaveCount(0)
})

// Review #19 (2026-11-17): « five tabs means five tutorials to dismiss ». One « Compris »
// now puts every section's card away, and a device that met the essentials tour (the
// app's one welcome) gets none at all.
test('one « Compris » puts away every tab’s card, not just this one', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', state: { intros: true }, wait: '.hub' })
  await page.locator('.section-intro .section-intro__dismiss').click()
  for (const route of ['/liste', '/notes', '/maison']) {
    await page.goto(route)
    await page.locator('.hub').first().waitFor({ state: 'visible' })
    await expect(page.locator('.section-intro'), route).toHaveCount(0)
  }
})

test('a device that met the essentials tour gets no section cards', async ({ page, app }) => {
  await page.addInitScript(() => localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials'])))
  await app.boot({ route: '/liste', state: { intros: true }, wait: '.hub' })
  await expect(page.locator('.hub__body')).toBeVisible()
  await expect(page.locator('.section-intro')).toHaveCount(0)
})

// « Revoir les cartes de première visite » (Découvrir) stores an explicit EMPTY set: asked
// for, the cards come back even on a device that met the tour long ago.
test('cards asked back (an explicit empty set) show despite the tour', async ({ page, app }) => {
  await page.addInitScript(() => {
    localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    localStorage.setItem('babillard-sections-seen', '[]')
  })
  await app.boot({ route: '/kitchen', state: { intros: true }, wait: '.hub' })
  await expect(page.locator('.section-intro')).toBeVisible()
})
