import { test, expect, type Page } from '@playwright/test'

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

// The rig (DEVICES / boot / openKeyboard / expectAbove) lives in e2e/kb.ts so the
// state-matrix suite can open keyboard states with the same stub.
import { DEVICES, boot, openKeyboard, expectAbove } from './kb'

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

  // --- Board: the inline « À compléter » add combobox, near the BOTTOM of the feed
  // (not a sheet). This is the field the user hit: a combobox opening its dropdown
  // on focus + the .kb-open padding settling raced the one-shot scroll, so it
  // "sometimes" stayed buried. viewportVars now re-pins across the settle window. ---
  test(`kb ${d.name}: board todo add`, async ({ page }) => {
    await open(page, '/board')
    const add = page.getByPlaceholder('Ajouter à compléter…').first()
    await add.scrollIntoViewIfNeeded()
    await add.focus()
    await openKeyboard(page, d.kb)
    // Let the re-pin retries (120/280/480ms) settle, as they do on a device.
    await page.waitForTimeout(600)
    await page.screenshot({ path: png('board-todo-add'), fullPage: false })
    await expectAbove(add, VISIBLE, 'board À compléter add')
  })

  // --- Settings: add-a-person form (inline, not a sheet) ---
  test(`kb ${d.name}: settings add-person`, async ({ page }) => {
    // Guide is the default settings tab now; deep-link to La maisonnée for the form.
    await open(page, '/settings?tab=household')
    // exact: the household-rename field (placeholder Nom de la maisonnée) also matches a loose Nom.
    const nom = page.getByPlaceholder('Nom', { exact: true })
    await nom.scrollIntoViewIfNeeded()
    await nom.focus()
    await openKeyboard(page, d.kb)
    await page.screenshot({ path: png('settings-person'), fullPage: false })
    await expectAbove(nom, VISIBLE, 'settings Nom input')
  })

  // --- Typing follows the caret. The focus-time pin fires once; after it, layout
  // settling, a growing field, or the user scrolling to peek can leave the field
  // back under the keyboard with no focus event to re-pin it. The input-driven
  // follow in viewportVars (the general version of NoteEditor's caret-follow) must
  // pull ANY stranded field back above the keyboard on the next keystroke. ---
  test(`kb ${d.name}: typing pulls a stranded field back above the keyboard`, async ({ page }) => {
    await open(page, '/board')
    const add = page.getByPlaceholder('Ajouter à compléter…').first()
    await add.scrollIntoViewIfNeeded()
    await add.focus()
    await openKeyboard(page, d.kb)
    await page.waitForTimeout(600) // let the focus-pin retries settle
    // Strand it: scroll the page scroller back up so the field sits fully inside
    // the keyboard band again (what a scroll-to-peek or a late layout shift does).
    const stranded = await page.evaluate((vis) => {
      const el = document.activeElement as HTMLElement
      let sc: HTMLElement | null = el.parentElement
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement
      if (!sc) return false
      sc.scrollTop = Math.max(0, sc.scrollTop - (vis + 20 - el.getBoundingClientRect().top))
      return el.getBoundingClientRect().top >= vis
    }, VISIBLE)
    test.skip(!stranded, 'not enough scroll room to strand the field on this device')
    await page.keyboard.type('lait')
    await page.waitForTimeout(300) // follow is rAF-coalesced
    await page.screenshot({ path: png('type-follow'), fullPage: false })
    await expectAbove(add, VISIBLE, 'typed field followed back above the keyboard')
  })

  // --- Overlays/scenes whose field must stay above the keyboard. `field` is scoped
  // to the VISIBLE surface (.sheet.show overlay / .scene route) so it never matches
  // the always-mounted, off-screen <AddSheet> (a plain .sheet) sitting behind. ---
  const SHEETS: { name: string; path: string; field: string; go: (p: Page) => Promise<void> }[] = [
    // The board ＋ hoists its capture box to the top (input visible immediately, no
    // tile to pick); the liste ＋ opens a chooser — pick the text-add tile to reveal
    // its input.
    { name: 'liste-addsheet', path: '/liste', field: '.sheet.show input', go: async (p) => { await p.locator('.add-fab').click(); await p.getByRole('dialog').getByRole('button', { name: 'Ajouter à la liste' }).first().click() } },
    // The edit scene opens from the row's ✏️ now — the name/centre toggles the check.
    { name: 'liste-item-sheet', path: '/liste', field: '.scene input', go: async (p) => void (await p.locator('.list-row', { hasText: 'Pain' }).locator('.list-row__img').click()) },
    { name: 'quickadd', path: '/liste', field: '.scene input', go: async (p) => { await p.locator('.add-fab').click(); await p.getByRole('dialog').getByRole('button', { name: /Ajout rapide/ }).first().click() } },
    { name: 'deals-browser', path: '/liste', field: '.scene input', go: async (p) => { await p.locator('.add-fab').click(); await p.getByRole('dialog').getByRole('button', { name: /Parcourir les circulaires/ }).click() } },
    { name: 'board-addsheet', path: '/board', field: '.sheet.show input', go: async (p) => { await p.locator('.add-fab').click() } },
    { name: 'kitchen-addsheet', path: '/kitchen', field: '.sheet.show input', go: async (p) => { await p.locator('.add-fab').click(); await p.locator('.cat-pick').filter({ hasText: 'Restants' }).click() } },
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
      // A full-screen scene must keep COVERING the strip the keyboard overlays —
      // shrinking the shell to the visible band turned that strip into a live,
      // scrollable window onto the page behind (the note-editor bug, same CSS).
      if (s.field.startsWith('.scene')) {
        const owner = await page.evaluate(
          ({ w, h, kb }) => document.elementFromPoint(w / 2, h - kb / 2)?.closest('.scene') ? 'scene' : 'page-behind',
          { w: d.w, h: d.h, kb: d.kb },
        )
        expect(owner, `${s.name} keyboard strip belongs to the scene`).toBe('scene')
      }
    })
  }

  // --- Recipe modal: create form (title input summons the keyboard) ---
  test(`kb ${d.name}: recipe form`, async ({ page }) => {
    // The recipe builder is a standalone route now (RecipeForm → .recipe-modal).
    await open(page, '/kitchen/recipe/new')
    await page.locator('.recipe-modal').waitFor({ state: 'visible' })
    await page.locator('.recipe-title-input').click()
    await openKeyboard(page, d.kb)
    await page.screenshot({ path: png('recipe-form'), fullPage: false })
    await expectAbove(page.locator('.recipe-modal__foot .btn--primary'), VISIBLE, 'recipe Enregistrer')
    await expectAbove(page.locator('.recipe-modal__bar button').last(), VISIBLE, 'recipe ✕')
    // The modal keeps covering the keyboard strip (padding shrinks the content,
    // never the shell — see .scene / .note-editor).
    const owner = await page.evaluate(
      ({ w, h, kb }) => document.elementFromPoint(w / 2, h - kb / 2)?.closest('.recipe-modal') ? 'modal' : 'page-behind',
      { w: d.w, h: d.h, kb: d.kb },
    )
    expect(owner, 'recipe keyboard strip belongs to the modal').toBe('modal')
  })

  // --- Recipe sheet: read view, actions stay reachable ---
  //
  // The keyboard is opened on the BOARD and carried here, which is the only way this
  // state exists on a real device: the recipe view — and the whole Recettes tab —
  // contains no input, textarea or contenteditable at all (verified 2026-08-28), so
  // nothing here can summon a keyboard. You arrive with one already up.
  //
  // It used to just shrink the viewport on this page with nothing ever focused. That
  // shortcut stopped working when `.kb-open` gained its missing invariant — a keyboard
  // cannot ARRIVE with no summoner focused, because iOS shrinks the visual viewport for
  // screenshots and the app switcher too, and the board was losing its tab bar to that
  // (Marc, 2026-08-28). The assertion is unchanged and the scenario is now the real one;
  // it also covers the other half of that invariant — a live keyboard SURVIVES losing
  // its field to a navigation.
  test(`kb ${d.name}: recipe sheet`, async ({ page }) => {
    await open(page, '/board')
    const add = page.getByPlaceholder('Ajouter à compléter…').first()
    await add.scrollIntoViewIfNeeded()
    await add.focus()
    await openKeyboard(page, d.kb)

    // Carry it across. The route change is driven through the History API rather than
    // a tap, for a reason that is itself the feature: `.kb-open` HIDES the hub tab bar
    // (that is what it is for), so with a keyboard up there is no visible in-app door
    // to La cuisine to click. A `page.goto` would reload and reset the viewport stub,
    // i.e. close the keyboard — the one thing this test needs kept. pushState +
    // popstate is what BrowserRouter listens to, so the app navigates client-side with
    // the keyboard still up, exactly as it does on the device.
    await page.evaluate(() => {
      history.pushState({}, '', '/kitchen')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
    // Card → straight to the recipe view route (the detail peek was removed).
    await page.locator('.recipe-card').first().click()
    await page.locator('.recipe-modal').waitFor({ state: 'visible' })
    await expect(page.locator('html'), 'the carried keyboard is still claimed').toHaveClass(/kb-open/)
    await page.screenshot({ path: png('recipe-sheet'), fullPage: false })
    await expectAbove(page.locator('.recipe-actions .btn--primary'), VISIBLE, 'recipe Cuisiner')
  })
}

// The keyboard RISING must pin the CARET, not just the focused element. Re-opening a
// long note and tapping its last line places the caret far below the fold of the tall
// contentEditable host — the host's TOP is already in view, so an element-level
// scrollIntoView no-ops and the caret sits under the keyboard until the first
// keystroke (whose input-driven follow then rescues it). pinOnce must route
// contentEditables through followCaret. Also guards the attach footer hiding while
// the keyboard is up.
test('kb: opening the keyboard with the caret at the end of a long note reveals the caret', async ({ page }) => {
  const d = { w: 390, h: 844, kb: 336 }
  const open = boot(d)
  const VISIBLE = d.h - d.kb
  await open(page, '/notes?add=1')
  const scroller = page.locator('.note-editor__body')
  const body = page.locator('.note-editor .note-tiptap')
  await body.click()
  // Build a long note with the caret left at the very end — keyboard still closed,
  // so neither the focus-pin nor the input-follow has fired yet.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.type(`ligne ${i}`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type('FIN')
  // Strand the caret: scroll the body back to the top (what a re-opened note shows)
  // while the selection stays on the last line.
  await scroller.evaluate((el) => (el.scrollTop = 0))
  await openKeyboard(page, d.kb)

  const last = body.locator(':scope > :last-child')
  await expect(last).toHaveText('FIN')
  // Poll rather than a fixed wait: the pin re-fires across a ~½s settle window
  // (120/280/480ms retries), which a loaded CI worker can stretch.
  await expect
    .poll(async () => {
      const b = await last.boundingBox()
      return b ? b.y >= -1 && b.y + b.height <= VISIBLE + 1 : false
    }, { message: 'caret line fully inside the visible band', timeout: 5000 })
    .toBe(true)
  await page.screenshot({ path: 'e2e/screenshots/kb-phone-note-caret-end.png', fullPage: false })

  // Chrome rule: the Photo/Dessin footer yields to the keyboard.
  await expect(page.locator('.note-editor__media')).toBeHidden()
})

// Dragging a selection HANDLE downward (extending the selection) must never be
// "followed": caretIntoView measures the FIRST client rect of an expanded range —
// the ANCHOR line at the TOP of the selection, not the handle end being dragged —
// so following scrolled the view back up toward the anchor on every drag frame,
// fighting the finger (Marc: selecting with the keyboard up "keeps dragging us
// back up"). An expanded selection is now skipped by both the selectionchange
// follow and caretIntoView itself.
test('kb: extending a selection with the keyboard open is never yanked back up', async ({ page }) => {
  const d = { w: 390, h: 844, kb: 336 }
  const open = boot(d)
  await open(page, '/notes?add=1')
  const scroller = page.locator('.note-editor__body')
  const body = page.locator('.note-editor .note-tiptap')
  await body.click()
  for (let i = 0; i < 30; i++) {
    await page.keyboard.type(`ligne ${i}`)
    await page.keyboard.press('Enter')
  }
  await openKeyboard(page, d.kb)
  await page.waitForTimeout(600) // let the focus-pin retries settle
  // Anchor the selection on an early line, scroll it above the fold, then extend
  // the focus end downward like a handle drag (each extend fires selectionchange).
  const drift = await scroller.evaluate(async (el) => {
    const lines = [...el.querySelector('.note-tiptap')!.children] as HTMLElement[]
    const sel = document.getSelection()!
    sel.setBaseAndExtent(lines[2].firstChild ?? lines[2], 0, lines[20].firstChild ?? lines[20], 1)
    el.scrollTop = el.scrollHeight // the anchor line now sits far above the visible band
    const start = el.scrollTop
    for (let i = 21; i < 28; i++) {
      sel.extend(lines[i].firstChild ?? lines[i], 1)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    }
    await new Promise((r) => setTimeout(r, 200))
    return start - el.scrollTop
  })
  expect(drift, 'the scroller was not pulled back up toward the selection anchor').toBe(0)
})

// The iOS standalone "viewport push": focusing a caret near the BOTTOM makes iOS pan
// the visual viewport (offsetTop jumps, here 260px of a 336px keyboard). The old
// keyboard-presence gate (`inner - height - offsetTop`) then read the keyboard as
// nearly gone: `.kb-open` dropped, the paddings vanished, and every pin/follow gate
// disarmed — with the caret at the END of a long note the body sat at max scroll, so
// nothing could ever reveal it, not even typing (Marc's exact report). Presence must
// gate on the pan-independent SHRINK; only --kb keeps the pan-aware geometry.
test('kb: the iOS viewport push does not disarm the keyboard machinery', async ({ page }) => {
  const d = { w: 390, h: 844, kb: 336 }
  const PAN = 260
  const open = boot(d)
  await open(page, '/notes?add=1')
  const body = page.locator('.note-editor .note-tiptap')
  await body.click()
  for (let i = 0; i < 30; i++) {
    await page.keyboard.type(`ligne ${i}`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type('FIN')
  await openKeyboard(page, d.kb, PAN)

  // The machinery stayed armed…
  await expect
    .poll(() => page.evaluate(() => ({
      open: document.documentElement.classList.contains('kb-open'),
      kb: getComputedStyle(document.documentElement).getPropertyValue('--kb').trim(),
    })), { message: 'kb-open latched despite the pan', timeout: 5000 })
    .toEqual({ open: true, kb: `${d.kb - PAN}px` })

  // …and the caret line sits inside the panned visible band [PAN, PAN + (h - kb)].
  const last = body.locator(':scope > :last-child')
  await expect(last).toHaveText('FIN')
  await expect
    .poll(async () => {
      const b = await last.boundingBox()
      return b ? b.y >= PAN - 1 && b.y + b.height <= PAN + (d.h - d.kb) + 1 : false
    }, { message: 'caret line fully inside the panned visible band', timeout: 5000 })
    .toBe(true)
})

// No keyboard at all — a short phone (or split-screen): the modal must still fit
// and keep its footer reachable. Catches plain max-height regressions.
test('recipe form fits a short viewport', async ({ page }) => {
  const open = boot({ w: 390, h: 844 })
  await open(page, '/kitchen/recipe/new')
  await page.setViewportSize({ width: 390, height: 480 })
  await page.evaluate(() => {
    const stub = (window as unknown as { __vvStub: { height: number; dispatchEvent: (e: Event) => boolean } }).__vvStub
    stub.height = window.innerHeight
    stub.dispatchEvent(new Event('resize'))
  })
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })
  await expectAbove(page.locator('.recipe-modal__foot .btn--primary'), 480, 'short-vp Enregistrer')
  await expectAbove(page.locator('.recipe-modal__bar button').last(), 480, 'short-vp ✕')
})

// iOS suspends the web view whenever something covers it — the app-switcher, the
// screenshot preview → Markup editor, a share sheet. `visualViewport` collapses while
// away, so `innerHeight - vv.height` reads exactly like a keyboard. Left unhandled,
// --kb + `.kb-open` latch at keyboard-open values and the board comes back with its
// tab bar and ＋ FAB hidden and the always-mounted, EMPTY entity-detail peek lifted
// back over the bottom edge — a shell whose ✕ closes an already-closed sheet, so it
// can't be dismissed short of restarting the app.
//
// Two independent guarantees, so neither alone has to hold:
//   1. CSS — a parked sheet is inert no matter what --kb says.
//   2. JS  — --kb/.kb-open never latch across a suspend.
// Each of these runs INSIDE the page, so it must stand alone — no closure over the
// Node scope. `shrinkBy` fakes iOS collapsing the visual viewport; `setHidden` fakes
// the app being covered; `kbState` reads back what viewportVars published.
const shrinkBy = (px: number) => {
  const stub = (window as unknown as { __vvStub: { height: number; dispatchEvent: (e: Event) => boolean } }).__vvStub
  stub.height = window.innerHeight - px
  if (px > 0) stub.dispatchEvent(new Event('resize'))
}
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
  document.dispatchEvent(new Event('visibilitychange'))
}
const kbState = () => ({
  open: document.documentElement.classList.contains('kb-open'),
  kb: getComputedStyle(document.documentElement).getPropertyValue('--kb').trim(),
})

