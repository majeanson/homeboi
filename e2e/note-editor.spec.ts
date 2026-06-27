import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Every toolbar button in the full-screen rich note editor (#richnotes), driven in a
// real browser so execCommand (inline) + the flat-block transforms + checkbox + Enter
// continuation are all covered end-to-end. The pure Markdown⇄HTML layer is unit-tested
// in src/lib/noteHtml.test.ts; this proves the buttons are wired correctly.
test.use({ hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  const member = { id: 'm1', displayName: 'Marc', avatarKind: 'initial', avatarRef: '', colour: '#5891AC', isChild: false, email: null, phone: null, birthday: null, notes: null, gender: 'm' }
  await page.route('**/api/cercle**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [], members: [member], links: [], groups: [] }) })
  })
  await page.route('**/api/family-notes**', async (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [] }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'new' }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/cercle?section=notes')
  await page.getByRole('button', { name: 'Nouvelle note' }).click()
  await expect(page.locator('.note-editor')).toBeVisible()
  return page.locator('.note-editor__body')
}

test('inline buttons (bold / italic / strike) wrap the selected text', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('Hello')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')

  // execCommand emits <b>/<i>/<strike> in Chromium (our serializer maps both forms).
  await page.getByRole('button', { name: 'Gras' }).click()
  await expect(body.locator('b, strong')).toHaveText('Hello')

  // Re-select and add italic + strike on top.
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Italique' }).click()
  await expect(body.locator('i, em')).toHaveCount(1)
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Barré' }).click()
  await expect(body.locator('s, strike, del')).toHaveCount(1)
})

test('block buttons turn the line into heading / bullet / numbered / quote', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('A line')

  await page.getByRole('button', { name: 'Titre' }).click()
  await expect(body.locator('h3')).toHaveText('A line')
  await page.getByRole('button', { name: 'Titre' }).click() // toggles back to plain
  await expect(body.locator('h3')).toHaveCount(0)

  await page.getByRole('button', { name: 'Liste à puces' }).click()
  await expect(body.locator('.ne-bullet')).toHaveCount(1)
  await page.getByRole('button', { name: 'Liste numérotée' }).click()
  await expect(body.locator('.ne-number')).toHaveCount(1)
  await expect(body.locator('.ne-bullet')).toHaveCount(0) // switched, not stacked
  await page.getByRole('button', { name: 'Citation' }).click()
  await expect(body.locator('.ne-quote')).toHaveCount(1)
})

test('checklist button adds a tappable checkbox that toggles', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('Buy milk')
  await page.getByRole('button', { name: 'Case à cocher' }).click()

  const line = body.locator('.ne-check')
  await expect(line).toHaveCount(1)
  await expect(line).toHaveAttribute('data-checked', 'false')
  await line.locator('.ne-cb').click()
  await expect(line).toHaveAttribute('data-checked', 'true')
  await line.locator('.ne-cb').click()
  await expect(line).toHaveAttribute('data-checked', 'false')
})

test('Enter continues a list and an empty item ends it', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('one')
  await page.getByRole('button', { name: 'Liste à puces' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await expect(body.locator('.ne-bullet')).toHaveCount(2)

  // Enter on the now-empty third item drops out of the list.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(body.locator('.ne-bullet')).toHaveCount(2)
})

test('the body never shows raw Markdown characters', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('Bold me')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Gras' }).click()
  // The visible text is the words only — no ** markers leak into the surface.
  await expect(body).toHaveText('Bold me')
  expect(await body.innerText()).not.toContain('*')
})
