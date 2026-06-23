import { test, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Capture each Settings section (the CRUD strips behind the section nav) — they
// only render one at a time, so the static sweep only ever shoots the first.
// Phone format. Writes PNGs to e2e/screenshots for review.

const PHONE = { width: 390, height: 844 }
const SECTIONS = [
  'household', 'agenda', 'chores', 'routines', 'shopping',
  'recipes', 'ghost', 'devices', 'photos', 'week', 'display', 'calm', 'ai',
]

// Deep-link straight to each section via ?tab=<id> (these ids match the section
// ids in Operator.tsx). Robust against tab insertion/reorder — clicking by index
// silently captured the wrong panel once Guide became the first tab.
async function boot(page: Page, id: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto(`/settings?tab=${id}`)
  await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

SECTIONS.forEach((id) => {
  test(`settings-${id}`, async ({ page }) => {
    await boot(page, id)
    await page.waitForTimeout(300)
    // fullPage so the whole section shows — several run taller than the phone
    // viewport (shopping = postal + store filter, ghost = manage + candidates +
    // add-staple, household = member list + form) and were being cut off.
    await page.screenshot({ path: `e2e/screenshots/settings-${id}-phone.png`, fullPage: true })
  })
})
