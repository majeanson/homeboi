import { test, expect, type Page } from '@playwright/test'
import { APP, settle, isApi, expectApi } from './interact'

// Interaction coverage, the shared list. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

// ──────────────────────────── shared list ──────────────────────────────

// One active list: a check is a MARK (the row stays, struck through via
// .list-row__main.done) until "Clear checked" removes the ticked ones. Past /
// predicted re-adds live behind the ⚡ Quick add panel. The row CENTRE (the name)
// toggles the check — same handler as the far-right disc (the in-store gesture);
// the PICTURE opens the edit scene (compact-rows pass: no always-on pencil; the
// per-item deals lookup moved inside that scene).
const openList = (page: Page) => page.locator('.today-feed > .list-rows > .list-row')
const checkedRows = (page: Page) => page.locator('.list-row__main.done')
const checkOff = (row: ReturnType<Page['locator']>) => row.locator('.list-row__toggle').click()
const editRow = (row: ReturnType<Page['locator']>) => row.locator('.list-row__img').click()

test.describe('list', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.today-feed')
  })

  test('checking an item marks it in place (it stays) and patches the list', async ({ page }) => {
    const rows = openList(page)
    await expect(rows).toHaveCount(4)
    await expectApi(page, 'PATCH', 'list', () => checkOff(rows.first()))
    // A check is a mark, not a removal — the item STAYS, just struck through.
    await expect(rows).toHaveCount(4)
    await expect(checkedRows(page)).toHaveCount(1)
  })

  // The row CENTRE is the check too (shop seam #1): tapping the name toggles the
  // mark — the big target does the frequent in-store job; the editor now waits
  // behind the explicit ✏️ instead of ambushing a mis-aimed thumb.
  test('tapping the row centre (the name) toggles the check', async ({ page }) => {
    const rows = openList(page)
    await expectApi(page, 'PATCH', 'list', () => rows.first().locator('.list-row__name').click())
    await expect(checkedRows(page)).toHaveCount(1)
    // Same target unchecks — a mis-tap costs one more tap, never an edit scene.
    await rows.first().locator('.list-row__name').click()
    await expect(checkedRows(page)).toHaveCount(0)
  })

  // « Pas pressé »: an item we only buy on a good deal. ONE switch on the row's own
  // edit scene, off by default (an added item is always a real errand), written the
  // moment it's flipped. The row comes back to the list wearing its second class:
  // a faded card + a NAMED tag, never colour alone — and settled at the BOTTOM, out
  // of the way of the real errands.
  test('flagging an item « pas pressé » fades its row, names it, and sinks it', async ({ page }) => {
    const rows = openList(page)
    await expect(page.locator('.list-row--norush')).toHaveCount(0)
    // The ✏️ pencil opens the edit scene (the name/centre toggles the check now).
    const flagged = await rows.nth(1).locator('.title').innerText()
    await editRow(rows.nth(1))
    const chip = page.getByRole('button', { name: 'Pas pressé' })
    // Off by default — the scene asks nothing of an ordinary grocery line.
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await expectApi(page, 'PATCH', 'list', () => chip.click())
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Fermer' }).click()
    // Back on the list, the flag survives the board refetch — exactly one row, and
    // it's now the last one: an aubaine-only line never sits between two errands.
    await expect(page.locator('.list-row--norush')).toHaveCount(1)
    await expect(rows.last().locator('.list-row__norush')).toHaveText(/Pas pressé/)
    await expect(rows.last().locator('.title')).toHaveText(flagged)
  })

  // The same switch is the way back — a mis-tap costs one tap, not a delete + re-add.
  test('the « pas pressé » switch turns the flag back off', async ({ page }) => {
    const rows = openList(page)
    await editRow(rows.nth(1))
    const chip = page.getByRole('button', { name: 'Pas pressé' })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expectApi(page, 'PATCH', 'list', () => chip.click())
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.locator('.list-row--norush')).toHaveCount(0)
  })

  test('tapping a checked item again unchecks it', async ({ page }) => {
    const rows = openList(page)
    await checkOff(rows.first())
    await expect(checkedRows(page)).toHaveCount(1)
    await checkOff(rows.first())
    await expect(checkedRows(page)).toHaveCount(0)
  })

  test('clear checked removes the ticked items and leaves the rest', async ({ page }) => {
    const rows = openList(page)
    await checkOff(rows.first())
    const clear = page.getByRole('button', { name: /Vider les cochés/ })
    await expect(clear).toBeVisible()
    // Deferred behind the undo toast: the rows go at once, the PATCH lands later.
    await expectApi(page, 'PATCH', 'list', () => clear.click())
    await expect(rows).toHaveCount(3)
  })

  test('undo restores cleared items', async ({ page }) => {
    const rows = openList(page)
    await checkOff(rows.first())
    await page.getByRole('button', { name: /Vider les cochés/ }).click()
    await expect(rows).toHaveCount(3)
    await expect(page.locator('.undo-toast')).toBeVisible()
    await page.locator('.undo-toast__btn').click()
    // Back on the list, and still checked (undo restores the snapshot as-is).
    await expect(rows).toHaveCount(4)
    await expect(checkedRows(page)).toHaveCount(1)
  })

  test('a cleared item stays gone after the confirming board refetch', async ({ page }) => {
    const rows = openList(page)
    const firstText = (await rows.first().locator('.title').innerText()).trim()
    await checkOff(rows.first())
    await expectApi(page, 'PATCH', 'list', () =>
      page.getByRole('button', { name: /Vider les cochés/ }).click(),
    )
    await expect(rows).toHaveCount(3)
    await expect(rows.locator('.title', { hasText: firstText })).toHaveCount(0)
  })

  test('the add bar posts a new line straight to the list', async ({ page }) => {
    // The list add bar is the shared EditField (form.edit-field), and it has no
    // « Ajouter » button any more — Enter IS the commit (the lean pass). The mic stays,
    // so the box still has buttons; the SUBMIT is the keystroke.
    const bar = page.locator('.edit-field .input').first()
    await bar.fill('Bananes')
    await expectApi(page, 'POST', 'list', () => bar.press('Enter'))
  })

  test('the quick-add panel re-adds a past item and stays open', async ({ page }) => {
    await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: 'Ajout rapide' }).click() // scope to sheet (page has its own shortcut)
    const panel = page.locator('.scene')
    await expect(panel).toBeVisible()
    const chip = panel.locator('.qa__chip', { hasText: 'Beurre' })
    await expect(chip).toHaveCount(1)
    await expectApi(page, 'POST', 'list', () => chip.click())
    // The panel STAYS open (multi-add); the chip locks with a ✓ and a count shows.
    await expect(panel).toBeVisible()
    await expect(chip).toHaveClass(/is-added/)
    await expect(panel.locator('.qa__count')).toBeVisible()
  })

  test('quick-add re-adds an item with the flyer synonyms it last carried', async ({ page }) => {
    await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: 'Ajout rapide' }).click() // scope to sheet (page has its own shortcut)
    const chip = page.locator('.scene .qa__chip', { hasText: 'Beurre' })
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/list') && r.method() === 'POST'),
      chip.click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ text: 'Beurre', search_terms: ['beurre', 'butter'] })
  })

  test('a due-soon prediction shows in quick-add with a tag', async ({ page }) => {
    await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: 'Ajout rapide' }).click() // scope to sheet (page has its own shortcut)
    // Œufs is 'soon' in the ghost mock and not on the list → tagged in the panel.
    const oeufs = page.locator('.scene .qa__chip', { hasText: 'Œufs' })
    await expect(oeufs).toHaveCount(1)
    await expect(oeufs.locator('.qa__tag')).toBeVisible()
  })

  test('the flyer browser opens', async ({ page }) => {
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await expect(page.locator('.scene .deals-search')).toBeVisible()
  })

  test('a browsed deal LINKS onto the matching list item, not a new specific-named line', async ({ page }) => {
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await expect(page.locator('.deals-search')).toBeVisible()
    await page.locator('.deals-search input').fill('lait')
    await page.locator('.deals-search button[type="submit"]').click()
    await expect(page.locator('.deal').first()).toBeVisible()
    // "Lait" is already on the list, so the deal links onto that recurring line
    // (PATCH id l1) — it does NOT spawn a "Lait 2% 4L" duplicate. The item stays
    // generic; only the weekly deal riding on it changes.
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'list')),
      page.locator('.deal').first().getByRole('button', { name: /Ajouter à la liste/ }).click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'l1' })
    // …and the button says WHICH line it rode on: the flyer's product name is
    // nowhere on the list, so a bare ✓ reads as "nothing happened".
    await expect(page.locator('.deal').first().locator('.deal__choose')).toHaveText(/Lait/)
  })

  test('a browsed deal for a new item adds it under the SEARCHED name, not the product name', async ({ page }) => {
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.locator('.deals-search input').fill('fromage') // not on the list yet
    await page.locator('.deals-search button[type="submit"]').click()
    await expect(page.locator('.deal').first()).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'list')),
      page.locator('.deal').first().getByRole('button', { name: /Ajouter à la liste/ }).click(),
    ])
    // The new line is the generic thing searched ("fromage"), NOT the flyer's
    // "Lait 2% 4L" — so quick-add keeps suggesting the generic item next week.
    // `match: true` asks the server to re-run the same reuse-not-duplicate
    // decision before it inserts — the backstop for a cold cache / offline replay.
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ text: 'fromage', match: true })
  })

  test('a deal add fires ONE write however fast you tap — and the done button is inert', async ({ page }) => {
    // The double-tap bug: two taps = two concurrent adds racing to insert the
    // same line; the label could flip « Ajouté à la liste » → « Sur « fromage » »
    // depending on which answer landed last, and a later re-tap could re-CREATE a
    // line the household had just deleted. Now: writes for one name serialize
    // (lib/picks queuedByName), the caller answers a re-tap from memory, and the
    // done button goes inert with an honest « Ajouté » label.
    await page.locator('.add-fab').click()
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.locator('.deals-search input').fill('fromage') // not on the list yet
    await page.locator('.deals-search button[type="submit"]').click()
    await expect(page.locator('.deal').first()).toBeVisible()
    const listWrites: string[] = []
    page.on('request', (r) => {
      if ((r.method() === 'POST' || r.method() === 'PATCH') && /\/api\/list(\?|$)/.test(r.url()))
        listWrites.push(r.postData() ?? '')
    })
    const btn = page.locator('.deal').first().locator('.deal__choose')
    await btn.click({ clickCount: 2, delay: 30 }) // a fast double-tap
    // Honest done state: « Ajouté à la liste » (a NEW line), never the still-armed
    // verb, and never « Sur « fromage » » from the second tap's re-match.
    await expect(btn).toHaveText(/Ajouté à la liste/)
    // A third, later tap is inert — no re-run of the match, no resurrection.
    // (force: Playwright itself refuses an aria-disabled click, which is half the
    // proof; the forced tap proves the handler is gone too, not just the ARIA.)
    await btn.click({ force: true })
    // Proving the second tap wrote nothing: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(400)
    await expect(btn).toHaveText(/Ajouté à la liste/)
    expect(listWrites).toHaveLength(1)
  })

  test('the drag grip is a keyboard door too — ↑ on a focused grip PATCHes the new order', async ({ page }) => {
    // « Mon ordre » reorder was drag-only (ACTIONS.md ¹³): a mouse can drag, a
    // keyboard could not. The ⠿ grip is now focusable and ↑/↓ run the same
    // splice — Tab to the grip, arrow, and the order persists.
    const grips = page.locator('.list-row__grip')
    await expect(grips.first()).toBeVisible()
    const second = grips.nth(1)
    await second.focus()
    const [req] = await Promise.all([page.waitForRequest(isApi('PATCH', 'list')), second.press('ArrowUp')])
    const body = JSON.parse(req.postData() || '{}')
    // The second row moved to the front: a full-order reorder write, its id first.
    expect(Array.isArray(body.reorder)).toBe(true)
    expect(body.reorder[0]).toBe('l2')
  })

  test('a store-flyer add links the SPECIFIC product name onto the generic line', async ({ page }) => {
    // Browsing a whole store flyer has no search concept, so the add carries the
    // raw product name ("Lait 2% 4L"). The matcher must still land it on the
    // generic "Lait" line (whole-word containment) — before, every store-mode add
    // spawned a specific-named duplicate that lost the line's saved synonyms.
    await page.locator('.add-fab').click()
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await page.getByRole('tab', { name: /Par magasin/ }).click()
    await page.locator('.flyer-store', { hasText: 'Super C' }).click()
    await page.getByRole('tab', { name: /Offres/ }).click()
    await page.locator('.flyer-grid__cell').click()
    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'list')),
      page.locator('.flyer-detail__add').click(),
    ])
    const body = JSON.parse(req.postData() || '{}')
    expect(body).toMatchObject({ id: 'l1' })
    expect(body.deal?.name).toBe('Lait 2% 4L')
  })

  test('clearing a checked item drops its staged cashier deal', async ({ page }) => {
    // l1 (Lait) carries a staged deal → the cashier button shows with no mode to
    // switch into (the shopping tools are always available now).
    await expect(page.getByRole('button', { name: /Montrer à la caisse/ })).toBeVisible()
    // Tick Lait, then clear it → it leaves the list and so leaves the cashier set.
    await checkOff(openList(page).filter({ hasText: 'Lait' }))
    await expectApi(page, 'PATCH', 'list', () =>
      page.getByRole('button', { name: /Vider les cochés/ }).click(),
    )
    await expect(page.getByRole('button', { name: /Montrer à la caisse/ })).toHaveCount(0)
  })

  test('the by-store tab opens a store flyer without searching', async ({ page }) => {
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir/ }).click()
    await expect(page.locator('.deal-tabs')).toBeVisible()
    await page.getByRole('tab', { name: /Par magasin/ }).click()
    await expect(page.locator('.flyer-store')).toHaveCount(3)
    // Flyers are separated by date: this week's two + next week's IGA (future start),
    // each badged so you can open the upcoming one to prep next week.
    await expect(page.locator('.flyer-store__when--upcoming')).toHaveCount(1)
    await expect(page.locator('.flyer-store__when--upcoming')).toHaveText(/À venir/)
    await expect(
      page.locator('.flyer-store', { hasText: 'Super C' }).locator('.flyer-store__when--current'),
    ).toBeVisible()
    await page.locator('.flyer-store', { hasText: 'Super C' }).click()
    await expect(page.locator('.flyer-overlay')).toBeVisible()
    // The viewer now opens on the Plan reconstruction; switch to the gap-free "Offres"
    // grid — one clipping in the fixture.
    await page.getByRole('tab', { name: /Offres/ }).click()
    await expect(page.locator('.flyer-grid__cell')).toHaveCount(1)
    // The position-faithful page reconstruction lives behind the "Plan" tab. The
    // fixture flyer has 2 pages but only page 1 carries an item; the empty cover
    // page must be skipped, so exactly one page renders (no blank box).
    await page.getByRole('tab', { name: /Plan/ }).click()
    await expect(page.locator('.flyer-page-wrap')).toHaveCount(1)
    await expect(page.locator('.flyer-page-label')).toHaveText(/1/)
    // The "full flyer" link deep-links Flipp by id + merchant slug + postal.
    await expect(page.locator('.flyer-full-link')).toHaveAttribute(
      'href',
      'https://flipp.com/fr-ca/circulaire/5001-super-c-circulaire?postal_code=H2X1Y4',
    )
  })
})