test('a parked sheet stays inert even with --kb stuck open', async ({ page }) => {
  const open = boot({ w: 390, h: 844 })
  await open(page, '/board')

  // Force the worst case the JS is supposed to prevent, and prove the CSS survives it.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--kb', '336px')
    document.documentElement.classList.add('kb-open')
  })

  const parked = page.locator('.sheet:not(.show)')
  const n = await parked.count()
  expect(n, 'the board mounts parked sheets (detail peek, profile picker)').toBeGreaterThan(0)
  for (let i = 0; i < n; i++) await expect(parked.nth(i), `parked sheet ${i} hidden`).not.toBeVisible()

  // …and nothing of theirs intercepts a tap along the bottom edge.
  const hits = await page.evaluate(() =>
    [700, 780, 830].map((y) => (document.elementFromPoint(195, y)?.closest('.sheet') ? 'sheet' : 'page')),
  )
  expect(hits, 'bottom of the screen belongs to the page, not a parked sheet').toEqual(['page', 'page', 'page'])
})

test('a suspend never latches --kb / .kb-open', async ({ page }) => {
  const open = boot({ w: 390, h: 844 })
  await open(page, '/board')
  expect(await page.evaluate(kbState)).toEqual({ open: false, kb: '0px' })

  // The collapse can land BEFORE visibilitychange, while we still count as visible —
  // this is the event that latched the phantom keyboard.
  await page.evaluate(shrinkBy, 500)
  await page.waitForTimeout(120)

  // Away. Nothing measured while hidden is trustworthy, so nothing is written.
  await page.evaluate(setHidden, true)
  await page.evaluate(shrinkBy, 620) // iOS keeps shrinking us on the way out
  await page.waitForTimeout(120)

  // Back — with the viewport silently restored and NO resize event of its own, which
  // is the case that used to leave the vars stuck forever.
  await page.evaluate(shrinkBy, 0)
  await page.evaluate(setHidden, false)
  await page.waitForTimeout(700) // remeasure's settle retries (60/200/500ms)
  expect(await page.evaluate(kbState), 'vars cleared on the way back').toEqual({ open: false, kb: '0px' })

  // The tab bar and ＋ FAB came back with it.
  await expect(page.locator('.hubnav')).toBeVisible()
  await expect(page.locator('.add-fab')).toBeVisible()
})

