import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

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

  // …and it closes again: this is an explainer, not a place you get stuck.
  await mark.click()
  await expect(pop).toHaveCount(0)
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
