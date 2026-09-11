import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'

// THE DOOR SWEEP — what a TAP (or a HOLD) does, per surface.
//
// The state matrix photographs 140-odd states and could not see either of the two
// bugs a phone found on 2026-09-10: a meal tap on the day scene that renamed instead
// of opening the recipe, and a snack that would not drag. Both were gestures. A
// screenshot shows neither. This spec walks the doors ACTIONS.md lists as « ✅ tap »
// / « ✅ hold » on the surfaces a household uses most, performs the gesture, and
// asserts that SOMETHING observable happened — the URL moved, a sheet or scene
// opened, a field took focus, a state flipped. Not the door's content (the feature
// specs own that): only that the door still opens. A row whose tap does nothing is
// exactly the regression that reads as "fine" in every screenshot.
//
// Adding a door: one row in DOORS — route, the gesture, the proof. Keep the proof
// the cheapest observable fact; the feature spec goes deeper.

const HOLD_MS = 900 // > the long-press arm time (lib/useLongPress), same idea as board-edit.spec

interface Door {
  name: string
  route: string
  /** Freeze the clock at BASE (fixtures dated around MMID). */
  clock?: boolean
  ready: string // a selector that means "the surface rendered"
  /** Extra route stubs, registered AFTER mockApi so they win (a surface whose
   *  default fixture is empty needs one row to have a door). */
  fixture?: (page: Page) => Promise<void>
  act: (page: Page) => Promise<void>
  proof: (page: Page) => Promise<void>
}

// The shared mock serves no family notes; the notes door needs one row.
const NOTE = {
  id: 'dn1',
  member_id: null,
  author_member_id: null,
  title: 'Couture',
  text: 'Ourlet du pantalon de Léa',
  media_kind: null,
  media_key: null,
  scene_key: null,
  position: 0,
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
}

const hold = async (page: Page, sel: ReturnType<Page['locator']>) => {
  const b = await sel.boundingBox()
  if (!b) throw new Error('hold target not measurable')
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS)
  await page.mouse.up()
}

const DOORS: Door[] = [
  {
    name: 'board · an event row → its peek',
    route: '/board',
    ready: '.board-grid .wg-slot',
    act: (p) => p.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click(),
    proof: (p) => expect(p.locator('.detail-sheet')).toBeVisible(),
  },
  {
    name: 'board · a todo name → inline edit (a field takes focus)',
    route: '/board',
    ready: '.board-grid .wg-slot',
    act: async (p) => {
      const todos = p.locator('.wg-slot[data-card="todos"]')
      await todos.scrollIntoViewIfNeeded()
      await todos.locator('.todo-row', { hasText: 'Clés + téléphone + portefeuille' }).locator('.todo-row__name').click()
    },
    proof: (p) => expect(p.locator('input:focus, textarea:focus')).toHaveCount(1),
  },
  {
    name: 'cuisine · the week grid meal → its recipe',
    route: '/kitchen',
    clock: true,
    ready: '.kitchen__day',
    act: (p) => p.locator('.kitchen__day').first().locator('.kitchen__day-meal', { hasText: 'Spaghetti maison' }).click(),
    proof: (p) => expect(p).toHaveURL(/\/kitchen\/recipe\/rc1$/),
  },
  {
    name: 'cuisine · the day scene meal → its recipe (the 2026-09-10 phone bug)',
    route: `/kitchen/day/${MMID}?vue=repas`,
    clock: true,
    ready: '.kitchen__meal-row',
    act: (p) => p.locator('.kitchen__meal-row', { hasText: 'Spaghetti maison' }).locator('.kitchen__meal-main').click(),
    proof: (p) => expect(p).toHaveURL(/\/kitchen\/recipe\/rc1$/),
  },
  {
    name: 'liste · a plain row picture → the item scene',
    route: '/liste',
    ready: '.list-row',
    act: (p) => p.locator('.list-row', { hasText: 'Pain' }).locator('button.list-row__img').click(),
    proof: (p) => expect(p.locator('.scene .li-edit')).toBeVisible(),
  },
  {
    name: 'liste · the row centre → checked (a toggle, in place)',
    route: '/liste',
    ready: '.list-row',
    act: (p) => p.locator('.list-row', { hasText: 'Lait' }).first().locator('.list-row__name').click(),
    proof: (p) => expect(p.locator('.list-row', { hasText: 'Lait' }).first().locator('.list-row__name')).toHaveAttribute('aria-pressed', 'true'),
  },
  {
    name: 'liste · HOLD a row → its peek',
    route: '/liste',
    ready: '.list-row',
    act: (p) => hold(p, p.locator('.list-row', { hasText: 'Pommes' }).first().locator('.list-row__name')),
    proof: (p) => expect(p.locator('.detail-sheet')).toBeVisible(),
  },
  {
    name: 'notes · a note row → the editor',
    route: '/notes',
    ready: '.cnote-list .cnote',
    fixture: async (p) => {
      await p.route('**/api/family-notes**', async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
      })
    },
    act: (p) => p.locator('.cnote-list .cnote', { hasText: 'Couture' }).locator('.cnote__main').click(),
    proof: (p) => expect(p.locator('.note-editor')).toBeVisible(),
  },
  {
    name: 'caisse · a tile → the proof card',
    route: '/liste/cashier',
    ready: '.cashier__tile',
    act: (p) => p.locator('.cashier__tile').first().click(),
    proof: (p) => expect(p.locator('.bigcard')).toBeVisible(),
  },
]

for (const door of DOORS) {
  test(door.name, async ({ page }) => {
    if (door.clock) await page.clock.setFixedTime(new Date(BASE * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    if (door.fixture) await door.fixture(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(door.route)
    await page.locator(door.ready).first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => {})
    await door.act(page)
    await door.proof(page)
  })
}
