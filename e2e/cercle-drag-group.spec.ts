import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { boxOf } from './measure'

// Dragging a person onto a named group in Maison ▸ Social/Famille — the last
// uncovered write in the cercle, and one whose failure modes are all silent:
//
//   · it writes the membership the drop implies (and only that one)
//   · « Annuler » writes the EXACT inverse. An undo that DELETEs a different body
//     leaves the person in the group while the toast says otherwise — the worst
//     shape of bug, because the screen agrees with you until the next poll.
//   · a person already in that group is not a drop target at all — and this one is
//     asserted on the CUE, not on the write. `canDrop` greys the zone out; the write
//     is ALSO refused by onDrop's own membership check, so a "nothing was posted"
//     assertion passes whether canDrop works or not. It did, with canDrop deleted —
//     the decoration this file's house rule exists to catch. What canDrop alone owns
//     is the highlight (lib/dnd: "also greys the zone out so it never shows a drop cue
//     it won't honour"), so that is what is measured, with the allowed drag as the
//     control so the assertion can't pass by the class never appearing at all.
//
// The drag is driven with the mouse on purpose. `usePointerDnd` here runs in classic
// mode (engage past a 6px threshold, no press-and-hold), and a desktop mouse is also
// the reachability half of the standing rule: a gesture no mouse can perform is a
// feature only a thumb has. Measurements go through `boxOf` (e2e/measure.ts), never a
// bare `boundingBox()!`.

interface Write {
  method: string
  path: string
  body: Record<string, unknown>
}

async function boot(page: Page, section = 'social'): Promise<Write[]> {
  const writes: Write[] = []
  // Wide enough that a person row and the group below it are on screen together —
  // the drag needs both without an intervening scroll.
  await page.setViewportSize({ width: 900, height: 1400 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\//, '')
    const method = route.request().method()
    if (method !== 'GET' && path === 'cercle-groups') {
      writes.push({ method, path, body: JSON.parse(route.request().postData() || '{}') })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(`/maison?section=${section}`)
  await page.locator('.cercle-row').first().waitFor({ state: 'visible', timeout: 15_000 })
  return writes
}

// The row is found by what it SHOWS, which for Luc Bélanger is his nickname « Voisin »
// — and a loose 'Luc' also matches Pierre-Luc Caron, who is already in the hockey
// group, so the drag silently became the refusal case and posted nothing.
async function dragToGroup(
  page: Page,
  personName: string,
  groupId: string,
  whileOver?: () => Promise<void>,
) {
  const grip = page.locator('.cercle-row', { hasText: personName }).first().locator('.dnd-grip').first()
  const zone = page.locator(`[data-dnd-zone="group:${groupId}"]`)
  await expect(zone).toBeVisible()
  const from = await boxOf(grip)
  const to = await boxOf(zone)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  // Clear the engage threshold first, then land inside the group's own box.
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(40, to.height / 2), { steps: 8 })
  await whileOver?.()
  await page.mouse.up()
}

test('dropping a person on a group adds them to it', async ({ page }) => {
  const writes = await boot(page)
  await dragToGroup(page, 'Voisin', 'g2')

  await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)
  expect(writes[0]).toMatchObject({
    method: 'POST',
    body: { groupId: 'g2', personId: 'c6', personKind: 'contact' },
  })
})

test('…and « Annuler » writes the exact inverse', async ({ page }) => {
  const writes = await boot(page)
  await dragToGroup(page, 'Voisin', 'g2')
  await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)

  await expect(page.locator('.undo-toast')).toBeVisible()
  await expect(page.locator('.undo-toast')).toContainText('Le hockey')
  await page.locator('.undo-toast__btn').first().click()

  await expect.poll(() => writes.length, { timeout: 5000 }).toBe(2)
  // Same three fields, opposite verb — anything else and the person quietly stays in.
  expect(writes[1]).toEqual({ ...writes[0], method: 'DELETE' })
})

test('a group a person is ALREADY in never lights up as a target', async ({ page }) => {
  const writes = await boot(page)
  const zone = page.locator('[data-dnd-zone="group:g2"]')

  // The control first: an allowed drag DOES light the zone. Without this, the
  // assertion below would also pass if the cue simply never appeared for anyone.
  await dragToGroup(page, 'Voisin', 'g2', async () => {
    await expect(zone, 'the control: an allowed drop is cued').toHaveClass(/dnd-over/)
  })
  await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)

  // Karim is one of « Le hockey »'s own members in the fixture: no cue, no write.
  await page.reload()
  await page.locator('.cercle-row').first().waitFor({ state: 'visible', timeout: 15_000 })
  await dragToGroup(page, 'Karim', 'g2', async () => {
    await expect(zone, 'a group he is already in offers no drop cue').not.toHaveClass(/dnd-over/)
  })
  await page.waitForTimeout(500)
  expect(writes.length, 'and the drop itself posts nothing').toBe(1)
})
