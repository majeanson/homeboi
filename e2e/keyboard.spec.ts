import { test, expect, type Page, type Locator } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Form action buttons + the focused field must stay visible when the on-screen
// keyboard is up. iOS overlays the keyboard without resizing the layout viewport;
// the app compensates by tracking window.visualViewport into CSS vars
// (--vvh/--vvt/--kb, src/lib/viewportVars.ts) that pin modals and lift sheets.
//
// Playwright can't summon a real keyboard, so we install a CONTROLLABLE
// visualViewport stub before the app boots, shrink it mid-test (like iOS does
// when the keyboard slides in), and assert the field + primary buttons still sit
// inside the visible area. Runs on a phone AND an iPad. Each case also shoots
// kb-*.png with a translucent band over the "keyboard" zone for visual review.

const DEVICES = [
  { name: 'phone', w: 390, h: 844, kb: 336 },
  { name: 'ipad', w: 820, h: 1180, kb: 405 },
]

function boot(device: { w: number; h: number }) {
  return async (page: Page, path: string, opts: { signedIn?: boolean } = {}) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: device.w, height: device.h })
    await page.addInitScript(() => {
      const stub = new EventTarget() as EventTarget & { height: number; offsetTop: number }
      stub.height = window.innerHeight
      stub.offsetTop = 0
      Object.defineProperty(window, 'visualViewport', { value: stub, configurable: true })
      ;(window as unknown as { __vvStub: typeof stub }).__vvStub = stub
    })
    await mockApi(page, opts)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto(path)
    await page.locator('.hub, .page').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  }
}

// Slide the fake keyboard in (visual viewport loses `kb` px) AND paint a band so
// the screenshot shows exactly what a keyboard would obscure.
async function openKeyboard(page: Page, kb: number) {
  await page.evaluate((kbH) => {
    const stub = (window as unknown as { __vvStub: { height: number; dispatchEvent: (e: Event) => boolean } }).__vvStub
    stub.height = window.innerHeight - kbH
    stub.dispatchEvent(new Event('resize'))
    let el = document.getElementById('fake-kb')
    if (!el) {
      el = document.createElement('div')
      el.id = 'fake-kb'
      document.body.appendChild(el)
    }
    el.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${kbH}px;z-index:99999;pointer-events:none;background:rgba(38,38,64,0.4);border-top:2px solid #6c7bff;`
  }, kb)
  await page.waitForTimeout(450)
}

