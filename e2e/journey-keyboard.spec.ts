import { test, expect, type Page } from '@playwright/test'
import { boxOf, settled } from './measure'
import { DEVICES, boot, openKeyboard, expectAbove, installVvStub } from './kb'
import { test as test2, test as test3, test as test4, test as test6, test as test8 } from './fixtures'
import { mockApi, seedState, type Audience } from './mocks'
import { openKitEntry } from './kit'
import { assertClean } from './overflow'

// JOURNEY — THE KEYBOARD ON A PHONE (review #43; was keyboard.spec.ts + kb-latch.spec.ts + composer-fit.spec.ts + focus-not-obscured.spec.ts + footer-clearance.spec.ts + sheet-scroll-lock.spec.ts + zoom-overlay-portal.spec.ts + hub-width.spec.ts).
//
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

test.describe('keyboard', () => {
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
        await settled(page)
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
      const add = page.getByPlaceholder('Ajouter une tâche…').first()
      await add.scrollIntoViewIfNeeded()
      await add.focus()
      await openKeyboard(page, d.kb)
      // The re-pin retries (120/280/480ms) settle, as they do on a device.
      await settled(page)
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
      const add = page.getByPlaceholder('Ajouter une tâche…').first()
      await add.scrollIntoViewIfNeeded()
      await add.focus()
      await openKeyboard(page, d.kb)
      await settled(page) // the focus-pin retries have settled
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
      await settled(page) // follow is rAF-coalesced
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
        await settled(page)
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

    // --- A centred Modal with a field (the remark composer). It had NO keyboard rule at
    // all: centred on the FULL screen, its « Envoyer » sat under the keyboard on a
    // phone (Marc, 2026-09-24: « the keyboard covers the Save button »). The backdrop
    // joined the core.css fit group and the box is capped to the visible band. ---
    test(`kb ${d.name}: remark modal`, async ({ page }) => {
      await open(page, '/settings?tab=settings&sub=tablets&focus=remarks')
      await page.locator('#operator-panel').getByRole('button', { name: 'Signaler' }).click()
      const dialog = page.getByRole('dialog')
      const box = dialog.getByRole('textbox')
      await box.focus()
      await openKeyboard(page, d.kb)
      await page.screenshot({ path: png('remark-modal'), fullPage: false })
      await expectAbove(box, VISIBLE, 'remark textbox')
      await expectAbove(dialog.getByRole('button', { name: 'Envoyer' }), VISIBLE, 'remark « Envoyer »')
    })

    // --- A TALL textarea: the verify dialog's growing memo line. The follow used to
    // reveal the box's BOTTOM edge — right for a two-line field, wrong for one grown
    // taller than the visible band: with the caret on line 1, typing pushed that line
    // off the top. The caret's own line is measured now (caretBandInTextarea). ---
    test(`kb ${d.name}: tall memo keeps the caret line in view`, async ({ page }) => {
      await open(page, '/dev/kit')
      const entry = page.locator('details.kit-entry').filter({ hasText: 'Ouvrir la vérification' })
      await entry.locator('summary').click()
      await entry.getByRole('button', { name: 'Ouvrir la vérification' }).click()
      const memo = page.locator('.read-review__memo').first()
      await memo.waitFor({ state: 'visible' })
      // Grow it well past the visible band, caret on the FIRST line.
      await memo.fill(Array.from({ length: 40 }, (_, i) => `ligne ${i + 1} de la vérification`).join('\n'))
      await memo.evaluate((el) => {
        const ta = el as HTMLTextAreaElement
        ta.setSelectionRange(0, 0)
        ta.focus()
      })
      await openKeyboard(page, d.kb)
      // Past the pin's settle window (re-pins up to 900 ms after the keyboard opens):
      // real typing happens seconds later, and a re-pin must not be what saves the caret.
      await page.waitForTimeout(1100)
      await page.keyboard.type('x')
      await settled(page)
      await page.screenshot({ path: png('tall-memo'), fullPage: false })
      const box = await boxOf(memo)
      // Line 1 is at the box's top: that top must be on screen and above the keyboard.
      expect(box.y, 'the caret line (box top) is on-screen').toBeGreaterThanOrEqual(-1)
      expect(box.y, 'the caret line (box top) is above the keyboard').toBeLessThanOrEqual(VISIBLE - 20)
    })

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
      const add = page.getByPlaceholder('Ajouter une tâche…').first()
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
    await settled(page) // the focus-pin retries have settled
    // Anchor the selection on an early line, scroll it above the fold, then extend
    // the focus end downward like a handle drag (each extend fires selectionchange).
    const drift = await scroller.evaluate(async (el) => {
      const lines = [...el.querySelector('.note-tiptap')!.children] as HTMLElement[]
      const sel = document.getSelection()!
      sel.setBaseAndExtent(lines[2]!.firstChild ?? lines[2]!, 0, lines[20]!.firstChild ?? lines[20]!, 1)
      el.scrollTop = el.scrollHeight // the anchor line now sits far above the visible band
      const start = el.scrollTop
      for (let i = 21; i < 28; i++) {
        sel.extend(lines[i]!.firstChild ?? lines[i]!, 1)
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
    // A sequence, not a settle: the suspend's steps must land between the remeasure's own
    // 60/200 ms retries, in that order, the way a phone delivers them.
    await page.waitForTimeout(120)

    // Away. Nothing measured while hidden is trustworthy, so nothing is written.
    await page.evaluate(setHidden, true)
    await page.evaluate(shrinkBy, 620) // iOS keeps shrinking us on the way out
    await page.waitForTimeout(120) // the same sequence

    // Back — with the viewport silently restored and NO resize event of its own, which
    // is the case that used to leave the vars stuck forever.
    await page.evaluate(shrinkBy, 0)
    await page.evaluate(setHidden, false)
    await expect.poll(() => page.evaluate(kbState), 'vars cleared on the way back').toEqual({ open: false, kb: '0px' }) // remeasure's settle retries (60/200/500ms)

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

    const add = page.getByPlaceholder('Ajouter une tâche…').first()
    await add.scrollIntoViewIfNeeded()
    await add.focus()
    await openKeyboard(page, 291)
    expect(await page.evaluate(kbState), 'keyboard up').toEqual({ open: true, kb: '291px' })

    await page.evaluate(silentlyRestoreViewport)
    // Navigate the way the app does: an in-app link into a full-screen .scene.
    await page.locator('a[href="/board/departure"]').first().click()
    await expect(page.locator('.scene')).toBeVisible()
    await expect.poll(() => page.evaluate(kbState), 'vars cleared by the navigation').toEqual({ open: false, kb: '0px' }) // remeasure's settle retries (60/200/500ms)
    const band = await page.evaluate(() => {
      const body = document.querySelector('.scene__body')!
      return Math.round(window.innerHeight - body.getBoundingClientRect().bottom)
    })
    expect(band, 'the scene body reaches the bottom of the screen').toBeLessThanOrEqual(1)
  })

  test('a keyboard that is genuinely still up keeps its fit across a navigation', async ({ page }) => {
    const open = boot({ w: 390, h: 844 })
    await open(page, '/board')

    const add = page.getByPlaceholder('Ajouter une tâche…').first()
    await add.scrollIntoViewIfNeeded()
    await add.focus()
    await openKeyboard(page, 291)

    // The viewport stays shrunk — the keyboard really is there. The re-read must agree
    // with the device, not blanket-clear on every navigation.
    await page.locator('a[href="/board/departure"]').first().click()
    await expect(page.locator('.scene')).toBeVisible()
    // Proving the fit was NOT cleared: the remeasure's retries (60/200/500ms) must have run.
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

    const add = page.getByPlaceholder('Ajouter une tâche…').first()
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
    await expect.poll(() => page.evaluate(kbState), 'the next tap cleared it').toEqual({ open: false, kb: '0px' })
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

    const add = page.getByPlaceholder('Ajouter une tâche…').first()
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
})

// ── folded from kb-latch.spec.ts ──────────────────────────────────────────────
test2.describe('kb-latch', () => {
  // « Perte du footer » (Marc, 2026-08-28), caught on-device with ?kbdebug reading
  // `inner=894 vvH=576 kbInset=318 open=true … ae=BODY`: a 318-pixel "keyboard" while
  // NOTHING was focused. The bottom chrome (tab bar + ＋ FAB) is hidden by `.kb-open`,
  // so the household lost its navigation with no field on screen to explain it.
  //
  // iOS collapses the visual viewport for things that are not keyboards — the
  // screenshot preview/markup editor, the app switcher, Control Centre, a share sheet.
  // `document.hidden` catches only some of those (it stays FALSE for a screenshot
  // preview), so the shrink read exactly like a keyboard and `.kb-open` latched with no
  // event coming to heal it: every healer needs a tap, a navigation or a focus change,
  // and the 1 s watchdog only ever RE-READS — the re-read still said "shrunk".
  //
  // The missing invariant: a keyboard cannot be up if nothing that could summon one
  // holds focus.

  const PHONE = { width: 390, height: 844 }

  test2('a viewport shrink with NOTHING focused never hides the tab bar', async ({ page, app }) => {
    await installVvStub(page)
    await app.boot({ viewport: PHONE, route: '/board', wait: '.hub' })
    const tabbar = page.locator('.hubnav')
    await expect(tabbar).toBeVisible()

    // Exactly the reported shape: a keyboard-sized shrink, no focused field. This is
    // what a screenshot preview or the app switcher does to the visual viewport.
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await openKeyboard(page, 318)

    await expect(page.locator('html')).not.toHaveClass(/kb-open/)
    await expect(tabbar, 'the household must not lose its navigation to a phantom keyboard').toBeVisible()
  })

  test2('a real keyboard — a focused field — still hides the chrome and fits', async ({ page, app }) => {
    // The other side, so "never hide it" can't quietly become the fix.
    await installVvStub(page)
    await app.boot({ viewport: PHONE, route: '/board', wait: '.hub' })
    await page.locator('.add-fab').click()
    const field = page.locator('.sheet.show input:visible, .sheet.show textarea:visible, .sheet.show [contenteditable]:visible').first()
    await field.click()
    await openKeyboard(page, 318)

    await expect(page.locator('html')).toHaveClass(/kb-open/)
  })

  test2('a real keyboard survives losing its field — the fit is not dropped on a blur', async ({ page, app }) => {
    // The OTHER half of the invariant, and the one that keeps the guard honest. iOS keeps
    // the keyboard up when the focused field goes away — a sheet closing, a form
    // unmounting on save, or an in-app NAVIGATION taking the field with it. There is no
    // focused summoner then, but the keyboard is really still there, so the fit must hold.
    //
    // This is why the guard is on the RISING edge only. A first draft gated both edges;
    // it read better and was wrong, and CI said so by failing journey-keyboard.spec.ts's « a
    // keyboard that is genuinely still up keeps its fit across a navigation ». The
    // falling edge belongs to the geometry (the shrink going away) and to the healers.
    await installVvStub(page)
    await app.boot({ viewport: PHONE, route: '/board', wait: '.hub' })
    await page.locator('.add-fab').click()
    const field = page.locator('.sheet.show input:visible, .sheet.show textarea:visible, .sheet.show [contenteditable]:visible').first()
    await field.click()
    await openKeyboard(page, 318)
    await expect(page.locator('html')).toHaveClass(/kb-open/)

    // Focus leaves while the viewport stays shrunk: the keyboard is still up.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    // A clock, not a settle: the claim is that the 1 s watchdog ticks and does nothing, and only
    // its tick having passed can show that.
    await page.waitForTimeout(1500)
    await expect(page.locator('html'), 'a live keyboard must not be un-fitted by a blur').toHaveClass(/kb-open/)
  })

  // ---- The other half of the same phone screenshot ----------------------------
  //
  // The Mois grid, offline, showed THREE statements of one fact: the board's calm
  // « Hors ligne — voici la dernière version reçue » line at the top, then two
  // identical red « Le réseau n'a pas répondu · Réessayer » blocks (MonthView renders
  // LoadError above the grid AND in the day panel, both on `!data && isError`). One of
  // those retry buttons could not possibly work — there was no network to retry with.
  //
  // A failed fetch with no signal is not a surprise, it is the weather. So offline
  // LoadError drops the alarm tone and the dead button, and a screen gets ONE retry
  // door when it is genuinely online.

  test2('offline, LoadError states the fact — no alarm tone, no dead retry', async ({ page }) => {
    // Driven off the /dev/kit specimen rather than a real failed query, and that is a
    // finding in itself: going offline in the harness makes TanStack PAUSE the query,
    // so it never reaches `isError` and the photographed state (offline AND errored —
    // what you get when connectivity drops on an in-flight request) is unreachable
    // synthetically. The component's contract is the thing worth pinning anyway.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/dev/kit')
    // By NAME, never by any text in the card: a neighbouring specimen's prose mentions
    // « LoadError » on purpose, and a hasText filter matched both (red in CI, 2026-09-09).
    const entry = await openKitEntry(page, 'LoadError')
    const err = entry.locator('.load-error')
    await err.waitFor({ state: 'visible', timeout: 15_000 })

    // Online: the alarm and the hand back.
    await expect(err.locator('.status-msg')).toHaveCount(1)
    await expect(err.locator('button')).toHaveCount(1)

    // Offline: no signal is not a surprise worth an alarm COLOUR…
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await expect(err.locator('.load-error__offline')).toHaveCount(1)
    await expect(err.locator('.status-msg'), 'no alarm tone while offline').toHaveCount(0)

    // …but the retry STAYS. A first version dropped it too, reasoning that it "cannot
    // work offline" — which ignores that the person taps it when they think the signal
    // is back, and that on a surface with no poll it is the only door there is. A month
    // whose one fetch failed never retries itself (MONTH_KEY has no `live`, and the
    // client sets refetchOnWindowFocus: false), so removing the button turned a visible
    // failure into a blank calendar with no way out.
    await expect(err.locator('button'), 'the only manual door must survive going offline').toHaveCount(1)

    // …and the tone comes back when the signal does.
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(err.locator('.status-msg')).toHaveCount(1)
    await expect(err.locator('button')).toHaveCount(1)
  })

  test2('one failed query paints ONE retry door, not one per region reporting it', async ({ page }) => {
    // MonthView renders LoadError twice on the same `!data && isError` — above the grid
    // AND in the day panel — which is why the phone showed two identical red blocks.
    // Both regions still speak (each explains its own blank area); only one offers the
    // button.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await mockApi(page)
    await page.route('**/api/month**', (route) => route.fulfill({ status: 500, body: 'nope' }))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', boardView: 'month' })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })

    await expect(page.locator('.load-error').first()).toBeVisible({ timeout: 15_000 })
    expect(await page.locator('.load-error').count(), 'both blank regions say why').toBeGreaterThan(1)
    await expect(page.locator('.load-error button'), 'one retry door per screen').toHaveCount(1)
  })
})


// ── folded from composer-fit.spec.ts ──────────────────────────────────────────────
test3.describe('composer-fit', () => {
  // The same per-child right-edge check journey-capture.spec.ts uses: a composer
  // that gained a full-width line is also the shape most likely to bleed past it.

  // « Generous inside » — the counterpart to LEAN.md's chrome ratchet, and its exact
  // mirror image.
  //
  // LEAN measures a BROWSE surface: how much chrome you scroll past before the
  // content (`contentTopPx`), a ceiling that only ever moves down. It says nothing
  // about a surface you deliberately OPENED to do one thing — the ＋ sheet's
  // composer, an expanded section add box, a scene form. There, the field IS the
  // content, and the failure runs the other way: the chrome (a labeled CTA, a mic, a
  // 📎, a caret) eats the line and the text gets ~60px. That shipped — « Restants »
  // on a 390px phone showed a placeholder clipped to « Ajouter un ».
  //
  // So this file budgets the opposite direction: a FLOOR on the typing width, which
  // only ever moves UP. Tighten a floor in the same commit as the pass that earned
  // it; lowering one is the thing this file exists to prevent (say why in the commit
  // if you ever must).
  //
  // The second assertion is the one that actually reads like the bug: the field's
  // own placeholder, measured in the field's own font, must FIT. A number can drift
  // past a reviewer; « Ajouter un… » cannot.

  type Composer = {
    /** What a human calls it — this is what a failure prints. */
    name: string
    route: string
    /** The chooser tile to drill into. null = the sheet opens straight on the field. */
    mode: string | null
    /** Where the field lives once open (scoped to the shown sheet). */
    field?: string
    /** Typing-width FLOOR in px, per phone width. Measured, never invented. */
    floor: Record<number, number>
  }

  // Floors were read off a real baseline run (2026-08-26, the pass that stacked the
  // CTA) minus ~10% for font and rounding drift — never invented, exactly like
  // LEAN.md's ceilings. Each test prints the number it measured, so re-baselining
  // upward is a copy from the run log.
  //
  // The in-sheet composers, i.e. every ＋ tile that opens a field rather than
  // navigating away. `meal` is absent on purpose: it opens a day-chip picker, not a
  // text field.
  const COMPOSERS: Composer[] = [
    // The board's hoisted « Note rapide » — the fastest path in the app, and the
    // field carrying the most in-box furniture (clear ✕ + mic + 📎).
    { name: 'board ▸ note rapide', route: '/board', mode: null, field: '.addsheet__lead .edit-field__input', floor: { 360: 160, 390: 188 } },
    { name: 'board ▸ à compléter', route: '/board', mode: 'todo', floor: { 360: 150, 390: 177 } },
    { name: 'board ▸ laisse un mot', route: '/board', mode: 'mot', floor: { 360: 150, 390: 177 } },
    { name: 'liste ▸ un article', route: '/liste', mode: 'list-item', floor: { 360: 170, 390: 197 } },
    { name: 'cuisine ▸ garde-manger', route: '/kitchen', mode: 'pantry', floor: { 360: 170, 390: 197 } },
    { name: 'cuisine ▸ la réserve', route: '/kitchen', mode: 'reserve', floor: { 360: 202, 390: 229 } },
    // The one that started this pass: « ＋ À finir bientôt » is the longest CTA in
    // the app, and the box also carries the combobox caret.
    { name: 'cuisine ▸ restants', route: '/kitchen', mode: 'leftovers', floor: { 360: 150, 390: 177 } },
    // Les notes is absent on purpose (2026-09-04): the ＋ FAB now NAVIGATES straight
    // to a blank note (FORM_ROUTES.cnote) rather than opening an in-sheet composer —
    // same shape as `event`/`chore`/`routine`/`voyage`/`habit`, which this list
    // already excludes. The quick voice/text/📎 composer still exists, but only
    // behind a HOLD on the ＋ (see journey-capture.spec.ts), not a plain tap.
  ]

  // The field's usable typing width, and whether its own placeholder fits in it —
  // measured in the field's computed font via a canvas, which is what the browser
  // itself uses to lay the text out.
  async function measure(page: Page, selector: string) {
    return await page.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null
      if (!el) return null
      const cs = getComputedStyle(el)
      // offsetWidth minus borders, NOT clientWidth: Chrome 158 (Playwright 1.65) started
      // reporting an <input>'s clientWidth ~20px short of the box it actually paints —
      // pixel-identical screenshots, the whole placeholder visible, and eight floors
      // "failed" on a number that no longer meant typing width (2026-11-16).
      const inner = el.offsetWidth - parseFloat(cs.borderLeftWidth || '0') - parseFloat(cs.borderRightWidth || '0') - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0')
      const ctx = document.createElement('canvas').getContext('2d')
      let text = 0
      if (ctx) {
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        text = ctx.measureText(el.placeholder || '').width
      }
      return { width: Math.round(inner), placeholder: el.placeholder || '', placeholderPx: Math.round(text) }
    }, selector)
  }

  for (const width of [360, 390]) {
    for (const c of COMPOSERS) {
      test3(`composer keeps its typing width — ${c.name} @${width}`, async ({ page, app }) => {
        await app.boot({ viewport: { width, height: 844 } })
        await page.goto(c.route)
        await expect(page.locator('.hub__body')).toBeVisible({ timeout: 15_000 })

        await page.locator('.add-fab').click()
        await expect(page.locator('.sheet.show')).toBeVisible()

        if (c.mode) {
          const tile = page.locator(`.sheet.show .cat-pick[data-mode="${c.mode}"]`)
          // Never silently skip: a renamed/removed mode must fail loudly, or this
          // whole guard quietly stops guarding.
          await expect(tile, `the « ${c.name} » tile is missing from the ＋ sheet`).toHaveCount(1)
          await tile.click()
        }

        const field = c.field ?? '.sheet.show .addsheet__panel .edit-field__input'
        await expect(page.locator(field).first()).toBeVisible()

        await assertClean(page, `${c.name} composer`)

        const m = (await measure(page, field))!
        expect(m, `${c.name}: no field found at ${field}`).not.toBeNull()
        // Printed on every run: this is the number you read off to set a floor.
        console.log(`[composer-fit] ${c.name} @${width}: ${m.width}px typing width, placeholder « ${m.placeholder} » needs ${m.placeholderPx}px`)

        expect(
          m.width,
          `${c.name} @${width}: ${m.width}px of typing width, floor is ${c.floor[width]}px. This floor only moves UP — see the header of this file.`,
        ).toBeGreaterThanOrEqual(c.floor[width]!)

        // Minus 3: canvas metrics vs real layout differ by a couple px across
        // platforms (CI's Linux fonts measured this exact placeholder 1px wider
        // than the field and failed an honest layout). The bug this guards against
        // is tens of px over (« Ajouter un » was ~54px short) — sub-glyph slack
        // keeps the guard meaningful without a 1px cross-platform flake.
        expect(
          m.width,
          `${c.name} @${width}: the placeholder « ${m.placeholder} » needs ${m.placeholderPx}px but the field is ${m.width}px — it renders clipped.`,
        ).toBeGreaterThanOrEqual(m.placeholderPx - 3)
      })
    }
  }

  // — SCENE-FORM FIELDS, which the block above cannot reach: they are not behind the
  // ＋ sheet, they are a route you open. Same rule, same `measure()`: a field's own
  // placeholder must fit in the field.
  //
  // The bug that earned this (2026-09-10 matrix pass): the birthday row is three
  // controls — Mois · Jour · Année — and the year carried a FIXED `flex: 0 0 6.5rem`,
  // i.e. 104px for a placeholder needing ~109px. « Année (opt.) » rendered
  // « Année (o| ». A filled year fits, so the only state that was cut is the empty
  // one — the state an empty form exists to explain. `CLAUDE.md` names the fixed
  // flex-basis as the trap by name; the row wraps by container query now.
  const SCENE_FIELDS: { name: string; route: string; field: string }[] = [
    // Both of these render the SAME <BirthdayPicker>, and so does /intake — but the
    // guest intake route needs its own session, and two hosts already prove the
    // shared component. Named separately so a failure says which form you can see it on.
    // Plain names, no guillemets: glossary.test.ts scans specs for « quoted labels »
    // and requires the app to really say them — a test's own description is not copy.
    { name: 'person form birth year', route: '/cercle/person/new', field: '.cf__bday-year' },
    { name: 'pet form birth year', route: '/cercle/pet/new', field: '.cf__bday-year' },
  ]

  for (const width of [360, 390]) {
    for (const f of SCENE_FIELDS) {
      test3(`scene form keeps its placeholder readable — ${f.name} @${width}`, async ({ page, app }) => {
        await app.boot({ viewport: { width, height: 844 } })
        await page.goto(f.route)
        await expect(page.locator(f.field).first()).toBeVisible({ timeout: 15_000 })

        const m = (await measure(page, f.field))!
        expect(m, `${f.name}: no field found at ${f.field}`).not.toBeNull()
        expect(m.placeholder.length, `${f.name}: the field has no placeholder to measure`).toBeGreaterThan(0)
        console.log(`[scene-fit] ${f.name} @${width}: ${m.width}px wide, placeholder « ${m.placeholder} » needs ${m.placeholderPx}px`)

        // Same −3 slack as the composer block, for the same cross-platform reason.
        expect(
          m.width,
          `${f.name} @${width}: the placeholder « ${m.placeholder} » needs ${m.placeholderPx}px but the field is ${m.width}px — it renders clipped.`,
        ).toBeGreaterThanOrEqual(m.placeholderPx - 3)
      })
    }
  }

  // — NATIVE DATE FIELDS, which neither block above can measure: a `<input type="date">`
  // has no `placeholder` attribute. The « yyyy-mm-dd » an empty one shows is browser
  // chrome, and so is the picker button beside it — together an INTRINSIC minimum the
  // control cannot render under. It clips instead.
  //
  // The bug that earned this (2026-09-14 matrix pass, first sight of Réglages ▸ Agenda
  // below the fold): `.field--inline` lets its field shrink to nothing on purpose, so a long
  // <option> in a SELECT truncates rather than bleeding out of the form. A date input is
  // not a select. « Rentrée (premier jour) » — a long label — left its field 100px wide
  // against the 164px the control needs, while « Dernier jour » one line below got 178px
  // and rendered fine. Two identical fields, one readable, and the difference was the
  // length of the words in front of them.
  //
  // No magic floor: the control is CLONED unconstrained and asked how wide it wants to
  // be, so the number comes from the browser rather than from a guess that rots. Note
  // `scrollWidth` is NOT the measurement — it read 98 against a 98px client box on the
  // clipped field, blind to the whole defect, which is the trap CLAUDE.md names under
  // « Horizontal overflow »: a clip is invisible to a scroll check.
  const DATE_ROWS: { name: string; route: string; ready: string }[] = [
    { name: 'settings school year', route: '/settings?tab=board&lens=regler&focus=schoolYear', ready: '.operator__section' },
  ]

  for (const width of [360, 390]) {
    for (const d of DATE_ROWS) {
      test3(`a date field is never narrower than the control needs — ${d.name} @${width}`, async ({ page, app }) => {
        await app.boot({ viewport: { width, height: 844 } })
        await page.goto(d.route)
        await expect(page.locator(d.ready).first()).toBeVisible({ timeout: 15_000 })

        const fields = await page.locator('.field--inline .input[type="date"]').evaluateAll((els) =>
          els.map((el) => {
            const i = el as HTMLInputElement
            const probe = i.cloneNode(true) as HTMLInputElement
            probe.style.cssText = 'position:absolute;left:-9999px;width:auto;min-width:0;flex:none'
            document.body.appendChild(probe)
            const natural = probe.getBoundingClientRect().width
            probe.remove()
            const label = (i.closest('.field--inline')?.querySelector('span')?.textContent ?? '').trim()
            return { label, width: Math.round(i.getBoundingClientRect().width), natural: Math.round(natural) }
          }),
        )
        expect(fields.length, `${d.name}: no date row found`).toBeGreaterThan(0)
        for (const f of fields) {
          console.log(`[date-fit] ${d.name} @${width}: "${f.label}" field ${f.width}px, control wants ${f.natural}px`)
          expect(
            f.width,
            `${d.name} @${width}: the date field after "${f.label}" is ${f.width}px but the control needs ${f.natural}px — it renders clipped.`,
          ).toBeGreaterThanOrEqual(f.natural - 3)
        }
      })
    }
  }

  // — BOARD-CARD COMPOSERS, the third host, and the one where the field's width is
  // fixed by the card rather than by the page. Same rule as the two blocks above: a
  // field's own placeholder must fit in the field.
  //
  // AND IN BOTH LANGUAGES, which is the point of this block. « Ajouter à compléter… »
  // needs 160px and always fit; « Add something to complete… » needed 218px in the same
  // 213px box, so the ELLIPSIS was cut and the placeholder read « complete.. » — which
  // looks like a typo rather than an invitation. English is usually the SHORTER lens
  // here (see the note in state-matrix.spec.ts); this is the case where it is not, and
  // only an EN shot could show it — the same way the EN twin caught the truncated
  // greeting four days earlier (2026-09-14).
  const CARD_FIELDS: { name: string; card: string; field: string }[] = [
    { name: 'departure card add', card: 'departure', field: '.edit-field__input, .combo__input, input[type="text"]' },
  ]

  for (const width of [360, 390]) {
    for (const lang of ['fr', 'en'] as const) {
      for (const f of CARD_FIELDS) {
        test3(`a board composer keeps its placeholder readable — ${f.name} ${lang} @${width}`, async ({ page, app }) => {
          await page.setViewportSize({ width, height: 844 })
          await app.boot({ state: { lang } })
          await page.goto('/board')
          await page.waitForSelector('.board-grid .wg-slot')
          const card = page.locator(`.wg-slot[data-card="${f.card}"]`)
          await card.scrollIntoViewIfNeeded()

          const m = await card.locator(f.field).first().evaluate((el) => {
            const i = el as HTMLInputElement
            const cs = getComputedStyle(i)
            // offsetWidth, not clientWidth — see measure() above (Chrome 158).
            const inner = i.offsetWidth - parseFloat(cs.borderLeftWidth || '0') - parseFloat(cs.borderRightWidth || '0') - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0')
            const ctx = document.createElement('canvas').getContext('2d')!
            ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
            return { width: Math.round(inner), placeholder: i.placeholder || '', placeholderPx: Math.round(ctx.measureText(i.placeholder || '').width) }
          })
          expect(m.placeholder.length, `${f.name} ${lang}: the field has no placeholder to measure`).toBeGreaterThan(0)
          console.log(`[card-fit] ${f.name} ${lang} @${width}: ${m.width}px wide, « ${m.placeholder} » needs ${m.placeholderPx}px`)
          expect(
            m.width,
            `${f.name} ${lang} @${width}: « ${m.placeholder} » needs ${m.placeholderPx}px but the field is ${m.width}px — it renders clipped.`,
          ).toBeGreaterThanOrEqual(m.placeholderPx - 3)
        })
      }
    }
  }
})


// ── folded from focus-not-obscured.spec.ts ──────────────────────────────────────────────
test4.describe('focus-not-obscured', () => {
  // Review #17 (2026-11-17; Sam's WCAG 2.4.11 « Focus Not Obscured » and two parents' « the
  // ＋ sits on what I want to tap »): on a phone, tabbing down the board put a dozen
  // focused controls under the fixed tab bar or the floating ＋ (« Planifier aujourd'hui »,
  // « Avant de partir », « Toutes les notes »…). The body reserved the band as PADDING,
  // which only lengthens the scroll; `scroll-padding-bottom` is what makes the browser stop
  // a focused control above it.

  test4('tabbing down the phone board never leaves the focused control under the bar or the ＋', async ({ app, page }) => {
    await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE', viewport: { width: 375, height: 812 } })
    await expect(page.locator('.add-fab')).toBeVisible()
    const hidden: string[] = []
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      const hit = await page.evaluate(async () => {
        // Two frames: a card that loads late (« Mes habitudes ») can shift the layout between
        // the focus scroll and the measure — one CI run read « Marcher dehors » mid-shift.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body || !el.closest('.hub__body')) return null
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return null
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        const chrome = top?.closest('.add-fab, .hubnav')
        return chrome ? `${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30)} under ${chrome.className.split(' ')[0]}` : null
      })
      if (hit) hidden.push(hit)
    }
    expect(hidden).toEqual([])
  })
})