// A keyboard dismissed by the ROUTE CHANGE ITSELF — the field it was attached to is
// unmounted, so iOS fires neither a visualViewport `resize` nor a `focusout`. The vars
// stay latched at keyboard-open values, and the full-screen scene you just opened pads
// a keyboard's height off its own bottom: a dead band across the lower third with no
// keyboard in sight (Marc, iOS PWA — the day page opened from the calendar showed
// nothing past « Dîner »). Nothing re-measured on a client-side navigation, so the band
// followed you from page to page. The router now re-reads the viewport on every
// pathname change (router.tsx ViewportOnNav → lib/viewportVars remeasureViewport).
const silentlyRestoreViewport = () => {
  const stub = (window as unknown as { __vvStub: { height: number; offsetTop: number } }).__vvStub
  stub.height = window.innerHeight
  stub.offsetTop = 0
  document.getElementById('fake-kb')?.remove()
  // …and NO resize event: that is exactly the iOS gap this guards.
}

test('a keyboard that vanishes with the route leaves no dead band on the next scene', async ({ page }) => {
  const open = boot({ w: 390, h: 844 })
  await open(page, '/board')

  const add = page.getByPlaceholder('Ajouter à compléter…').first()
  await add.scrollIntoViewIfNeeded()
  await add.focus()
  await openKeyboard(page, 291)
  expect(await page.evaluate(kbState), 'keyboard up').toEqual({ open: true, kb: '291px' })

  await page.evaluate(silentlyRestoreViewport)
  // Navigate the way the app does: an in-app link into a full-screen .scene.
  await page.locator('a[href="/board/departure"]').first().click()
  await expect(page.locator('.scene')).toBeVisible()
  await page.waitForTimeout(700) // remeasure's settle retries (60/200/500ms)

  expect(await page.evaluate(kbState), 'vars cleared by the navigation').toEqual({ open: false, kb: '0px' })
  const band = await page.evaluate(() => {
    const body = document.querySelector('.scene__body')!
    return Math.round(window.innerHeight - body.getBoundingClientRect().bottom)
  })
  expect(band, 'the scene body reaches the bottom of the screen').toBeLessThanOrEqual(1)
})

