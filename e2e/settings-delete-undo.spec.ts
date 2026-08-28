import { test, expect } from '@playwright/test'
import { mockApi, seedState, ROUTES } from './mocks'

// REVIEW-PASS: deleting an event or a chore in Réglages hid the row by mutating the
// query cache (`useUndoableRemove` → `setQueryData`). That is safe only while nothing
// refills the key inside the undo window — and things do: a RealtimeHub `invalidate`
// from another device refetches an ACTIVE query whether or not it polls, and simply
// leaving the sub and coming back re-runs it. The server frame legitimately still
// contains the row (the DELETE is held behind « Annuler »), so it came back, then
// vanished again when the write finally ran.
//
// `useDeferredRemoval` holds the id in a MODULE-level pending set and filters the
// RENDER, so no refetch — and no remount — can put it back. The set outliving the
// component is the property under test here.

const PHONE = { width: 390, height: 844 }

async function boot(page: import('@playwright/test').Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
}

test('a deleted event stays gone across a remount, then « Annuler » restores it', async ({ page }) => {
  const deletes: string[] = []
  await boot(page)
  await page.route('**/api/events**', async (route) => {
    const m = route.request().method()
    if (m === 'GET') {
      // The server still has it — the DELETE is held behind the undo.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROUTES.events) })
    }
    deletes.push(m)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.goto('/settings?tab=board&lens=regler&sub=events')
  await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })

  const title = (ROUTES.events as { events: { title: string }[] }).events[0].title
  const row = () => page.locator('.operator__list li', { hasText: title })
  await expect(row()).toBeVisible()

  await row().getByRole('button', { name: 'Supprimer' }).click()
  await expect(row()).toHaveCount(0)
  await expect(page.locator('.undo-toast')).toBeVisible()

  // Leave the sub and come back — CLIENT-side (clicking the pills), not page.goto:
  // a full reload would wipe the module-level pending set along with everything else,
  // which tests the browser, not the helper. The list unmounts and its query re-runs
  // against a server frame that still contains the event.
  const pill = (name: string) => page.locator('.subtabs__opt', { hasText: name })
  await pill('Disposition du babillard').click()
  await expect(page.locator('.operator__list li', { hasText: title })).toHaveCount(0)
  await pill('Rendez-vous').click()
  await expect(page.locator('.operator__list li').first()).toBeVisible()
  await expect(row(), 'a remount must not resurrect a row held behind the undo').toHaveCount(0)

  // Nothing has been sent yet — the whole point of a deferred delete.
  expect(deletes).toEqual([])

  await page.locator('.undo-toast__btn').first().click()
  await expect(row()).toBeVisible()
  expect(deletes, '« Annuler » must leave the server untouched').toEqual([])
})
