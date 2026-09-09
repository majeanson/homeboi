import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { boxOf } from './measure'

// THE IN-APP LEXICON (UNIFY.md day 7) — a word in the manual that explains itself.
//
// `src/lib/glossary.ts` settles which word the app uses; `[[mot:id|label]]` in a guide
// card marks the first place a household meets one, and tapping it pops the definition
// where it stands. Réglages / Comprendre only, on purpose: reading the manual is a
// one-off, so the mark costs a daily user nothing.
//
// This spec exists because the feature crosses TWO lazy boundaries that were added
// after it was eye-checked — the mark itself is `lazy()` out of `renderRich` (it was in
// the eager boot chunk and failed the bundle budget), and the term TABLE arrives through
// a dynamic `import()` on the tap. Either one silently failing looks exactly like "the
// word is plain text", which is also what a correct un-marked word looks like. Only an
// assertion tells those apart.

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await seedState(page, {})
})

test('a marked word in the guide is tappable and pops its definition', async ({ page }) => {
  // `?card=` opens the card; its POINTS are a second, nested <details>, and the marked
  // word lives in a point's detail. Opened the way a person opens it rather than by
  // `?point=<n>` — the index is 0-based and shifts whenever a point is trimmed, which
  // would turn a copy edit into a mystery failure in a spec about something else.
  await page.goto('/settings?tab=guide&card=first-time')
  const card = page.locator('.guide__card.is-target')
  await card.locator('.guide__point-title').first().click()

  const mark = page.locator('.gloss__word', { hasText: 'corvées' }).first()

  // The lazy chunk has to land before the dotted button exists at all — until then the
  // Suspense fallback renders the bare word, which is the correct-looking failure.
  await expect(mark).toBeVisible()
  await expect(mark).toHaveAttribute('aria-expanded', 'false')

  await mark.click()
  const pop = page.locator('.gloss__pop')
  await expect(pop).toBeVisible()
  // The definition comes from the term table, which arrives via its own dynamic import.
  // Asserting the MIDDLE of the sentence on purpose: the first word of corvée's own
  // definition is « tâche », a declared rival, and `glossary.test.ts` rightly refuses to
  // let a spec pin a word that is on its way out — it caught this line when it was
  // written. A definition may explain a term in ordinary language; a spec may not nail
  // that language down.
  await expect(pop).toContainText('du ménage qui revient')
  await expect(mark).toHaveAttribute('aria-expanded', 'true')

  // IT FLOATS over the paragraph now, so the one thing that can go wrong is the one
  // thing inline layout used to prevent: hanging off the screen. The mark can sit
  // anywhere on a line, so this measures the real box rather than trusting the clamp.
  const box = await boxOf(pop)
  const width = page.viewportSize()!.width
  expect(box.x, 'the definition starts off the left edge').toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `the definition runs past ${width}px`).toBeLessThanOrEqual(width)

  // …and it closes again: this is an explainer, not a place you get stuck.
  await mark.click()
  await expect(pop).toHaveCount(0)
})

test('the floating definition stays on screen at 320px', async ({ page }) => {
  // THE 390px CASE ABOVE DOES NOT EXERCISE THE CLAMP — proven by deleting the clamp and
  // watching it still pass: « corvées » happens to start early enough on its line that a
  // 22rem popover anchored to it still fits. A guard that cannot be made red by removing
  // the thing it guards is a decoration, so the real test is the tightest width the repo
  // supports, where the popover is wider than the room to the right of almost any word.
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/settings?tab=guide&card=first-time')
  await page.locator('.guide__card.is-target .guide__point-title').first().click()
  await page.locator('.gloss__word', { hasText: 'corvées' }).first().click()

  const pop = page.locator('.gloss__pop')
  await expect(pop).toBeVisible()
  const box = await boxOf(pop)
  expect(box.x, 'the definition starts off the left edge at 320px').toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, 'the definition runs past 320px').toBeLessThanOrEqual(320)

  // AND IT MUST BE PORTALED — the assertions above are not enough on their own, which is
  // the whole reason this line exists. The first implementation floated inside the
  // paragraph and satisfied both of them (x=24, right=312 in a 320px screen,
  // `scrollWidth === clientWidth`) while being visibly clipped on BOTH sides: the guide
  // card clips its own overflow, and viewport arithmetic cannot see an ancestor's clip.
  // Only leaving the card fixes it, so that is what gets asserted.
  await expect
    .poll(() => pop.evaluate((el) => el.parentElement === document.body))
    .toBe(true)
})

test('the floating definition is dismissible without finding the word again', async ({ page }) => {
  // A layer that covers text owes the reader a way out that is not "hit the same small
  // word a second time". Escape and an outside tap both close it.
  await page.goto('/settings?tab=guide&card=first-time')
  await page.locator('.guide__card.is-target .guide__point-title').first().click()
  const mark = page.locator('.gloss__word', { hasText: 'corvées' }).first()

  await mark.click()
  await expect(page.locator('.gloss__pop')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.gloss__pop')).toHaveCount(0)

  await mark.click()
  await expect(page.locator('.gloss__pop')).toBeVisible()
  await page.locator('.guide__card.is-target').click({ position: { x: 8, y: 8 } })
  await expect(page.locator('.gloss__pop')).toHaveCount(0)
})

test('the mark stays out of the hub surfaces a household uses every day', async ({ page }) => {
  // The whole bargain of the lexicon is that it taxes nobody who is not reading the
  // manual. A dotted word on the board would be a permanent cost for a one-off benefit.
  for (const route of ['/board', '/kitchen', '/liste', '/notes', '/maison']) {
    await page.goto(route)
    await page.waitForSelector('.hub')
    await expect(page.locator('.gloss__word'), `a glossary mark reached ${route}`).toHaveCount(0)
  }
})
