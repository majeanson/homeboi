import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Landing a guide deep-link ON the thing it named.
//
// A "?" bubble's « Voir le guide » (and every ?card=/?point= link) is a promise: you
// tapped a control on ONE screen and got moved to a manual on another. If the reader
// arrives at the top of a long page, that promise is broken in the most confusing way
// possible — they didn't choose to be here, and now they have to hunt.
//
// It WAS broken, in two compounding ways, which is why these assertions are about
// geometry and not about the URL (the old spec only checked the URL and passed
// happily while the page sat at scrollTop 0):
//   1. Two scrolls raced. GuideCard scrolled the point, GuideSection scrolled the
//      card, and React runs the child's effect FIRST — so the card always won and
//      the point was left below the fold.
//   2. Both were dropped anyway. The wiring consumes its own ?card=/?point= with a
//      `replace` navigation right after; the re-render killed the smooth scroll
//      mid-glide and the reader stayed at the top.
// One owner scrolls one node, once the layout has settled (lib/motion
// `scrollIntoViewSettled`), and verifies it actually landed.

const PHONE = { width: 390, height: 844 }

async function boot(page: Page, url: string) {
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(url)
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
}

/** Where the deep-link's highlighted target ended up, once everything settled. */
async function landing(page: Page) {
  await page.locator('.guide__card').first().waitFor({ state: 'visible', timeout: 15_000 })
  // Generous: the settle wait + smooth glide + the one verification pass.
  await page.waitForTimeout(2000)
  return await page.evaluate(() => {
    const pt = document.querySelector('.guide__point.is-target') as HTMLElement | null
    const card = document.querySelector('.guide__card.is-target') as HTMLElement | null
    const el = pt ?? card
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      kind: pt ? 'point' : 'card',
      top: Math.round(r.top),
      // Fully inside the viewport, not clipped off the top edge.
      onScreen: r.top >= 0 && r.top < window.innerHeight,
      open: el instanceof HTMLDetailsElement ? el.open : null,
    }
  })
}

test('a ?point deep-link lands ON the point, opened — not at the top of the page', async ({ page }) => {
  await boot(page, '/settings?tab=guide&card=liste&point=9')
  const l = await landing(page)
  expect(l).not.toBeNull()
  expect(l!.kind).toBe('point')
  expect(l!.open).toBe(true)
  expect(l!.onScreen).toBe(true)
})

test('a card-only deep-link lands on the card, with air above it', async ({ page }) => {
  await boot(page, '/settings?tab=guide&card=habits')
  const l = await landing(page)
  expect(l!.kind).toBe('card')
  expect(l!.onScreen).toBe(true)
  // scroll-margin keeps the accent ring off the very edge — `block: 'start'` alone
  // parked the border box at 0 and clipped it.
  expect(l!.top).toBeGreaterThan(0)
})

test('a RETIRED card id still lands on its host point (GUIDE_CARD_ALIAS)', async ({ page }) => {
  // `drawings` was merged into `mots`; the alias carries a point offset, so a
  // bookmarked link must land on the sub-point, not merely the host card.
  await boot(page, '/settings?tab=guide&card=drawings')
  const l = await landing(page)
  expect(l!.kind).toBe('point')
  expect(l!.onScreen).toBe(true)
})

test('reduced motion still lands (no animation, same destination)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page, '/settings?tab=guide&card=liste&point=9')
  const l = await landing(page)
  expect(l!.kind).toBe('point')
  expect(l!.onScreen).toBe(true)
})

test('the real flow: a "?" bubble on La liste carries the reader to the right line', async ({ page }) => {
  await boot(page, '/liste')
  // Arm help mode, then tap the ⚙ — the SIMPLE ↔ AVANCÉ chip.
  const toggle = page.locator('.help-toggle').first()
  await expect(toggle).toBeVisible()
  await toggle.click()
  await page.locator('.mode-toggle').click()
  const bubble = page.locator('.help-bubble').first()
  await expect(bubble).toBeVisible()
  await bubble.locator('.help-bubble__guide').click()

  const l = await landing(page)
  expect(l!.kind).toBe('point')
  expect(l!.onScreen).toBe(true)
  // …and it's the point the ⚙ actually named, not just any highlighted line.
  await expect(page.locator('.guide__point.is-target')).toContainText(/Simple ou avanc/i)
})
