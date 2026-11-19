import { test, expect, type Page } from '@playwright/test'
import { APP, settle, isApi, expectApi } from './interact'
import { BOARD, mockApi, seedState, type Audience, type Lang } from './mocks'
import { boxOf, settled } from './measure'
import { test as test4 } from './fixtures'

// JOURNEY — LA LISTE (review #43; was interactions-list.spec.ts + liste-advanced.spec.ts + liste-swipe-delete.spec.ts + quickadd-remove.spec.ts + aisle-sort.spec.ts + list-row-fit.spec.ts + delete-confirm.spec.ts).
//
// Interaction coverage, the shared list. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

// ──────────────────────────── shared list ──────────────────────────────

// One active list: a check is a MARK (the row stays, struck through via
// .list-row__main.done) until "Clear checked" removes the ticked ones. Past /
// predicted re-adds live behind the ⚡ Quick add panel. The row CENTRE (the name)
// toggles the check — same handler as the far-right disc (the in-store gesture);
// the PICTURE opens the edit scene (compact-rows pass: no always-on pencil; the
// per-item deals lookup moved inside that scene).
test.describe('interactions-list', () => {
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
      // « Mon ordre » reorder was drag-only (PARITY.md ¹³): a mouse can drag, a
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
})

// ── folded from journey-list.spec.ts ──────────────────────────────────────────────
test.describe('liste-advanced', () => {
  // « La liste » wears two faces, one device flag (src/lib/listeMode) — the same shape
  // as « Les notes », through the same shared ModeToggle:
  //
  //   SIMPLE (the default) — the shopping face. A row is a picture, a name and a
  //     check. A press-and-hold opens the shared PEEK (deal, aisle, who added it) with
  //     « Modifier » inside it; the picture's tap opens the flyer
  //     clipping full-screen with the deal spelled out under it.
  //   AVANCÉ — the ✏️/🗑 come back on every row. Not decoration: a long-press is
  //     invisible to a mouse and unreachable from a keyboard, so this IS the
  //     non-touch door to editing (CLAUDE.md: never leave a touch gesture as the
  //     only path to an action).
  //
  // Guards the four moves of that pass, and that the default face doesn't quietly
  // grow its furniture back.

  // A 1×1 png, so a clipping actually renders in the harness.
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  /** The board fixture with a real image on the first item's staged deal. */
  function boardWithClipping(opts: { validTo?: string | undefined } = {}) {
    const board = JSON.parse(JSON.stringify(BOARD))
    const item = board.list[0]
    const d = JSON.parse(item.deal_json)
    d.image = PNG
    if (opts.validTo !== undefined) d.validTo = opts.validTo
    item.deal_json = JSON.stringify(d)
    return board
  }

  async function openListe(page: Page, opts: { clipping?: boolean; validTo?: string } = {}) {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(
      page,
      opts.clipping ? { overrides: { board: boardWithClipping({ validTo: opts.validTo }) } } : {},
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/liste')
    await page.locator('.list-row').first().waitFor()
  }

  test('the circulaires shortcut is the loud one of the three', async ({ page }) => {
    await openListe(page)
    const flyer = page.locator('.list-actions__icon--flyer')
    await expect(flyer).toBeVisible()

    const sizes = await page.evaluate(() => {
      const w = (sel: string) => Math.round(document.querySelector(sel)!.getBoundingClientRect().width)
      return { flyer: w('.list-actions__icon--flyer'), quiet: w('.list-actions__icon.btn--ghost') }
    })
    // Bigger target than the quiet shortcuts beside it.
    expect(sizes.flyer).toBeGreaterThan(sizes.quiet)

    // …and it carries a real background rather than the ghost's transparency, which is
    // what "orange" has to mean in a test that can't judge a hue.
    const bg = await flyer.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(bg).not.toBe('transparent')
  })

  test('« Vider les cochés » spans the width on a phone', async ({ page }) => {
    await openListe(page)
    // It only exists once something is ticked — that is the point of the control.
    await expect(page.locator('.list-clear')).toHaveCount(0)
    await page.locator('.list-row__toggle').first().click()

    const bar = page.locator('.list-clear .btn')
    await bar.waitFor()
    const m = await page.evaluate(() => {
      const b = document.querySelector('.list-clear .btn') as HTMLElement
      const wrap = document.querySelector('.list-clear') as HTMLElement
      return { btn: b.getBoundingClientRect().width, wrap: wrap.getBoundingClientRect().width }
    })
    // Full width, not a small chip tucked to the right.
    expect(m.btn).toBeGreaterThan(m.wrap * 0.95)
  })

  test('tapping a clipping zooms the picture and names the deal under it', async ({ page }) => {
    await openListe(page, { clipping: true })

    const thumb = page.locator('.list-row__img--zoom img').first()
    await expect(thumb).toBeVisible()
    await thumb.click()

    await expect(page.locator('.zoom-overlay')).toBeVisible()
    // The whole reason the caption exists: « est-ce encore l'aubaine ? » answered
    // without leaving the list — the item, the store, the price, and (cashier-peek
    // parity) the flyer product's own name.
    const cap = page.locator('.zoom-overlay__cap')
    await expect(cap).toContainText('Super C')
    await expect(cap).toContainText('4,99')
    await expect(cap).toContainText('Lait 2% 4L')

    // The caption must not eat the backdrop tap that closes the viewer.
    await expect(cap).toHaveCSS('pointer-events', 'none')
  })

  test('an ended deal is flagged on the row, and the zoom caption says it loud', async ({ page }) => {
    // validTo well in the past → dealEnded. The fixture's default deal has no
    // validTo (never flagged — unknown ≠ ended), which the base test above covers.
    await openListe(page, { clipping: true, validTo: '2020-01-05' })

    // The quick « ! » indicator, readable while scanning the list itself.
    const warn = page.locator('.list-row__deal-ended').first()
    await expect(warn).toBeVisible()
    await expect(warn).toContainText('Aubaine terminée')

    // …and the zoomed clipping spells it out with the date it ran to.
    await page.locator('.list-row__img--zoom img').first().click()
    const cap = page.locator('.zoom-overlay__cap')
    await expect(cap.locator('.zoom-cap__ended')).toContainText('Aubaine terminée')
    await expect(cap).toContainText('janv.')
  })

  test('a live deal shows no ended flag', async ({ page }) => {
    // A validTo far in the future must NOT trip the warning.
    await openListe(page, { clipping: true, validTo: '2099-12-31' })
    await expect(page.locator('.list-row__deal-ended')).toHaveCount(0)
  })

  test('press and hold a row opens the peek; « Modifier » inside it opens the editor', async ({ page }) => {
    await openListe(page)
    const row = page.locator('.list-row').first()
    const box = await boxOf(row)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2

    await page.mouse.move(x, y)
    await page.mouse.down()
    // LONG_PRESS_MS is 500; hold past it without travelling (travel aborts the hold).
    await page.waitForTimeout(750)
    await page.mouse.up()

    // In a shop the hold answers « est-ce encore l'aubaine ? / quelle allée ? / qui
    // l'a mis ? » without leaving the list — the editor is one tap further, inside.
    const peek = page.locator('.detail-sheet')
    await expect(peek).toBeVisible()
    // Cashier-peek parity: the staged deal's own product name and store · price
    // are spelled out in the peek, not just the row's short chip.
    await expect(peek).toContainText('Lait 2% 4L')
    await expect(peek).toContainText('Super C')
    await peek.getByRole('button', { name: /Modifier l’article/ }).click()
    await expect(page).toHaveURL(/\/liste\/item\//)
  })

  test('AVANCÉ is the non-touch door: it puts ✏️/🗑 back on every row', async ({ page }) => {
    await openListe(page)
    // Simple: rows carry no action furniture at all.
    await expect(page.locator('.list-row__acts')).toHaveCount(0)

    const toggle = page.locator('.mode-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const rows = await page.locator('.list-row').count()
    expect(await page.locator('.list-row__acts').count()).toBe(rows)

    // A plain CLICK on the edit button opens the item — the mouse/keyboard path that
    // the long-press alone would not give.
    await page.locator('.list-row__acts button').first().click()
    await expect(page).toHaveURL(/\/liste\/item\//)
  })

  test('the mode is device-local, so it survives a reload', async ({ page }) => {
    await openListe(page)
    await page.locator('.mode-toggle').click()
    await expect(page.locator('.list-row__acts').first()).toBeVisible()

    await page.reload()
    await page.locator('.list-row').first().waitFor()
    await expect(page.locator('.mode-toggle')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.list-row__acts').first()).toBeVisible()
  })
})


// ── folded from journey-list.spec.ts ──────────────────────────────────────────────
test.describe('liste-swipe-delete', () => {
  // Swipe-left delete on La liste, END TO END — the guard for « I swipe and the items
  // always come back » (2026-10-06, round four of this bug, and the first round whose
  // cause was ever observable in a test).
  //
  // Why no spec could catch it before: the mock answered every `DELETE /api/list`
  // with a bare ok while KEEPING the row, so the refetched board frame always still
  // contained what was just deleted — any spec asserting « swiped means gone past the
  // refetch » would have been red against a mock, not the app. The mock now removes
  // the row (like the server), and THIS spec holds the whole visible contract:
  //
  //   swipe → the row hides at once + the undo toast offers « Annuler »
  //         → the held DELETE fires after the undo window, carrying the row's id alone
  //           (its real id, minted on the device since review #39; a delete that
  //           matches nothing is a 404, never the « ok » that once hid six lost deletes)
  //         → the next refetched frame does not resurrect the row.
  //
  // Raw TouchEvents, like pull-to-refresh.spec.ts: Playwright's touchscreen only
  // taps, and useSwipeToDelete listens for exactly these.
  const PHONE = { width: 390, height: 780 }

  // A flat leftward swipe on `sel` — |dy| stays 0 so the hook's vertical-biased axis
  // lock arms horizontal, and the travel clears max(90px, 35% of the row's width).
  async function swipeLeft(page: Page, sel: string, dx = -220) {
    await page.evaluate(
      ([selector, travel]) => {
        const el = document.querySelector(selector as string) as HTMLElement
        if (!el) throw new Error(`no element for ${selector}`)
        const rect = el.getBoundingClientRect()
        const x0 = rect.left + rect.width * 0.8
        const y0 = rect.top + rect.height / 2
        const touch = (x: number, y: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
        const fire = (type: string, x: number, y: number) => {
          const t = touch(x, y)
          el.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches: type === 'touchend' ? [] : [t],
              targetTouches: type === 'touchend' ? [] : [t],
              changedTouches: [t],
            }),
          )
        }
        fire('touchstart', x0, y0)
        for (let i = 1; i <= 6; i++) fire('touchmove', x0 + ((travel as number) * i) / 6, y0)
        fire('touchend', x0 + (travel as number), y0)
      },
      [sel, dx] as const,
    )
  }

  const ROW = '.list-row[data-item-id="l2"]' // « Pain », a plain fixture row

  test.describe('swipe-delete on La liste', () => {
    test.use({ viewport: PHONE, hasTouch: true })

    test.beforeEach(async ({ page }) => {
      // reducedMotion makes the slide-out call onDelete synchronously — the gesture
      // contract is the same, without 300 ms animation waits in every assertion.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { surface: 'mobile' })
      await page.goto('/liste')
      await page.waitForSelector('.list-rows')
    })

    test('a swiped row dies for real: hidden at once, deleted on commit, still gone past the refetch', async ({ page }) => {
      await expect(page.locator(ROW)).toBeVisible()

      const [req] = await Promise.all([
        // The DELETE is held behind the undo toast (15 s, toast.tsx DEFAULT_UNDO_MS).
        page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/list'), { timeout: 20_000 }),
        swipeLeft(page, `${ROW} .list-row__main`),
        // The row hides immediately and the undo toast offers the way back.
        expect(page.locator(ROW)).toBeHidden(),
        expect(page.locator('.undo-toast')).toBeVisible(),
      ])

      // The write names the row by its id and nothing else (review #39): the id is the row's real
      // one even for a line added a moment ago (lib/rowId), so there is no text-matched « heal ».
      const body = JSON.parse(req.postData() || '{}')
      expect(body).toEqual({ id: 'l2' })

      // The resurrection check: a frame fetched AFTER the delete landed must not
      // repaint the row (the deferred removal un-hides once the scope is fresh — if
      // the frame still contained l2, « Pain » would come straight back here).
      await page.waitForResponse((r) => r.url().includes('/api/board') && r.request().method() === 'GET', { timeout: 20_000 })
      await settled(page)
      await expect(page.locator(ROW)).toHaveCount(0)
      await expect(page.locator('.list-rows')).not.toContainText('Pain')
    })

    test('« Annuler » brings the row back and the DELETE never fires', async ({ page }) => {
      let deletes = 0
      page.on('request', (r) => {
        if (r.method() === 'DELETE' && r.url().includes('/api/list')) deletes++
      })

      await swipeLeft(page, `${ROW} .list-row__main`)
      await expect(page.locator(ROW)).toBeHidden()
      await page.locator('.undo-toast').getByRole('button', { name: 'Annuler' }).click()

      // Back at once — the held write was cancelled, nothing reached the network.
      await expect(page.locator(ROW)).toBeVisible()
      // Outlive the undo window (15 s) to prove the cancelled commit stays cancelled.
      await page.waitForTimeout(17_000)
      expect(deletes, 'an undone delete must never fire').toBe(0)
      await expect(page.locator(ROW)).toBeVisible()
    })

    // « Vider les cochés » is the batch twin. The request names exactly the lines ticked at the
    // gesture (a tick made after the undo toast is not swept up), and the cleared line must stay
    // gone past the refetch — the mock removes it like the server does.
    test('« Vider les cochés » names what it clears and the line stays gone past the refetch', async ({ page }) => {
      await expect(page.locator(ROW)).toBeVisible()
      await page.locator(ROW + ' .list-row__toggle').click()
      await expect(page.locator(ROW + ' .list-row__main.done')).toBeVisible()

      const [req] = await Promise.all([
        page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/api/list') && (r.postData() ?? '').includes('clearChecked'), {
          timeout: 20_000,
        }),
        page.getByRole('button', { name: /Vider les cochés/ }).click(),
        expect(page.locator(ROW)).toBeHidden(),
      ])
      const body = JSON.parse(req.postData() || '{}')
      expect(body).toEqual({ clearChecked: true, ids: ['l2'] })

      await page.waitForResponse((r) => r.url().includes('/api/board') && r.request().method() === 'GET', { timeout: 20_000 })
      await settled(page)
      await expect(page.locator(ROW)).toHaveCount(0)
    })
  })
})


// ── folded from journey-list.spec.ts ──────────────────────────────────────────────
test4.describe('quickadd-remove', () => {
  // Removing a quick-add suggestion used to be swipe-left ONLY (useSwipeToDelete binds
  // touch events), so on a desktop — mouse or keyboard — there was no way to remove one
  // at all: the row's single button is the *add* action. The row now carries the shared
  // <RowActions> delete, the same mirror La liste's edit sheet gives its swipe.
  //
  // Both widths: a phone (where the swipe still exists) and a desktop (where it never did).
  const PHONE = { width: 390, height: 844 }
  const DESKTOP = { width: 1280, height: 900 }

  test4('a quick-add suggestion can be removed with a mouse (not just a swipe)', async ({ page, app }) => {
    await app.boot({ viewport: DESKTOP, state: { calm: true }, route: '/liste/quick', wait: '.qa__row' })
    const rows = page.locator('.qa__row')
    const before = await rows.count()
    expect(before).toBeGreaterThan(0)

    // The delete is a real, labelled button — reachable by mouse AND by keyboard.
    const del = rows.first().getByRole('button', { name: /Retirer .* des suggestions/ })
    await expect(del).toBeVisible()
    await del.click()

    // Deferred removal: the row hides now, the write waits behind the undo toast.
    await expect(rows).toHaveCount(before - 1)
  })

  test4('the quick-add delete is keyboard reachable', async ({ page, app }) => {
    await app.boot({ viewport: DESKTOP, state: { calm: true }, route: '/liste/quick', wait: '.qa__row' })
    const del = page.locator('.qa__row').first().getByRole('button', { name: /Retirer .* des suggestions/ })
    await del.focus()
    await expect(del).toBeFocused()
  })

  // The swipe pane (`.list-row__del`) is absolutely positioned over the whole row and
  // only opacity:0 at rest, so without `pointer-events:none` it silently swallows clicks
  // on every sibling that isn't the z-index:1 `.list-row__main` — it used to eat both the
  // aisle picker and the delete button above.
  test4('the invisible swipe pane does not swallow clicks on the rest of the row', async ({ page, app }) => {
    await app.boot({ viewport: DESKTOP, state: { calm: true }, route: '/liste/quick', wait: '.qa__row' })
    const hits = await page.locator('.qa__row').first().evaluate((row) => {
      const at = (sel: string) => {
        const el = row.querySelector(sel) as HTMLElement
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        // The real target, or a glyph inside it — never the pane.
        return el.contains(hit) ? 'self' : (hit as HTMLElement)?.className
      }
      return { aisle: at('.qa__aisle'), del: at('.row-actions__btn') }
    })
    expect(hits).toEqual({ aisle: 'self', del: 'self' })
  })

  // The compact aisle picker is an emoji pip with a REAL <select> laid transparent over
  // it. The two halves are joined by a class name only, so a typo (the select rendered
  // `aisle-pick__sel` while the CSS styled `.aisle-pip__sel`) drops every rule at once:
  // the native box reappears, opaque, on top of the pip and spills out of the row. Assert
  // the collapsed face is what actually paints — the pip's emoji, not a labelled box.
  test4('the quick-add aisle picker collapses to a transparent pip, not a native select', async ({ page, app }) => {
    await app.boot({ viewport: DESKTOP, state: { calm: true }, route: '/liste/quick', wait: '.qa__row' })
    const pip = page.locator('.aisle-pip').first()
    await expect(pip).toBeVisible()
    const sel = page.locator('.aisle-pip__sel').first()
    expect(await sel.evaluate((e) => getComputedStyle(e).opacity), 'the select must not paint').toBe('0')
    // …but it is still a real control: it covers the pip (tappable) and takes focus.
    const [selBox, pipBox] = [await sel.boundingBox(), await pip.boundingBox()]
    expect(selBox!.width).toBeGreaterThan(pipBox!.width * 0.8)
    expect(await sel.evaluate((e) => (e as HTMLSelectElement).disabled)).toBe(false)
  })

  test4('the quick-add row does not overflow a phone once it carries a delete', async ({ page, app }) => {
    await app.boot({ viewport: PHONE, state: { calm: true }, route: '/liste/quick', wait: '.qa__row' })
    // Per-child bounds check, not scrollWidth: the ancestors set overflow-x:hidden, so a
    // too-wide row is CLIPPED rather than reported (see CLAUDE.md ▸ Horizontal overflow).
    const overflow = await page.locator('.qa__row').first().evaluate((row) => {
      const right = row.getBoundingClientRect().right
      return Array.from(row.querySelectorAll('*'))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => el.getBoundingClientRect().right - right)
        .filter((d) => d > 1)
    })
    expect(overflow, 'no child may bleed past the row’s right edge').toEqual([])
  })
})