// ── folded from footer-clearance.spec.ts ──────────────────────────────────────────────
test.describe('footer-clearance', () => {
  // Mid-session footer-clearance sweep. The earlier screenshots.spec shoots each
  // surface fullPage at FIRST PAINT — which never reveals the real bug: on a phone
  // the section nav is a FIXED bottom bar, so any interactive element that ends up
  // under it (the "Montrer à la caisse" action row, a settings save button…) is
  // occluded once you scroll to the bottom. Here we scroll .hub__body to its end,
  // take a VIEWPORT-CLIPPED shot (fullPage would hide the overlap), and assert that
  // no button/link/input is hidden behind the fixed bar.

  type Case = { name: string; path: string; audience: Audience }

  const CASES: Case[] = [
    { name: 'board', path: '/board', audience: 'parent' },
    { name: 'kitchen', path: '/kitchen', audience: 'parent' },
    { name: 'maison', path: '/maison', audience: 'parent' },
    { name: 'notes', path: '/notes', audience: 'parent' },
    { name: 'liste', path: '/liste', audience: 'parent' },
    { name: 'settings', path: '/settings', audience: 'parent' },
    { name: 'board', path: '/board', audience: 'toddler' },
    { name: 'kitchen', path: '/kitchen', audience: 'toddler' },
    { name: 'maison', path: '/maison', audience: 'toddler' },
    { name: 'notes', path: '/notes', audience: 'toddler' },
    { name: 'liste', path: '/liste', audience: 'toddler' },
  ]

  // The mobile surface pins the nav to the bottom at EVERY width (hub.css
  // [data-surface='mobile'] .hubnav), so a portrait wall tablet (834px) can strand a
  // control under the bar just like the phone — a distinct layout worth its own pass.
  const FORMATS = [
    { name: 'phone-360', width: 360, height: 800 },
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 834, height: 1112 },
  ]

  async function settle(page: Page) {
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    await settled(page)
  }

  // Scroll the hub body (the inner scroller) all the way down and let it settle.
  async function scrollToBottom(page: Page) {
    await page.evaluate(() => {
      const body = document.querySelector('.hub__body') as HTMLElement | null
      if (body) body.scrollTop = body.scrollHeight
      // The page may itself be the scroller in some layouts — nudge #root too.
      const root = document.getElementById('root')
      if (root) root.scrollTop = root.scrollHeight
    })
    await settled(page)
  }

  // Returns the list of interactive elements a phone user can't reach after scrolling
  // to the bottom, in two flavours (each label is prefixed so the failure says which):
  //   • "under-nav: …"  — the control's visible centre is painted over by the fixed
  //                        bottom nav.
  //   • "off-right: …"  — the control extends past the right viewport edge, so its tap
  //                        target is (partly) off-screen and the layout has overflowed.
  // An empty array = every control clears the footer AND sits within the width.
  async function occludedControls(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      // A control legitimately sitting inside a horizontal scroller (subtabs, chip/tag
      // rows, timer rail) is MEANT to run past the edge — you scroll to it. Only flag
      // "off-right" when no ancestor is an actually-scrollable horizontal container.
      const inHScroller = (el: Element): boolean => {
        let p = el.parentElement
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX
          if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true
          p = p.parentElement
        }
        return false
      }
      const labelOf = (el: Element) =>
        (el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.className || el.tagName).trim().slice(0, 60)

      const body = document.querySelector('.hub__body')
      if (!body) return []
      const controls = body.querySelectorAll('button, a, input, textarea, select, [role="button"]')
      const hidden: string[] = []

      const nav = document.querySelector('.hubnav') as HTMLElement | null
      const navBox = nav?.getBoundingClientRect()
      // Only a FIXED bottom bar can occlude page content. If the nav isn't pinned to
      // the bottom (kiosk left column / narrow-width top row), the under-nav check is off.
      const barFixed = !!nav && !!navBox && getComputedStyle(nav).position === 'fixed' && navBox.top > window.innerHeight / 2

      controls.forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return // not rendered

        // Off-right: any part of the control is past the right edge and it isn't inside
        // a sideways scroller → its tap target is stranded off-screen (width overflow).
        if (r.right > window.innerWidth + 1 && !inHScroller(el)) {
          hidden.push(`off-right: ${labelOf(el)}`)
        }

        // Under-nav: centre sits within the fixed bar's band, and the nav actually
        // paints over that point (elementFromPoint is the nav / a descendant) — a
        // control merely *near* the bar isn't a bug.
        if (barFixed && navBox) {
          const cy = r.top + r.height / 2
          const cx = r.left + r.width / 2
          if (cy > navBox.top && cy < window.innerHeight) {
            const hit = document.elementFromPoint(cx, cy)
            if (hit && (nav === hit || nav.contains(hit))) hidden.push(`under-nav: ${labelOf(el)}`)
          }
        }
      })
      return [...new Set(hidden)]
    })
  }

  for (const f of FORMATS) {
    for (const c of CASES) {
      test(`footer-clearance ${f.name} ${c.name}-${c.audience}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' }) // the toddler lens floats forever otherwise
        await page.setViewportSize({ width: f.width, height: f.height })
        await mockApi(page)
        await seedState(page, { theme: 'day', audience: c.audience, lang: 'fr', calm: true, surface: 'mobile' })
        await page.goto(c.path)
        await settle(page)
        await scrollToBottom(page)
        await page.screenshot({ path: `e2e/screenshots/footer-${f.name}-${c.name}-${c.audience}-bottom.png`, fullPage: false })
        const occluded = await occludedControls(page)
        expect(occluded, `controls hidden behind the fixed bottom nav on ${c.path} [${c.audience}/${f.name}]`).toEqual([])
      })
    }
  }
})


// ── folded from sheet-scroll-lock.spec.ts ──────────────────────────────────────────────
test6.describe('sheet-scroll-lock', () => {
  // An open ＋ bottom-sheet must freeze the page BEHIND it. The document never
  // scrolls in this app — the real scrollers are #root and .hub__body — so the
  // scroll lock (useModal) freezes THOSE, not body. Without it a swipe on a tall
  // sheet (the kitchen "Planifier un repas" chooser overflows a short viewport)
  // leaked to the page behind and the sheet's lower content was unreachable.

  test6('open ＋ sheet freezes the page behind; closing releases it', async ({ page, app }) => {
    await app.boot({ viewport: { width: 412, height: 520 } }) // A short viewport (landscape-ish phone) so the kitchen ＋ sheet overflows.
    await page.goto('/kitchen')
    await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

    // Background scrolls freely while no overlay is open.
    const lockedBefore = await page.evaluate(() => document.documentElement.classList.contains('scroll-locked'))
    expect(lockedBefore).toBe(false)

    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await settled(page)

    const open = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet.show') as HTMLElement
      const hub = document.querySelector('.hub__body') as HTMLElement
      const root = document.getElementById('root') as HTMLElement
      return {
        locked: document.documentElement.classList.contains('scroll-locked'),
        hubOverflowY: getComputedStyle(hub).overflowY,
        rootOverflowY: getComputedStyle(root).overflowY,
        // The sheet itself is the one scroller now — and it really does overflow on
        // a short viewport, so its lower content is reachable by scrolling IT.
        sheetScrolls: sheet.scrollHeight > sheet.clientHeight + 1,
        sheetOverflowY: getComputedStyle(sheet).overflowY,
      }
    })
    expect(open.locked).toBe(true)
    expect(open.hubOverflowY).toBe('hidden')
    expect(open.rootOverflowY).toBe('hidden')
    expect(open.sheetScrolls).toBe(true)
    expect(open.sheetOverflowY).toBe('auto')

    // Closing the sheet must release the lock (the page must not stay frozen). Scope to
    // the shown sheet — the detail-peek sheet shell also carries a .sheet__close.
    await page.locator('.sheet.show .sheet__close').click()
    await expect(page.locator('.sheet.show')).toBeHidden()
    const lockedAfter = await page.evaluate(() => document.documentElement.classList.contains('scroll-locked'))
    expect(lockedAfter).toBe(false)
  })
})


// ── folded from zoom-overlay-portal.spec.ts ──────────────────────────────────────────────
test.describe('zoom-overlay-portal', () => {
  test.use({ hasTouch: true })

  test('cercle drawing zoom overlay portals to body and closes', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1280 })
    await mockApi(page)
    const member = { id: 'm1', displayName: 'Marc', avatarKind: 'initial', avatarRef: '', colour: '#5891AC', isChild: false, email: null, phone: null, birthday: null, notes: null, gender: 'm' }
    await page.route('**/api/cercle**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [], members: [member], links: [], groups: [] }) })
    })
    await page.route('**/api/family-notes**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        notes: [{ id: 'fn1', member_id: null, author_member_id: 'm1', title: '', text: '', media_kind: 'drawing', media_key: 'nm_fn1', scene_key: null, created_at: 1, updated_at: null }],
      }) })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })

    await page.goto('/notes')
    await expect(page.locator('.cercle-notes .cnote__thumb').first()).toBeVisible({ timeout: 15_000 })

    // Open the zoom viewer by tapping the drawing thumbnail.
    await page.locator('.cercle-notes .cnote__thumb').first().tap()
    await expect(page.locator('.zoom-overlay')).toBeVisible()

    // PORTAL: the overlay is a direct child of <body>, NOT trapped inside the note row.
    expect(await page.locator('body > .zoom-overlay').count()).toBe(1)
    expect(await page.locator('.cnote .zoom-overlay').count()).toBe(0)

    // The overlay covers the full viewport (proof it escaped the small card box).
    const box = await boxOf(page.locator('.zoom-overlay'))
    expect(box.width).toBeGreaterThan(700)
    expect(box.height).toBeGreaterThan(1100)

    // Close via ✕ and stays closed.
    await page.locator('.zoom-overlay__close').tap()
    await settled(page)
    await expect(page.locator('.zoom-overlay')).toHaveCount(0)

    // Reopen, close via backdrop, stays closed.
    await page.locator('.cercle-notes .cnote__thumb').first().tap()
    await expect(page.locator('.zoom-overlay')).toBeVisible()
    await page.locator('.zoom-overlay').tap({ position: { x: 20, y: 30 } })
    await settled(page)
    await expect(page.locator('.zoom-overlay')).toHaveCount(0)
  })
})


// ── folded from hub-width.spec.ts ──────────────────────────────────────────────
test8.describe('hub-width', () => {
  // One scrollbar gutter, not two (solidify 5.3): #root reserved 15px for a scroll that never
  // happens inside a hub, beside the real one on .hub__body. Invisible on a phone, where a
  // scrollbar has no width, and a dead strip down every tab on a desktop browser.
  test8('a hub fills the width: only its body reserves a scrollbar', async ({ page, app }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await app.boot({ route: '/kitchen', wait: '.hub' })
    const hub = await page.locator('.hub').evaluate((e) => e.getBoundingClientRect().width)
    expect(hub).toBe(1280)
  })
})
