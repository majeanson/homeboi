import { type Request, type Page, test as test2, test as test4 } from '@playwright/test'
import { test, expect, type App } from './fixtures'
import { BASE, BOARD, notesFromMots, mockApi, seedState } from './mocks'

// JOURNEY — MOTS ON THE FRIDGE (review #43; was mots-fridge.spec.ts + notes.spec.ts + souvenirs.spec.ts + photo-keep.spec.ts).
//
// « Mots » — ONE card since 2026-09-29 (migration 0142): the fridge notes and the member-
// to-member « Laisse un mot » merged. What the old mots card did must still happen on the
// fridge, so each behaviour Marc chose to keep is pinned here:
//   · an addressed mot shows ONLY on its face (and to nobody at rest);
//   · tapping one that waits OPENS it — it is not taken down;
//   · « Garder » puts any paper on the Souvenirs shelf;
//   · the author sees what they left, under the papers (« Ce que j'ai laissé »).
// Fixture faces: m1 Maman, m2 Papa, m3 Léa.

test.describe('mots-fridge', () => {
  const FOR_LEA = { id: 'n9', text: 'Bravo pour ta lecture !', member_id: 'm2', for_member_id: 'm3', created_at: BASE, opened_at: null, saved_at: null }

  const isNotes = (method: string) => (r: Request) => r.method() === method && new URL(r.url()).pathname === '/api/notes'

  async function openBoard(app: App, face: string | null) {
    const { page } = app
    // The board carries the addressed paper beside the fixture's two family-wide ones…
    const board = { ...BOARD, notes: [...BOARD.notes, FOR_LEA] }
    await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE', api: { overrides: { board } } })
    if (face) await page.addInitScript((f) => localStorage.setItem('babillard-profile', f), face)
    // …and /api/notes (the raw mots read: face dot, outbox) carries it too, as a mot from Papa.
    await page.route('**/api/notes**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(notesFromMots([{ ...FOR_LEA, member_id: 'm3', author_member_id: 'm2' }])),
          })
        : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    )
    await page.goto('/board')
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
  }

  test('an addressed mot shows only on its own face — at rest nobody sees it', async ({ page, app }) => {
    await openBoard(app, null)
    await expect(page.locator('.note-card').first()).toBeVisible()
    await expect(page.getByText('Bravo pour ta lecture !')).toHaveCount(0)
  })

  test('on its face it waits, says « Pour toi », and a tap OPENS it instead of taking it down', async ({ page, app }) => {
    await openBoard(app, 'm3')
    const paper = page.locator('.note-card--waiting', { hasText: 'Bravo pour ta lecture !' })
    await expect(paper).toBeVisible()
    await expect(paper).toContainText('Pour toi')

    let deleted = false
    page.on('request', (r) => {
      if (isNotes('DELETE')(r)) deleted = true
    })
    const [req] = await Promise.all([page.waitForRequest(isNotes('PATCH')), paper.locator('.note-card__tap').click()])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'n9', opened: true })
    expect(deleted, 'opening a mot must never take it down').toBe(false)
  })

  test('« Garder » puts a paper on the Souvenirs shelf', async ({ page, app }) => {
    await openBoard(app, null)
    // Scoped to the fridge: the day note also wears .note-card, and has no badge.
    const badge = page.locator('.notes .note-card__shelf-badge').first()
    await expect(badge).toHaveAttribute('aria-label', 'Garder')
    const [req] = await Promise.all([page.waitForRequest(isNotes('PATCH')), badge.click()])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ saved: true })
  })

  test('the author sees what they left, and whether it was seen, under the papers', async ({ page, app }) => {
    await openBoard(app, 'm2')
    const fold = page.locator('.disclosure', { hasText: 'Ce que j’ai laissé' })
    await expect(fold).toBeVisible()
    await fold.getByRole('button', { name: /Ce que j’ai laissé/ }).click()
    await expect(fold).toContainText('Bravo pour ta lecture !')
    await expect(fold).toContainText('Léa')
  })
})

