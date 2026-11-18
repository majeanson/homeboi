import { test, expect } from './fixtures'

// Review #34 (2026-11-18; Sam, keyboard + screen reader), each change approved by Marc:
//   · keyboard focus was invisible on « Bon matin » and anywhere a rule removed the outline;
//   · the locked toddler tablet could only be left by a FINGER held 3 s;
//   · the weather card was a role=button holding a real button (« Une autre image »);
//   · a row moved with ↑/↓ moved in silence.

test('« Bon matin » shows a ring when the keyboard reaches it', async ({ app, page }) => {
  await app.boot({ route: '/board', wait: '.greet__btn', clock: 'BASE' })
  await page.keyboard.press('Tab')
  await page.locator('.greet__btn').focus()
  await expect(page.locator('.greet__btn')).toHaveCSS('outline-style', 'solid')
})

test('the locked toddler tablet: holding Enter for 3 s opens the grown-up gate, releasing early disarms it', async ({ app, page }) => {
  await app.boot()
  await page.goto('/board?kid=1')
  const exit = page.locator('.kid-exit-switch')
  // A press arms the hold (the fill bar runs); releasing early disarms it.
  await exit.focus()
  await page.keyboard.down('Enter')
  await expect(exit).toHaveClass(/is-holding/)
  await page.keyboard.up('Enter')
  await expect(exit).not.toHaveClass(/is-holding/)
  await expect(page.locator('.kid-exit-modal')).toHaveCount(0)

  await exit.focus()
  await page.keyboard.down('Enter')
  await expect(page.locator('.kid-exit-modal')).toBeVisible({ timeout: 6000 })
  await page.keyboard.up('Enter')
})

test('the weather card is ONE named control; the ⟳ is its sibling, not inside it', async ({ app, page }) => {
  await app.boot({ route: '/board', wait: '.now-card--wx', clock: 'BASE' })
  const card = page.getByRole('button', { name: /^Voir la météo et l’image du jour — / })
  await expect(card).toBeVisible()
  await expect(card.locator('button')).toHaveCount(0)
})

test('a row moved with ↓ says where it landed', async ({ app, page }) => {
  await app.boot({ clock: 'BASE' })
  await page.goto('/settings?tab=display&sub=layout')
  const band = page.locator('.board-layout').first()
  await band.waitFor({ state: 'visible', timeout: 15_000 })
  const rows = band.locator('.board-layout__row')
  const total = await rows.count()
  const name = (await rows.first().locator('.board-layout__name').innerText()).trim()
  await rows.first().locator('.dnd-grip').focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('#sr-announce')).toHaveText(`${name}, position 2 sur ${total}`)
  await expect(page.locator('#sr-announce')).toHaveAttribute('aria-live', 'polite')
})