// ── folded from journey-list.spec.ts ──────────────────────────────────────────────
test.describe('aisle-sort', () => {
  // Aisle sort (« Par allée ») — closes the §1 P1 gap: a core, logic-heavy list feature
  // (the emoji→aisle classifier + the household's saved aisle order + per-item overrides)
  // that shipped with ZERO e2e. Frontend-only harness, same as interactions-*.spec.ts:
  // Vite + stubbed /api/**. The seeded list (Lait / Pain / Pommes / Couches) spans several
  // aisles, so « Par allée » produces more than one group header.
  //
  // The whole choice now lives behind ONE button, « Allées » (an ActionMenu beside
  // Circulaires / Déjà acheté): the list itself carries no permanent sort bar, and a
  // row prints its aisle only when the menu's toggle asks for it. So every case here
  // starts by opening that menu — which is also what pins it: if the menu stops
  // opening, or a row moves out of it, these fail.

  const APP = (path: string, audience: Audience = 'parent', lang: Lang = 'fr') =>
    async (page: Page) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience, lang, calm: true })
      await page.goto(path)
    }

  async function settle(page: Page, ready: string) {
    await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  // The menu closes on every pick, so each choice reopens it.
  const openAisles = (page: Page) => page.getByRole('button', { name: 'Allées', exact: true }).click()

  test.describe('list aisle sort', () => {
    test.beforeEach(async ({ page }) => {
      await APP('/liste')(page)
      await settle(page, '.today-feed')
    })

    test('the « Allées » menu holds the order, and says which one is on', async ({ page }) => {
      const rows = page.locator('.today-feed > .list-rows > .list-row')
      await expect(rows).toHaveCount(4)

      // Default = « Mon ordre »: no group headers, and no per-row aisle tag either —
      // the tag is opt-in, so the row spends its width on the item's own name.
      await expect(page.locator('.list-aisle')).toHaveCount(0)
      await expect(page.locator('.list-row__aisle')).toHaveCount(0)

      // The menu carries the choice AND its state (a ✓ / aria-checked on the row in force).
      await openAisles(page)
      await expect(page.getByRole('menuitemradio', { name: 'Mon ordre' })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('menuitemradio', { name: 'Par allée' })).toHaveAttribute('aria-checked', 'false')

      // Flip to « Par allée »: grouped under aisle headers, every row still present
      // (regroup, not drop), and the per-row tag stays off — the headers say it.
      await page.getByRole('menuitemradio', { name: 'Par allée' }).click()
      await expect(page.locator('.list-aisle').first()).toBeVisible()
      expect(await page.locator('.list-aisle').count()).toBeGreaterThan(1)
      await expect(page.locator('.list-row__aisle')).toHaveCount(0)
      await expect(rows).toHaveCount(4)

      // And the menu now says « Par allée » is the one in force.
      await openAisles(page)
      await expect(page.getByRole('menuitemradio', { name: 'Par allée' })).toHaveAttribute('aria-checked', 'true')
    })

    test('the aisle tag is a toggle in the menu — off, then on, without regrouping', async ({ page }) => {
      await expect(page.locator('.list-row__aisle')).toHaveCount(0)

      await openAisles(page)
      const tags = page.getByRole('menuitemcheckbox', { name: /l’allée de chaque article/ })
      await expect(tags).toHaveAttribute('aria-checked', 'false')
      await tags.click()

      // Every row prints its aisle now — and the list is NOT regrouped (still Mon ordre).
      await expect(page.locator('.list-row__aisle').first()).toBeVisible()
      await expect(page.locator('.list-aisle')).toHaveCount(0)

      // Off again from the same row.
      await openAisles(page)
      await page.getByRole('menuitemcheckbox', { name: /l’allée de chaque article/ }).click()
      await expect(page.locator('.list-row__aisle')).toHaveCount(0)
    })

    test('the per-device sort choice persists across a reload', async ({ page }) => {
      await openAisles(page)
      await page.getByRole('menuitemradio', { name: 'Par allée' }).click()
      await expect(page.locator('.list-aisle').first()).toBeVisible()
      await page.reload()
      await settle(page, '.today-feed')
      // Remembered via localStorage (LIST_SORT_KEY) — still grouped after the reload.
      await expect(page.locator('.list-aisle').first()).toBeVisible()
    })
  })
})