// Element fully inside the visible (above-keyboard) area.
async function expectAbove(locator: Locator, visibleHeight: number, label: string) {
  await expect(locator, `${label} visible`).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label} has a box`).not.toBeNull()
  expect(box!.y, `${label} top on-screen`).toBeGreaterThanOrEqual(-1)
  expect(box!.y + box!.height, `${label} above the keyboard`).toBeLessThanOrEqual(visibleHeight + 1)
}

for (const d of DEVICES) {
  const open = boot(d)
  const VISIBLE = d.h - d.kb
  const png = (name: string) => `e2e/screenshots/kb-${d.name}-${name}.png`

  // --- Standalone auth forms ---
  for (const path of ['/login', '/signup'] as const) {
    test(`kb ${d.name}: ${path.slice(1)} form`, async ({ page }) => {
      await open(page, path, { signedIn: false })
      await page.locator('input').first().focus()
      await openKeyboard(page, d.kb)
      // A taller form (signup) can't fit above the OSK — but it MUST be scrollable
      // so the submit is reachable. Scroll the document scroller to the end (what a
      // user does), then assert the button cleared the keyboard. Without the --kb
      // slack on .auth there's no scroll room and it stays buried.
      await page.evaluate(() => {
        const r = document.getElementById('root')
        if (r) r.scrollTop = r.scrollHeight
      })
      await page.waitForTimeout(200)
      await page.screenshot({ path: png(path.slice(1)), fullPage: false })
      await expectAbove(page.locator('button[type="submit"]'), VISIBLE, `${path} submit`)
    })
  }

  // --- Settings: add-a-person form (inline, not a sheet) ---
  test(`kb ${d.name}: settings add-person`, async ({ page }) => {
    await open(page, '/settings')
    const nom = page.getByPlaceholder('Nom')
    await nom.scrollIntoViewIfNeeded()
    await nom.focus()
    await openKeyboard(page, d.kb)
    await page.screenshot({ path: png('settings-person'), fullPage: false })
    await expectAbove(nom, VISIBLE, 'settings Nom input')
  })

  // --- Overlays whose field must stay above the keyboard. `field` is scoped to
  // the VISIBLE overlay (.sheet.show / .pm-sheet) so it never matches the
  // always-mounted, off-screen <AddSheet> (a plain .sheet) sitting behind. ---
  const SHEETS: { name: string; path: string; field: string; go: (p: Page) => Promise<void> }[] = [
    { name: 'liste-addsheet', path: '/liste', field: '.sheet.show input', go: async (p) => void (await p.locator('.add-fab').click()) },
    { name: 'liste-item-sheet', path: '/liste', field: '.pm-sheet input', go: async (p) => void (await p.getByText('Pain', { exact: true }).first().click()) },
    { name: 'quickadd', path: '/liste', field: '.pm-sheet input', go: async (p) => void (await p.getByRole('button', { name: /Ajout rapide/ }).first().click()) },
    { name: 'deals-browser', path: '/liste', field: '.pm-sheet input', go: async (p) => void (await p.getByRole('button', { name: /Parcourir les circulaires/ }).click()) },
    { name: 'board-addsheet', path: '/board', field: '.sheet.show input', go: async (p) => void (await p.locator('.add-fab').click()) },
    { name: 'kitchen-addsheet', path: '/kitchen', field: '.sheet.show input', go: async (p) => void (await p.locator('.add-fab').click()) },
  ]
  for (const s of SHEETS) {
    test(`kb ${d.name}: ${s.name}`, async ({ page }) => {
      await open(page, s.path)
      await s.go(page)
      const field = page.locator(s.field).first()
      await field.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(300)
      if (await field.count()) await field.focus().catch(() => {})
      await openKeyboard(page, d.kb)
      await page.screenshot({ path: png(s.name), fullPage: false })
      await expectAbove(field, VISIBLE, `${s.name} field`)
    })
  }

  // --- Recipe modal: create form (title input summons the keyboard) ---
  test(`kb ${d.name}: recipe form`, async ({ page }) => {
    await open(page, '/kitchen')
    await page.locator('.add-fab').click()
    await page.locator('.cat-pick').first().click()
    await page.locator('.recipe-modal').waitFor({ state: 'visible' })
    await page.locator('.recipe-title-input').click()
    await openKeyboard(page, d.kb)
    await page.screenshot({ path: png('recipe-form'), fullPage: false })
    await expectAbove(page.locator('.recipe-modal__foot .btn--primary'), VISIBLE, 'recipe Enregistrer')
    await expectAbove(page.locator('.recipe-modal__bar button').last(), VISIBLE, 'recipe ✕')
  })

  // --- Recipe sheet: read view, actions stay reachable ---
  test(`kb ${d.name}: recipe sheet`, async ({ page }) => {
    await open(page, '/kitchen')
    await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
    await page.locator('.recipe-card').first().click()
    await page.locator('.recipe-modal').waitFor({ state: 'visible' })
    await openKeyboard(page, d.kb)
    await page.screenshot({ path: png('recipe-sheet'), fullPage: false })
    await expectAbove(page.locator('.recipe-actions .btn--primary'), VISIBLE, 'recipe Cuisiner')
  })
}

// No keyboard at all — a short phone (or split-screen): the modal must still fit
// and keep its footer reachable. Catches plain max-height regressions.
test('recipe form fits a short viewport', async ({ page }) => {
  const open = boot({ w: 390, h: 844 })
  await open(page, '/kitchen')
  await page.setViewportSize({ width: 390, height: 480 })
  await page.evaluate(() => {
    const stub = (window as unknown as { __vvStub: { height: number; dispatchEvent: (e: Event) => boolean } }).__vvStub
    stub.height = window.innerHeight
    stub.dispatchEvent(new Event('resize'))
  })
  await page.locator('.add-fab').click()
  await page.locator('.cat-pick').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })
  await expectAbove(page.locator('.recipe-modal__foot .btn--primary'), 480, 'short-vp Enregistrer')
  await expectAbove(page.locator('.recipe-modal__bar button').last(), 480, 'short-vp ✕')
})