test('a keyboard that is genuinely still up keeps its fit across a navigation', async ({ page }) => {
  const open = boot({ w: 390, h: 844 })
  await open(page, '/board')

  const add = page.getByPlaceholder('Ajouter à compléter…').first()
  await add.scrollIntoViewIfNeeded()
  await add.focus()
  await openKeyboard(page, 291)

  // The viewport stays shrunk — the keyboard really is there. The re-read must agree
  // with the device, not blanket-clear on every navigation.
  await page.locator('a[href="/board/departure"]').first().click()
  await expect(page.locator('.scene')).toBeVisible()
  await page.waitForTimeout(700)
  expect(await page.evaluate(kbState), 'fit kept').toEqual({ open: true, kb: '291px' })
})

// The same unmount WITHOUT a route change — a sheet closing on save takes its focused
// field with it. No blur, no focusout, and iOS can skip the resize too. The next tap
// anywhere re-reads the viewport (viewportVars' pointerup backstop), so the dead band
// never outlives one touch.
test('a keyboard that vanishes with its sheet is cleared by the next tap', async ({ page }) => {
  const open = boot({ w: 390, h: 844 })
  await open(page, '/board')

  const add = page.getByPlaceholder('Ajouter à compléter…').first()
  await add.scrollIntoViewIfNeeded()
  await add.focus()
  await openKeyboard(page, 291)
  expect(await page.evaluate(kbState), 'keyboard up').toEqual({ open: true, kb: '291px' })

  // The field is removed (not blurred) and the viewport comes back silently.
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    document.getElementById('fake-kb')?.remove()
    const stub = (window as unknown as { __vvStub: { height: number; offsetTop: number } }).__vvStub
    stub.height = window.innerHeight
    stub.offsetTop = 0
  })
  // Whatever the engine does with blur, re-latch the stale state so the backstop is
  // what's under test, then tap somewhere harmless.
  await page.evaluate(() => {
    document.documentElement.classList.add('kb-open')
    document.documentElement.style.setProperty('--kb', '291px')
  })
  await page.locator('.hub__body').first().click({ position: { x: 5, y: 5 } })
  await page.waitForTimeout(300)
  expect(await page.evaluate(kbState), 'the next tap cleared it').toEqual({ open: false, kb: '0px' })
})