// ── folded from journey-list.spec.ts ──────────────────────────────────────────────
test.describe('list-row-fit', () => {
  // A LIST ROW'S CHIPS STAY INSIDE THE NAME COLUMN — at every text scale.
  //
  // The deal chip (« Super C · 4,99 $ ») painted straight under the check disc. The
  // chips were already `nowrap` + `min-width: 0` + `text-overflow: ellipsis`, and
  // `.list-row__meta` already carried `overflow: hidden` with a comment saying this
  // exact bug had been fixed once. It had not: `min-width: 0` let the meta SHRINK and
  // nothing stopped it GROWING, so at 130% on a 360px phone the name column was 129px
  // and the meta laid out at 184 — the clip dutifully bounded its children to a box
  // that was itself 55px past the column.
  //
  // It was reachable at the SHIPPED 115% step too (360px: 7px of clearance became 18px
  // of overlap), so this is not a 130%-only guard.
  //
  // WHY IT MEASURES BOXES AND NOT PIXELS: a screenshot showed the symptom and could not
  // say which box was wrong — and `getBoundingClientRect()` on the chip is no better,
  // because it reports the layout box that `overflow: hidden` is visually clipping. The
  // question that has one answer is "is the meta wider than the column it lives in?".
  const SCALES = ['normal', 'large', 'x-large'] as const

  for (const scale of SCALES) {
    for (const width of [390, 360]) {
      test(`a list row's chips stay inside the name column — ${scale} @${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await mockApi(page)
        await seedState(page, { theme: 'day', lang: 'fr', surface: 'mobile', textScale: scale })
        await page.goto('/liste')
        const row = page.locator('.list-row').first()
        await expect(row).toBeVisible()
        // The seeded list carries a staged deal on its first row — the widest chip the
        // surface can draw, and the one that was overflowing. If this stops being true
        // the assertion below silently guards nothing, so check it.
        await expect(row.locator('.list-row__deal')).toBeVisible()

        const fit = await row.evaluate((r) => {
          const name = r.querySelector('.list-row__name')
          const meta = r.querySelector('.list-row__meta')
          if (!name || !meta) return null
          return {
            nameW: Math.round(name.getBoundingClientRect().width),
            metaW: Math.round(meta.getBoundingClientRect().width),
          }
        })
        expect(fit, 'the row must still have a name column and a meta line').not.toBeNull()
        expect(
          fit!.metaW,
          `the chip line (${fit!.metaW}px) is wider than the name column it lives in ` +
            `(${fit!.nameW}px), so it paints under the check disc. ` +
            `.list-row__meta needs max-width: 100% — min-width: 0 only lets it shrink.`,
        ).toBeLessThanOrEqual(fit!.nameW)
      })
    }
  }
})


// ── folded from journey-list.spec.ts ──────────────────────────────────────────────
test.describe('delete-confirm', () => {
  // Destructive deletes that had NO confirm and NO undo now go through the shared
  // useConfirm dialog (REVIEW-PASS quick-win: guard accidental data loss). This drives
  // one representative site end-to-end — the list-item edit scene — proving the confirm
  // gates the delete: Cancel keeps the row, Confirm sends the DELETE.
  test.use({ hasTouch: true })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 860 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  })

  test('deleting a list item from the edit scene asks to confirm first', async ({ page }) => {
    await page.goto('/liste/item/l2') // « Pain », from the board fixture

    // Cancel path — the delete must NOT fire.
    let deletes = 0
    await page.route('**/api/list', (route) => {
      if (route.request().method() === 'DELETE') deletes++
      return route.fallback()
    })

    await page.getByRole('button', { name: 'Supprimer de la liste' }).click()
    const dialog = page.locator('.confirm')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    await expect(dialog).toBeHidden()
    expect(deletes).toBe(0)
    await expect(page).toHaveURL(/\/liste\/item\/l2/) // still on the scene

    // Confirm path — the DELETE fires.
    const del = page.waitForRequest((r) => r.url().includes('/api/list') && r.method() === 'DELETE')
    await page.getByRole('button', { name: 'Supprimer de la liste' }).click()
    await page.locator('.confirm').getByRole('button', { name: 'Supprimer', exact: true }).click()
    await del
  })
})
