import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// THE PER-CARD AIDS FOLD — and the one invariant that makes a fold safe.
//
// Every routine card offers four aids: a timer, « le truc », a voice clip and a
// photo. They shared one row on purpose (they read as a group), but at 390px that
// row wrapped to three lines UNDER EVERY CARD, so a four-step routine opened as
// twelve rows of things you are not doing before its footer — found by looking at
// the state matrix on 2026-09-10. They are behind a summary line now.
//
// A fold is only allowed if it never hides a filled field (LEAN.md). So the rule
// this file holds is not "the aids are collapsed" — it is:
//
//   a card with NO aid set    → one quiet summary, controls hidden until asked
//   a card WITH an aid set    → controls shown outright, and NO summary to re-hide them
//
// The second half is the one worth testing: the first is visible in any screenshot,
// while the second only appears on a household's own filled-in routine, which is
// exactly the state a screenshot sweep never has.

const CARDS_WITH_AID = [
  // A timer on the FIRST card and a « truc » on the second: two different aids, so a
  // fold that only remembered one of them still fails here.
  { icon: '👕', label: 'Habille-toi', seconds: 120 },
  { icon: '🥞', label: 'Déjeuner', tip: 'Assis-toi avant la première bouchée' },
  { icon: '🪥', label: 'Brosse tes dents' },
]

const ROUTINES_WITH_AIDS = {
  routines: {
    routines: [
      {
        id: 'r1',
        name: 'Matin',
        memberName: 'Léa',
        color: '#88A36F',
        avatarPhoto: null,
        timeOfDay: 'morning',
        cards: CARDS_WITH_AID,
        doneIdx: [],
        companion: 'fox',
      },
    ],
  },
}

async function openBuilder(page: Page, overrides?: Record<string, unknown>) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, overrides ? { overrides } : undefined)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/routine/r1')
  await expect(page.locator('.deck__row').first()).toBeVisible({ timeout: 15_000 })
}

test('a card with no aid keeps them folded, and opens on request', async ({ page }) => {
  await openBuilder(page)

  // `.deck__row` is the per-card WRAPPER: the card itself, then its aids, then the
  // truc field. Scoping to `.deck__card` would find only the label row's own
  // controls — the aids are its SIBLING, not its child.
  const cards = page.locator('.deck__row')
  const n = await cards.count()
  expect(n, 'the fixture routine should have several cards').toBeGreaterThan(1)

  // Folded: a summary per card, no controls on screen.
  await expect(page.locator('.deck__aids-toggle')).toHaveCount(n)
  await expect(page.locator('.deck__media')).toHaveCount(0)

  // …and it is a real door, not decoration.
  await page.locator('.deck__aids-toggle').first().click()
  await expect(page.locator('.deck__media')).toHaveCount(1)
  await expect(page.locator('.deck__media .deck__timer').first()).toBeVisible()

  // Single-open: asking for another card's aids puts the first one away, so the form
  // can never grow back into the twelve-row wall this fold exists to remove.
  await page.locator('.deck__aids-toggle').first().click()
  await expect(page.locator('.deck__media')).toHaveCount(0)
})

test('a card that CARRIES an aid shows it — no fold in front of a filled field', async ({ page }) => {
  await openBuilder(page, ROUTINES_WITH_AIDS)

  // Two of the three cards carry an aid (a timer, a truc); the third carries none.
  // So: two rows open, one summary — never three summaries, and never a summary on a
  // card whose aid is set (that is the failure mode, a filled field behind a fold).
  await expect(page.locator('.deck__media')).toHaveCount(2)
  await expect(page.locator('.deck__aids-toggle')).toHaveCount(1)

  // The timer really is showing its VALUE (« 2 min »), not just an empty control —
  // asserting on .deck__timer itself would be asserting on nothing: it is
  // `display: contents`, so it has no box and can never be "visible".
  // Exact name: a SET timer renders two buttons whose accessible names both contain
  // « minuterie » — the cycle button and « Retirer la minuterie ».
  await expect(
    page.locator('.deck__row').first().getByRole('button', { name: 'Minuterie', exact: true }),
  ).toContainText(/min/i)
  // …and the « truc » field on the second card is on screen with its text in it.
  await expect(page.locator('.deck__tip .edit-field__input').first()).toHaveValue(
    /Assis-toi avant la première bouchée/,
  )
})
