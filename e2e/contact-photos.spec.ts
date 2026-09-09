import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A contact's photo gallery (`ContactPhotos`, inside the person scene) — the last
// entry on the coverage backlog, and until now only ever smoke-rendered.
//
// The three things worth holding, none of them visible in a screenshot:
//   · a caption saves on blur, by id, trimmed
//   · an UNCHANGED caption writes nothing. Blurring a field is not an edit, and this
//     surface blurs constantly (tab away, tap another photo, close the scene) — a
//     write per blur would be a write per glance.
//   · the delete asks first, and « Annuler » really cancels. Deleting frees the R2
//     blob server-side, so there is no undo to fall back on: the confirm IS the
//     guarantee, which makes "cancel writes nothing" the load-bearing half.

interface Write {
  method: string
  body: Record<string, unknown>
}

const PHOTOS = {
  photos: [
    { id: 'ph1', photoKey: 'cer_a1', caption: 'Au chalet' },
    { id: 'ph2', photoKey: 'cer_b2', caption: null },
  ],
}

async function boot(page: Page): Promise<Write[]> {
  const writes: Write[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\//, '')
    if (path !== 'cercle-photos') return route.fallback()
    const method = route.request().method()
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PHOTOS) })
    }
    writes.push({ method, body: JSON.parse(route.request().postData() || '{}') })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // Sophie Gagnon (c4) in the shared cercle fixture. The gallery lives inside the
  // « Cadeaux, étiquettes et groupes » disclosure — closed unless the person already
  // has gift ideas or tags, so open it explicitly rather than depending on fixture data.
  await page.goto('/cercle/person/c4')
  const more = page.locator('.cf__more')
  await more.waitFor({ state: 'visible', timeout: 15_000 })
  if ((await page.locator('.cf-photos').count()) === 0) await more.locator('summary, button').first().click()
  await page.locator('.cf-photos__item').first().waitFor({ state: 'visible', timeout: 15_000 })
  return writes
}

const captionAt = (page: Page, n: number) => page.locator('.cf-photos__item .cf-photos__caption').nth(n)

test('a caption saves on blur, by id and trimmed', async ({ page }) => {
  const writes = await boot(page)
  const field = captionAt(page, 0)
  await field.fill('  Au lac  ')
  await field.blur()

  await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)
  expect(writes[0]).toEqual({ method: 'PATCH', body: { id: 'ph1', caption: 'Au lac' } })
})

test('…and an unchanged caption writes nothing at all', async ({ page }) => {
  const writes = await boot(page)
  const field = captionAt(page, 0)
  // Focus, leave it exactly as it was, blur — the everyday case on this surface.
  await field.click()
  await field.blur()
  // A caption that was never set is the other half of "unchanged" (null vs '').
  const empty = captionAt(page, 1)
  await empty.click()
  await empty.blur()

  await page.waitForTimeout(700)
  expect(writes, 'blurring a field the user did not change is not an edit').toEqual([])
})

test('deleting asks first — and « Annuler » really cancels', async ({ page }) => {
  const writes = await boot(page)
  await page.locator('.cf-photos__del').first().click()

  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await page.waitForTimeout(500)
  expect(writes, 'the blob is freed server-side, so a mis-tap must cost nothing').toEqual([])

  // Confirming does delete it, by id.
  await page.locator('.cf-photos__del').first().click()
  await dialog.getByRole('button', { name: 'Supprimer' }).click()
  await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)
  expect(writes[0]).toEqual({ method: 'DELETE', body: { id: 'ph1' } })
})