// ── folded from notes.spec.ts ──────────────────────────────────────────────
test2.describe('notes', () => {
  // « Les notes » (2026-09-04): ONE face, iOS-Notes style — the old Simple/Avancé
  // split (src/lib/notesMode, retired) is gone. No section title (the hub header
  // already says « Les notes »), roomy rows (grip · tint dot · scope chip), a "..."
  // on each, and a tap opens the note straight in the full-screen editor — there's
  // no expand-in-place here any more, the editor IS the detail view. Creating a note
  // is always the ＋ FAB (a blank editor on tap; the quick voice/text/📎 composer on
  // a hold — see journey-navigation.spec.ts and journey-capture.spec.ts). The board's own
  // « Notes (cercle) » glance card is untouched — replaces notes-lean.spec.ts, which
  // guarded the split this file no longer has.

  const NOTE = {
    id: 'n1',
    member_id: null, // Maisonnée → visible under any picked face
    author_member_id: null,
    title: 'Couture',
    text: 'kit été rouge : short en twill',
    media_kind: null,
    media_key: null,
    scene_key: null,
    position: 0,
    created_at: BASE, // unix SECONDS (formatDay multiplies by 1000)
    updated_at: BASE,
  }

  async function openNotes(page: Page, notes: unknown[] = [NOTE], viewport = { width: 800, height: 1280 }) {
    await page.setViewportSize(viewport)
    await mockApi(page)
    await page.route('**/api/family-notes**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes }) })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/notes')
    await expect(page.locator('.cercle-notes')).toBeVisible()
  }

  test2('one face: no section header, roomy rows with a "..." — never the compact board face', async ({ page }) => {
    await openNotes(page)

    await expect(page.locator('.cercle-notes__head')).toHaveCount(0)
    await expect(page.getByText('Notes & recommandations')).toHaveCount(0)
    await expect(page.locator('.cnote-list--compact')).toHaveCount(0)

    const row = page.locator('.cnote-list .cnote', { hasText: 'Couture' })
    await expect(row).toBeVisible()
    await expect(row.locator('.cnote__chip')).toBeVisible()
    await expect(row.locator('.action-menu__btn')).toBeVisible()
  })

  test2('tapping a note opens it straight in the editor — no expand in place', async ({ page }) => {
    await openNotes(page)

    const row = page.locator('.cnote-list .cnote', { hasText: 'Couture' })
    await row.locator('.cnote__main').click()

    const editor = page.locator('.note-editor')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveAttribute('aria-label', 'Modifier la note')
    // No expand-in-place happened underneath — the row never grew a `.cnote__full`.
    await expect(row).not.toHaveClass(/cnote--expanded/)
  })

  test2('"..." offers Supprimer — a deferred delete, no confirm dialog', async ({ page }) => {
    const deletes: string[] = []
    await page.setViewportSize({ width: 800, height: 1280 })
    await mockApi(page)
    await page.route('**/api/family-notes**', async (route) => {
      const m = route.request().method()
      if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
      if (m === 'DELETE') deletes.push(m)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/notes')
    await expect(page.locator('.cercle-notes')).toBeVisible()

    const row = page.locator('.cnote-list .cnote', { hasText: 'Couture' })
    await row.locator('.action-menu__btn').click()
    const panel = page.locator('.action-menu__panel')
    await expect(panel).toBeVisible()
    // Modifier isn't listed — the row tap already does that job.
    await expect(panel.getByText('Modifier', { exact: false })).toHaveCount(0)

    await panel.getByRole('menuitem', { name: 'Supprimer la note' }).click()
    await expect(row).toHaveCount(0) // held behind the undo toast, not in the live rows
    await expect(page.locator('.undo-toast')).toBeVisible()
    // Nothing sent yet — that's the whole point of a deferred delete
    // (useDeferredRemoval, see journey-settings.spec.ts).
    expect(deletes).toEqual([])
  })

  test2('the loupe stays a small button until asked for', async ({ page }) => {
    await openNotes(page)

    await expect(page.locator('.cercle-notes__search.searchfield')).toHaveCount(0)
    const loupe = page.locator('.searchfield__open')
    await expect(loupe).toBeVisible()

    await loupe.click()
    const field = page.locator('.searchfield__input')
    await expect(field).toBeVisible()
    await field.fill('couture')
    await expect(page.locator('.cnote', { hasText: 'Couture' })).toBeVisible()
    await field.fill('zzzz')
    await expect(page.locator('.cnote')).toHaveCount(0)

    await page.locator('.searchfield__clear').click()
    await expect(page.locator('.cercle-notes__search.searchfield')).toHaveCount(0)
    await expect(loupe).toBeVisible()
  })

  test2('the board glance card is unaffected — still expand-in-place, no "..." at all', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1280 })
    await mockApi(page)
    await page.route('**/api/family-notes**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [NOTE] }) })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', cardPrefs: { size: { cercleNotes: 'full' } } })
    await page.goto('/board')

    const row = page.locator('.cnote-list--compact .cnote', { hasText: 'Couture' })
    await expect(row).toBeVisible()
    await expect(row.locator('.action-menu__btn')).toHaveCount(0)

    await row.locator('.cnote__main').click()
    await expect(row).toHaveClass(/cnote--expanded/)
    await expect(page.locator('.note-editor')).toHaveCount(0)
  })

  // A run of the same day says its date ONCE. Notes arrive in bursts, so the identical
  // « mar. 14 nov. » was leading every row and pushing each preview onto a second
  // line. The date still prints when the day CHANGES, which is where it carried
  // information, and an expanded row (the board's glance card) always states its own
  // full moment (it's a detail view there).
  test2('the date leads a day, not every row', async ({ page }) => {
    const DAY = 1_700_000_000
    const note = (id: string, title: string, at: number) => ({
      ...NOTE,
      id,
      title,
      text: `corps de ${title}`,
      created_at: at,
      updated_at: at,
    })
    await openNotes(page, [note('a', 'Un', DAY), note('b', 'Deux', DAY), note('c', 'Trois', DAY - 2 * 86_400)], { width: 390, height: 844 })

    const metas = page.locator('.cnote__meta')
    const first = (await metas.nth(0).textContent()) ?? ''
    const second = (await metas.nth(1).textContent()) ?? ''
    const third = (await metas.nth(2).textContent()) ?? ''

    // Row 1 opens the day; row 2 repeats neither the date nor a dangling separator.
    expect(first).toMatch(/nov\./)
    expect(second).not.toMatch(/nov\./)
    expect(second.trim().startsWith('·')).toBe(false)
    // Row 3 is a different day — the date comes back.
    expect(third).toMatch(/nov\./)
    expect(third).not.toBe(second)
  })

  test2('a read-only guest reads a note in place — the tap never opens the editor', async ({ page }) => {
    // `openOnTap` sends a tap straight into the full-screen rich editor, whose every
    // write a guest's session would only 403 at close — and whose auto-save-on-close
    // makes "just looking" indistinguishable from editing. A guest falls through to
    // the same expand-in-place read the board's glance card uses instead: the note is
    // still fully readable, it just isn't opened in a surface that can't save.
    await page.setViewportSize({ width: 800, height: 1280 })
    await mockApi(page, { signedIn: false })
    await page.route('**/api/guest/whoami**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
    )
    await page.route('**/api/family-notes**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // Two lines, so the row is `expandable` — a one-line note is entirely its own
        // title and has nothing left to expand.
        body: JSON.stringify({ notes: [{ ...NOTE, text: 'kit été rouge : short en twill\net la doublure beige' }] }),
      })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto('/notes')
    await expect(page.locator('.cercle-notes')).toBeVisible()

    const row = page.locator('.cnote-list .cnote', { hasText: 'Couture' })
    const main = row.locator('.cnote__main')
    await expect(main).toHaveAttribute('aria-expanded', 'false') // the read toggle, not « Modifier »
    await main.click()
    await expect(page.locator('.note-editor')).toHaveCount(0)
    await expect(main).toHaveAttribute('aria-expanded', 'true')
    await expect(row).toContainText('doublure beige')
  })

  test2('a row spends its width on the note, not on its own furniture', async ({ page }) => {
    // The ⋯ used to ride IN the row (flex:none, full row height), taking its width out of
    // the note's text: a preview clipped at « Hypothèque 81… » while a quarter of the row
    // was a button. It is a small disc in the top-right corner now, and the preview reads
    // two full lines.
    await openNotes(page, [
      { ...NOTE, title: 'Virements', text: 'Virements\nHypothèque 812.82$\nMoi : 556.41 / 2 sems\nElle : 256.41' },
    ])
    const row = page.locator('.cnote-list .cnote').first()
    const m = await row.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const btn = el.querySelector('.action-menu')!.getBoundingClientRect()
      const meta = el.querySelector('.cnote__meta')!
      const mr = meta.getBoundingClientRect()
      const line = parseFloat(getComputedStyle(meta).lineHeight)
      return {
        rowW: r.width,
        metaW: mr.width,
        btnFromTop: btn.top - r.top,
        btnH: btn.height,
        metaLines: Math.round(mr.height / line),
      }
    })
    // Top-RIGHT corner, not vertically centred in the row…
    expect(m.btnFromTop, 'the ⋯ sits at the top of the row').toBeLessThan(16)
    expect(m.btnH, 'a small disc, not a full-height column').toBeLessThan(40)
    // …so the text keeps most of the row.
    expect(m.metaW / m.rowW, 'the preview gets the width back').toBeGreaterThan(0.6)
    // …and reads two lines, not one clipped one.
    expect(m.metaLines).toBe(2)
  })

  test2('the preview never repeats the title back at you', async ({ page }) => {
    // A note titled « Virements » whose body also starts with it read:
    //   Virements  /  8 juin · Virements Hypothèque 812.82$ …
    // — the title again, eating the preview it was there to show. (lib/familyNotes
    // noteRowText; the same rule seedMd enforces from the editor's side.)
    await openNotes(page, [{ ...NOTE, title: 'Virements', text: 'Virements\nHypothèque 812.82$' }])
    const meta = page.locator('.cnote-list .cnote').first().locator('.cnote__meta')
    await expect(meta).toContainText('Hypothèque')
    await expect(meta).not.toContainText('Virements')
  })
})


