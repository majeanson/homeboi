import { test, expect } from './fixtures'

// THE BACK BUTTON CLOSES THE OVERLAY — not the page under it.
//
// Until 2026-11-05 (wave 0.5 of plans/2026-11-05-SOLIDIFY.md) no sheet, peek, ⋯ menu or
// dialog held a history entry: on a phone, Android's back (hardware or gesture) and the
// iOS edge swipe in the installed PWA left the whole tab while a sheet was open — the
// one gesture every phone user reaches for first, and it threw away what they were
// looking at. useModal's `history` option holds one same-URL entry per open overlay;
// `page.goBack()` is that gesture.
//
// Each case: open → back → the overlay is gone, the URL did not move, the page is
// still mounted. The last case stacks a confirm over the peek: back closes the
// CONFIRM and leaves the peek open (one entry each).

test('the ＋ sheet', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.hub' })
  await page.locator('.add-fab').click()
  const sheet = page.locator('.sheet.show')
  await expect(sheet).toBeVisible()
  await page.goBack()
  await expect(sheet).toHaveCount(0)
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await expect(page.locator('.hub')).toBeVisible()
})

test('the detail peek', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.hub' })
  await page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click()
  const peek = page.locator('.detail-sheet.show')
  await expect(peek).toBeVisible()
  await page.goBack()
  await expect(peek).toHaveCount(0)
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await expect(page.locator('.hub')).toBeVisible()
})

test('the ⋯ menu inside the peek — back closes the MENU, the peek stays', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.hub' })
  await page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click()
  const peek = page.locator('.detail-sheet.show')
  await expect(peek).toBeVisible()
  await peek.locator('.action-menu__btn').click()
  const menu = page.locator('.action-menu__panel')
  await expect(menu).toBeVisible()
  await page.goBack()
  await expect(menu).toHaveCount(0)
  await expect(peek).toBeVisible()
  await page.goBack()
  await expect(peek).toHaveCount(0)
  await expect(page).toHaveURL(/\/board(\?|$)/)
})

test('a centred dialog (« Demander »)', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', wait: '.hub' })
  await page.locator('.app-head__ask').click()
  const dialog = page.locator('.kit-modal')
  await expect(dialog).toBeVisible()
  await page.goBack()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/kitchen(\?|$)/)
  await expect(page.locator('.hub')).toBeVisible()
})

test('a confirm raised from the peek — back answers « non », nothing else moves', async ({ page, app }) => {
  // A peek ACTION closes the peek first, then runs (lib/detail.ts) — so by the time the
  // confirm is up the peek's entry is already gone and the confirm's took its place.
  // The sequencing in useModal is what makes that hand-over clean (the confirm's push
  // waits for the peek's pop to settle); a stacked pair is the ⋯ case above.
  await app.boot({ route: '/board', wait: '.hub' })
  await page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click()
  const peek = page.locator('.detail-sheet.show')
  await expect(peek).toBeVisible()
  await peek.getByRole('button', { name: /Supprimer/ }).first().click()
  const confirm = page.locator('.confirm')
  await expect(confirm).toBeVisible()
  await expect(peek).toHaveCount(0)
  await page.goBack()
  await expect(confirm).toHaveCount(0)
  await expect(page).toHaveURL(/\/board(\?|$)/)
  await expect(page.locator('.hub')).toBeVisible()
  // « non » means no DELETE: the row is still there.
  await expect(page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first()).toBeVisible()
})

test('closing by ✕ leaves no dead entry: one back then goes where it always did', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.hub' })
  await page.goto('/kitchen')
  await page.locator('.hub').waitFor({ state: 'visible' })
  await page.locator('.add-fab').click()
  const sheet = page.locator('.sheet.show')
  await expect(sheet).toBeVisible()
  await sheet.locator('.sheet__close').click()
  await expect(sheet).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(/\/board(\?|$)/)
})