// …and the same unmount with NO tap and NO navigation: idle hands heal nothing.
// Every backstop above needs an EVENT (a tap, a route change, a focus move), so
// closing a composer by its own ✕ and then just LOOKING at the screen left the tab
// bar + ＋ FAB hidden until the next touch (Marc, iOS PWA — « the bottom bar
// sometimes disappears », 2026-08-27). The watchdog in lib/viewportVars re-reads
// the viewport once a second while the state is self-contradictory (we claim a
// keyboard, yet nothing editable holds focus).
test('a keyboard that vanishes with nothing touched clears itself within a tick', async ({ page }) => {
  const open = boot({ w: 390, h: 844 })
  await open(page, '/board')

  const add = page.getByPlaceholder('Ajouter à compléter…').first()
  await add.scrollIntoViewIfNeeded()
  await add.focus()
  await openKeyboard(page, 291)
  expect(await page.evaluate(kbState), 'keyboard up').toEqual({ open: true, kb: '291px' })
  await expect(page.locator('.hubnav')).toBeHidden()

  // REMOVE the focused field (a composer closing takes its input with it — Chromium
  // fires no blur/focusout for a removed node, exactly like iOS) and restore the
  // viewport silently: no resize, no focusout, no tap, no navigation.
  await page.evaluate(() => {
    document.activeElement?.remove()
    document.getElementById('fake-kb')?.remove()
    const stub = (window as unknown as { __vvStub: { height: number; offsetTop: number } }).__vvStub
    stub.height = window.innerHeight
    stub.offsetTop = 0
  })

  // Nothing is touched — only the watchdog can save this.
  await expect
    .poll(() => page.evaluate(kbState), { message: 'the watchdog cleared the stale latch', timeout: 4000 })
    .toEqual({ open: false, kb: '0px' })
  await expect(page.locator('.hubnav')).toBeVisible()
  await expect(page.locator('.add-fab')).toBeVisible()
})