// ── folded from souvenirs.spec.ts ──────────────────────────────────────────────
test.describe('souvenirs', () => {
  // « Souvenirs » (PLAN-mots C1, accepted 2026-09-25 — « put the widget back »): a band card
  // that shelves what the household chose to KEEP — kept mots (saved_at, since 0094), kept
  // drawings and kept photos (saved_at, 0140) — as one scrolling line of thumbnails and
  // hand-written lines. A shelf you visit: no count, no « on this day ». Absent when
  // nothing is kept (mode 'auto'). The keep itself is one pin on the photo frame and one on
  // each gallery drawing; a kept mot already had its « Garder ».

  const MOT = {
    id: 'mo1', member_id: null, author_member_id: 'm2', text: 'Premier jour d’école !',
    media_kind: null, media_key: null, scene_key: null, created_at: BASE - 86_400,
    updated_at: null, opened_at: BASE - 80_000, saved_at: BASE - 79_000, surface_at: null, reply_to: null,
  }
  const PHOTOS = [
    { id: 'p1', key: 'ph_kept', saved_at: BASE - 3600 },
    { id: 'p2', key: 'ph_plain', saved_at: null },
  ]
  const DRAWINGS = [
    { id: 'dg1', member_id: 'm3', media_key: 'nm_g1', scene_key: 'ns_g1', created_at: BASE, saved_at: BASE - 100 },
    { id: 'dg2', member_id: 'm1', media_key: 'nm_g2', scene_key: null, created_at: BASE - 86_400, saved_at: null },
  ]

  async function openBoard(app: App, o: { mots?: object[]; photos?: object[]; drawings?: object[] } = {}) {
    const { page } = app
    await app.boot()
    const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    // Mots are fridge notes since 0142 — served in the notes shape.
    await page.route('**/api/notes**', (route) =>
      route.request().method() === 'GET' ? route.fulfill(json(notesFromMots((o.mots ?? []) as Record<string, unknown>[]))) : route.fulfill(json({ ok: true })),
    )
    await page.route('**/api/photos**', (route) => (route.request().method() === 'GET' ? route.fulfill(json({ photos: o.photos ?? [] })) : route.fulfill(json({ ok: true }))))
    await page.route('**/api/drawings**', (route) => (route.request().method() === 'GET' ? route.fulfill(json({ drawings: o.drawings ?? [], more: false })) : route.fulfill(json({ ok: true }))))
    await page.goto('/board')
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  const shelf = (page: Page) => page.locator('.wg-slot[data-card="souvenirs"]')

  test('the shelf shows exactly what is kept — a photo, a drawing, a mot — and a mot opens its peek', async ({ page, app }) => {
    await openBoard(app, { mots: [MOT], photos: PHOTOS, drawings: DRAWINGS })
    const card = shelf(page)
    await expect(card).toBeVisible()
    // Two pictures (the kept photo + the kept drawing), never the unkept ones.
    await expect(card.locator('.souv__tile img')).toHaveCount(2)
    await expect(card.locator('.souv__tile img[src*="ph_kept"]')).toHaveCount(1)
    await expect(card.locator('.souv__tile img[src*="nm_g1"]')).toHaveCount(1)
    await expect(card.locator('img[src*="ph_plain"], img[src*="nm_g2"]')).toHaveCount(0)
    // The kept mot reads as its line, and taps into the same peek the mots card opens.
    const mot = card.locator('.souv__mot', { hasText: 'Premier jour d’école' })
    await expect(mot).toHaveCount(1)
    await mot.click()
    await expect(page.locator('.detail-sheet')).toContainText('Premier jour d’école !')
    // Calm: nothing on the card counts anything.
    await expect(card).not.toContainText(/\b\d+ (souvenirs?|photos?|dessins?|mots?)\b/)
  })

  test('nothing kept, no shelf — the card does not sit empty on the band', async ({ page, app }) => {
    await openBoard(app, { mots: [{ ...MOT, saved_at: null }], photos: [PHOTOS[1]!], drawings: [DRAWINGS[1]!] })
    await expect(page.locator('.wg-slot[data-card="mots"], .wg-slot[data-card="photos"]').first()).toBeVisible()
    // An 'auto' slot stays MOUNTED and hidden when empty (board-empty-cards.spec says why:
    // a self-fetching card only learns it is empty after fetching) — hidden, never absent.
    await expect(shelf(page)).toBeHidden()
  })

  test('the photo frame’s pin keeps the photo on show — one PATCH, pressed state', async ({ page, app }) => {
    await openBoard(app, { photos: [PHOTOS[1]!] })
    const frame = page.locator('.wg-slot[data-card="photos"] .photo-frame')
    await expect(frame).toBeVisible()
    const pin = frame.getByRole('button', { name: 'Garder' })
    await expect(pin).toHaveAttribute('aria-pressed', 'false')
    const patched = page.waitForRequest((r) => r.url().includes('/api/photos') && r.method() === 'PATCH')
    await pin.click()
    expect(JSON.parse((await patched).postData() || '{}')).toEqual({ id: 'p2', saved: true })
  })
})


// ── folded from photo-keep.spec.ts ──────────────────────────────────────────────
test4.describe('photo-keep', () => {
  // « Je prends une pic vite, je la mets sur le babillard — et je la garde. »
  //
  // Three guarantees, one flow:
  //   1. A photo is ONE tap. The 📎's « Photo » chip attaches the file directly; it must
  //      NOT open the DrawPad (it used to — "draw over a photo" was the only door to
  //      "add a photo", which put a whole pad between you and a quick pic).
  //   2. « Ajouter aux photos » copies it into the household frame (POST /api/photos)
  //      — its own independent blob, so clearing the note can't take it.
  //   3. « Enregistrer sur l'appareil » hands the shot back to the phone. Chromium has no
  //      file-share, so this exercises the download fallback — the half of the feature
  //      that desktop and older Android depend on.

  // A 1×1 PNG — real bytes, so the resize/upload path runs for real.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  async function openNoteAttach(page: Page) {
    await page.goto('/board')
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible({ timeout: 15_000 })
    await page.locator('.addsheet__lead .memo-attach__btn').click()
    await expect(page.locator('.memo-attach__picks')).toBeVisible()
  }

  test4('« Photo » attaches the pic straight — no pad in the way — and offers both keeps', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await openNoteAttach(page)

    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/')) posts.push(new URL(r.url()).pathname)
    })

    // One tap: the file lands on the note. The pad must stay shut.
    await page.locator('.memo-attach input[type="file"]').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.locator('.memo-attach__chip')).toBeVisible()
    await expect(page.locator('.memo-attach__thumb')).toBeVisible()
    await expect(page.locator('.drawpad')).toHaveCount(0)
    expect(posts).toContain('/api/note-media')

    // The photo is attached; now the two optional keeps sit under it.
    const keep = page.getByRole('button', { name: 'Ajouter aux photos' })
    await expect(keep).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enregistrer sur l’appareil' })).toBeVisible()

    // Keep → the household frame gets its own copy, and the chip says so.
    await keep.click()
    await expect(page.getByRole('button', { name: 'Ajoutée aux photos' })).toBeVisible()
    await expect.poll(() => posts.filter((p) => p === '/api/photos').length).toBe(1)
    // …undoably: the calm toast offers to take it straight back out.
    await expect(page.locator('.undo-toast')).toContainText('Ajoutée aux photos')
  })

  test4('« Enregistrer sur l’appareil » falls back to a download where files can’t be shared', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await openNoteAttach(page)

    await page.locator('.memo-attach input[type="file"]').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.locator('.memo-attach__chip')).toBeVisible()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Enregistrer sur l’appareil' }).click()
    expect((await download).suggestedFilename()).toMatch(/^babillard-\d+\.(png|jpg)$/)
    await expect(page.getByRole('button', { name: 'Enregistrée' })).toBeVisible()
  })
})
