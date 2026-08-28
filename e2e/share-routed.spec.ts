import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// bmad/11 tier-1 seam #2, remaining half. /share re-implemented the capture spine
// beside CaptureForm — the build-beside failure mode CLAUDE.md warns about — and the
// cost was precisely the part it didn't copy: a shared link was filed by the AI and
// the page said only « Ajouté ! » before bouncing to the board a second later. Which
// list? Which day? If the AI guessed wrong, there was no « Corriger » and no undo.
//
// It now MOUNTS the real spine, seeded. This guards the two things that were missing:
// the routed label, and a reachable correction — reachable meaning still on screen,
// which is why the text branch no longer auto-returns.
test('a shared link lands with its routed label and a reachable « Corriger »', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/capture', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}')
    posts.push(body)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: body.forceType ?? 'event',
        degraded: false,
        routed: {
          kind: body.forceType ?? 'event',
          label: body.forceType ? 'Souper de tarte' : 'Rendez-vous : tarte',
          cleanup: [{ table: body.forceType ? 'meals' : 'events', id: 'x_e2e' }],
        },
      }),
    })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr' })

  await page.goto('/share?text=' + encodeURIComponent('https://example.com/recette-de-tarte'))
  await expect(page.locator('.share-page')).toBeVisible()

  // Seeded into the real spine — not a parallel textarea.
  const field = page.locator('.share-page .capture-form input.edit-field__input')
  await expect(field).toHaveValue('https://example.com/recette-de-tarte')
  await page.locator('.share-page .capture-form .edit-field__submit').click()

  // THE fix: the page says where it went.
  await expect(page.locator('.capture__routed')).toContainText('Ajouté :')
  await expect(page.locator('.capture__routed')).toContainText('Rendez-vous : tarte')

  // …and it STAYS on screen to be corrected. The old page bounced to /board on a
  // 1s timer, which is why this waits it out before asserting: a check taken
  // immediately passes against the very behaviour it is meant to forbid (verified by
  // planting the timed bounce back — without this wait the spec stayed green).
  await page.waitForTimeout(1600)
  expect(page.url()).toContain('/share')
  await expect(page.locator('.capture__routed')).toBeVisible()
  const correct = page.locator('.share-page .capture__correct')
  await expect(correct).toBeVisible()
  await correct.locator('.disclosure__summary').click()

  // A correction MOVES the capture: same text, a forced type, and the previous
  // routing's rows handed back for deletion (never a duplicate).
  await page.locator('.share-page .cat-pick', { hasText: 'Souper' }).first().click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1].forceType).toBe('meal')
  expect(posts[1].text).toBe('https://example.com/recette-de-tarte')
  expect(posts[1].undo).toEqual([{ table: 'events', id: 'x_e2e' }])

  // The way onward replaces « Annuler » once something has landed.
  await expect(page.locator('.share-page__actions .btn--ghost').first()).toContainText('babillard')
})
