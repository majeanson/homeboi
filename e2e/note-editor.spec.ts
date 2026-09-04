import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The full-screen rich note editor (#richnotes), driven in a real browser so
// ProseMirror's own commands + native Enter/selection are covered end-to-end. It's
// the ONE editing surface now (2026-09-04: the classic hand-rolled contentEditable +
// its « BETA » toggle were retired — TipTap is what BETA graduated into). The pure
// Markdown⇄HTML inline layer is unit-tested in src/lib/noteHtml.test.ts and
// src/lib/noteTiptap.test.ts; this proves the toolbar/body are wired correctly.
test.use({ hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  const member = { id: 'm1', displayName: 'Marc', avatarKind: 'initial', avatarRef: '', colour: '#5891AC', isChild: false, email: null, phone: null, birthday: null, notes: null, gender: 'm' }
  await page.route('**/api/cercle**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [], members: [member], links: [], groups: [] }) })
  })
  await page.route('**/api/family-notes**', async (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [] }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'new' }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

// Opens a brand-new note directly (the ＋ FAB's own door — nav-restructure.spec.ts
// covers that it's really the FAB tap that lands here) and returns the editable
// ProseMirror surface (`.note-tiptap`) — every per-line assertion below reads its
// children, not `.note-editor__body`'s (that's the outer SCROLL container now, one
// level up; see the keyboard-fit tests below which need that outer element instead).
async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/notes?add=1')
  const body = page.locator('.note-editor .note-tiptap')
  // The body is the lazy-loaded ProseMirror chunk — wait for it to actually mount
  // (not just `.note-editor`, the shell around it) before handing it back, or a
  // caller that doesn't interact with it first (a pure layout/CSS assertion) can
  // read the DOM mid-Suspense-fallback.
  await expect(body).toBeVisible()
  return body
}

test('a brand-new note shows placeholder copy until the first character', async ({ page }) => {
  // An empty ProseMirror box has no chrome of its own, so a fresh note read as a
  // broken screen — every other add/edit field in the app (EditField) carries
  // placeholder copy. This is BOTH halves of that fix at once: the extension's
  // decoration (`is-editor-empty` + `data-placeholder`) AND the ::before rule that
  // actually paints it (styles/board/cnote-list.css) — the attribute alone renders
  // nothing, so asserting only the DOM would pass over a missing stylesheet.
  const body = await openEditor(page)
  const first = body.locator('p').first()
  await expect(first).toHaveClass(/is-editor-empty/)
  await expect(first).toHaveAttribute('data-placeholder', 'Écris quelque chose…')
  const painted = await first.evaluate((el) => getComputedStyle(el, '::before').content)
  expect(painted).toContain('Écris quelque chose')

  // …and it gets out of the way the moment there is content.
  await body.click()
  await page.keyboard.type('a')
  await expect(first).not.toHaveClass(/is-editor-empty/)
})

test('opening an existing note and closing it unchanged writes NOTHING', async ({ page }) => {
  // Auto-save used to fire on every close, and the server stamps `updated_at` on any
  // PATCH — so merely tapping a note open to READ it and closing again silently
  // bumped it to the top of the list, with nothing to explain why. Reading is not
  // editing.
  const writes: string[] = []
  await page.route('**/api/family-notes**', async (route) => {
    const m = route.request().method()
    if (m === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notes: [{ id: 'n1', title: '', text: 'Liste de rappel\nlaver l’auto', scope: 'family', member_id: null, media_kind: null, media_key: null, scene_key: null, position: 0, created_at: 1, updated_at: 1 }] }),
      })
    writes.push(m)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.goto('/notes')
  await page.getByRole('button', { name: 'Modifier' }).first().click()
  const body = page.locator('.note-editor .note-tiptap')
  await expect(body).toBeVisible()
  await expect(body).toContainText('laver')

  await page.getByRole('button', { name: 'Terminé' }).click()
  await expect(page.locator('.note-editor')).toHaveCount(0)
  // Give any in-flight write a chance to land before declaring there wasn't one.
  await page.waitForTimeout(400)
  expect(writes).toEqual([])
})

test('opening an existing note and actually changing it still saves', async ({ page }) => {
  // The other side of the guard above: skipping the no-op write must not skip a real
  // one. Same seed, one typed character.
  const patched: string[] = []
  await page.route('**/api/family-notes**', async (route) => {
    const m = route.request().method()
    if (m === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notes: [{ id: 'n1', title: '', text: 'Liste de rappel', scope: 'family', member_id: null, media_kind: null, media_key: null, scene_key: null, position: 0, created_at: 1, updated_at: 1 }] }),
      })
    if (m === 'PATCH') patched.push(JSON.parse(route.request().postData() || '{}').text)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.goto('/notes')
  await page.getByRole('button', { name: 'Modifier' }).first().click()
  const body = page.locator('.note-editor .note-tiptap')
  await expect(body).toBeVisible()
  await body.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' !')
  await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/family-notes') && r.method() === 'PATCH'),
    page.getByRole('button', { name: 'Terminé' }).click(),
  ])
  expect(patched).toEqual(['Liste de rappel !'])
})

test('inline buttons (bold / italic / strike) wrap the selected text', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('Hello')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')

  await page.getByRole('button', { name: 'Gras' }).click()
  await expect(body.locator('strong')).toHaveText('Hello')

  // Re-select and add italic + strike on top.
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Italique' }).click()
  await expect(body.locator('em')).toHaveCount(1)
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Barré' }).click()
  await expect(body.locator('s')).toHaveCount(1)
})

test('block buttons turn the line into heading / bullet / numbered / quote', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('A line')

  await page.getByRole('button', { name: 'Titre' }).click()
  await expect(body.locator('h1')).toHaveText('A line')
  await page.getByRole('button', { name: 'Titre' }).click() // toggles back to plain
  await expect(body.locator('h1')).toHaveCount(0)

  await page.getByRole('button', { name: 'Liste à puces' }).click()
  await expect(body.locator('ul > li')).toHaveCount(1)
  await page.getByRole('button', { name: 'Liste numérotée' }).click()
  await expect(body.locator('ol > li')).toHaveCount(1)
  await expect(body.locator('ul:not([data-type="taskList"]) > li')).toHaveCount(0) // switched, not stacked
  // Quote wraps a PARAGRAPH — lift back out of the list first (toggle numbered off).
  await page.getByRole('button', { name: 'Liste numérotée' }).click()
  await expect(body.locator('ol > li')).toHaveCount(0)
  await page.getByRole('button', { name: 'Citation' }).click()
  await expect(body.locator('blockquote')).toHaveCount(1)
})

test('checklist button adds a tappable checkbox; Enter continues the list', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('lait')
  await page.getByRole('button', { name: 'Case à cocher' }).click()
  const items = body.locator('ul[data-type="taskList"] > li')
  await expect(items).toHaveCount(1)

  // Toggling the checkbox is a real <input type="checkbox"> now (native, not a
  // hand-rolled widget) — tick it, then untick it.
  const checkbox = items.first().locator('input[type="checkbox"]')
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await checkbox.click()
  await expect(checkbox).not.toBeChecked()

  // Enter continues the list (ProseMirror's own list keymap); saving round-trips
  // through the SAME Markdown grammar the row list / search read.
  await page.keyboard.press('Enter')
  await page.keyboard.type('pain')
  await expect(items).toHaveCount(2)
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/family-notes') && r.method() === 'POST'),
    page.getByRole('button', { name: 'Terminé' }).click(),
  ])
  expect(JSON.parse(req.postData() || '{}').text).toBe('- [ ] lait\n- [ ] pain')
})

test('Enter continues a bullet list; an empty item ends it', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('one')
  await page.getByRole('button', { name: 'Liste à puces' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await expect(body.locator('ul > li')).toHaveCount(2)

  // Enter on the now-empty third item drops out of the list (ProseMirror's default).
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(body.locator('ul > li')).toHaveCount(2)
})

test('pasting rich HTML never executes a script and drops foreign tags', async ({ page }) => {
  // TipTap's default paste unlike the retired classic editor's forced-plain-text
  // guard: it parses clipboard HTML through the SCHEMA, so a tag the schema
  // recognizes (bold) may legitimately survive — that's a feature, not a bug. What
  // must never survive is anything outside the schema: an <img>, a link (disabled
  // in this schema), or an inline style/event attribute.
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('before ')
  await body.evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', 'pasted line one\npasted line two')
    dt.setData('text/html', '<div style="color:red"><img src=x onerror="window.__pwned=1"><b>rich</b> <a href="https://evil">link</a></div>')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(body).toContainText('rich') // the bold TEXT survives (schema-valid)…
  await expect(body.locator('img, a, [style]')).toHaveCount(0) // …the XSS surface never does
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
})

test('a button works on a fresh note without first tapping the body', async ({ page }) => {
  // The body autofocuses itself on a new note (no title field to steal focus from
  // it any more) — but a toolbar press must land even before that focus settles,
  // since every button chains `.focus()` itself.
  const body = await openEditor(page)
  await page.getByRole('button', { name: 'Liste à puces' }).click()
  await expect(body.locator('ul > li')).toHaveCount(1)
  await page.keyboard.type('milk')
  await expect(body.locator('ul > li')).toHaveText('milk')
})

test('inline format toggles off mid-sentence (start/stop bold while typing)', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('ab')
  await page.getByRole('button', { name: 'Gras' }).click() // start bold (collapsed caret)
  await page.keyboard.type('cd')
  await page.getByRole('button', { name: 'Gras' }).click() // stop bold
  await page.keyboard.type('ef')
  // Only the middle run is bold; the caret never jumped to the start on re-focus.
  await expect(body.locator('strong')).toHaveText('cd')
  await expect(body).toHaveText('abcdef')
})

test('the body never shows raw Markdown characters', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('Bold me')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Gras' }).click()
  // The visible text is the words only — no ** markers leak into the surface.
  await expect(body).toHaveText('Bold me')
  expect(await body.innerText()).not.toContain('*')
})

test('the view follows the caret — a long note keeps the line being typed in view', async ({ page }) => {
  // Bug (Marc, iOS): "si j'écris dans le bas de la page ça continue en dessous du clavier
  // au lieu de déplacer l'écran". Two causes, both fixed: `.note-editor` was `inset: 0`,
  // i.e. the LAYOUT viewport, so on iOS (where the keyboard overlays rather than shrinks
  // it) the bottom of the editor — and the caret — sat under the keyboard while the
  // browser saw it as perfectly "in view"; and nothing ever scrolled the caret inside the
  // contentEditable. A real keyboard inset can't be synthesized here, so this drives the
  // second half: type far past the body's own height and assert the caret line is still
  // inside the scroller's visible band (it wasn't — the body never scrolled at all).
  const body = await openEditor(page)
  const scroller = page.locator('.note-editor__body')
  await body.click()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.type(`ligne ${i}`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type('DERNIERE')

  // The scroller actually moved…
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  // …and the last line sits inside the visible band, not below its bottom edge.
  const visible = await page.evaluate(() => {
    const scrollEl = document.querySelector('.note-editor__body') as HTMLElement
    const line = [...document.querySelector('.note-tiptap')!.children].at(-1) as HTMLElement
    const l = line.getBoundingClientRect()
    const b = scrollEl.getBoundingClientRect()
    return { text: line.textContent, below: l.bottom - b.bottom, above: b.top - l.top }
  })
  expect(visible.text).toBe('DERNIERE')
  expect(visible.below).toBeLessThanOrEqual(0)
  expect(visible.above).toBeLessThanOrEqual(0)
})

test('with the keyboard up, the content fits the visible band but the shell still covers the page', async ({ page }) => {
  // The other half of the same bug. On iOS the keyboard OVERLAYS the layout viewport, so
  // an `inset: 0` editor keeps full height and its bottom third is simply behind the
  // keyboard. viewportVars publishes the visible band as --vvt/--kb + `.kb-open`; the
  // editor's CONTENT must fit that band — but the SHELL must stay full-size: an earlier
  // fix shrank the whole fixed shell, which un-covered the keyboard's strip and turned it
  // into a live, scrollable window onto the cercle page behind.
  // Playwright can't raise a real keyboard, so we publish exactly what viewportVars would.
  await openEditor(page)
  const KB = 420
  // Publish + measure in ONE evaluate: viewportVars re-measures the (keyboard-less) real
  // viewport on a timer after any focus change and would clear `.kb-open` under us.
  const m = await page.evaluate((kb) => {
    const r = document.documentElement
    const visible = window.innerHeight - kb
    r.style.setProperty('--vvh', `${visible}px`)
    r.style.setProperty('--vvt', '0px')
    r.style.setProperty('--kb', `${kb}px`)
    r.style.setProperty('--kb-fixed', `${kb}px`) // what viewportVars publishes for fixed shells (unglued: = --kb)
    r.classList.add('kb-open')
    const editor = document.querySelector('.note-editor')!.getBoundingClientRect()
    const bodyEl = document.querySelector('.note-editor__body') as HTMLElement
    const body = bodyEl.getBoundingClientRect()
    // What actually receives a touch in the middle of the keyboard-covered strip?
    const behind = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - kb / 2)
    // Trailing scroll SLACK: with the caret on the LAST line, the line sits flush
    // with the box bottom at max scroll — exactly at the keyboard top, under the
    // iOS floating accessory pill. Without slack no scroll can lift it (on-device
    // kbdebug: civ below=72 moved=0). The slack IS the scroll room.
    const slack = parseFloat(getComputedStyle(bodyEl).paddingBottom)
    return {
      slack,
      visible,
      full: window.innerHeight,
      editorH: editor.height,
      editorBottom: editor.bottom,
      bodyBottom: body.bottom,
      bodyH: body.height,
      stripOwner: behind?.closest('.note-editor') ? 'editor' : (behind?.className ?? 'nothing'),
    }
  }, KB)

  // The shell keeps covering the WHOLE page — the strip under the keyboard included…
  expect(Math.round(m.editorH)).toBe(m.full)
  expect(m.editorBottom).toBeGreaterThanOrEqual(m.full - 1)
  expect(m.stripOwner, 'the keyboard strip belongs to the editor, not the page behind').toBe('editor')
  // …while the editing surface fits inside the visible band (the toolbar/footer didn't eat it).
  expect(m.bodyBottom).toBeLessThanOrEqual(m.visible)
  expect(m.bodyH).toBeGreaterThan(80)
  // …and the body has trailing scroll slack, so a caret on the LAST line can still
  // be lifted above the keyboard + the iOS accessory pill (≥ 64 + 24 + margin).
  expect(m.slack).toBeGreaterThanOrEqual(100)
})

// ── Media-attachment orphan cleanup (REVIEW-PASS theme 5) ────────────────────────
// The editor uploads a photo/drawing to R2 the instant it's attached, but the blob
// isn't "owned" until a saved row references it. So an in-editor REPLACE / REMOVE, or
// DISCARDING a new note that had an attachment, would orphan the uploaded blob forever
// (no row-delete ever frees it). On close the editor frees every key it uploaded this
// session that the saved note won't reference, via DELETE /api/note-media. These specs
// drive that end-to-end: distinct keys per upload + capture the cleanup DELETEs.

// 1×1 transparent PNG — resizeImage degrades to "upload as-is" if it can't decode, so
// the exact bytes don't matter; the upload (→ a key) is what we exercise.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

// Serve an INCREMENTING key per upload (nm_e2e_1, _2, …) and record every cleanup
// DELETE'd key, so a test can assert exactly which blobs got freed. Overrides the
// shared mock's fixed-key note-media stub (last route registered wins).
async function stubNoteMedia(page: import('@playwright/test').Page) {
  const deleted: string[] = []
  let n = 0
  await page.route('**/api/note-media**', async (route) => {
    const m = route.request().method()
    if (m === 'POST') {
      n += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: `nm_e2e_${n}`, kind: 'image' }) })
    }
    if (m === 'DELETE') {
      try {
        const key = JSON.parse(route.request().postData() || '{}').key
        if (key) deleted.push(key)
      } catch {
        /* no body */
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  return deleted
}

async function attachPhoto(page: import('@playwright/test').Page, name: string) {
  await page.locator('.note-editor input[type="file"]').setInputFiles({ name, mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.note-editor__attach')).toBeVisible() // upload done, key tracked
}

test('removing an attached photo then discarding the note frees the uploaded blob', async ({ page }) => {
  const deleted = await stubNoteMedia(page)
  await openEditor(page)
  await attachPhoto(page, 'a.png') // → nm_e2e_1

  await page.getByRole('button', { name: 'Retirer' }).click()
  await expect(page.locator('.note-editor__attach')).toHaveCount(0)

  // Empty body + no attachment (no title field any more either) → the note is
  // discarded; the orphaned upload must be freed on close (nothing else ever would).
  const del = page.waitForRequest((r) => r.url().includes('/api/note-media') && r.method() === 'DELETE')
  await page.getByRole('button', { name: 'Terminé' }).click()
  await del
  expect(deleted).toEqual(['nm_e2e_1'])
})

test('replacing a photo then saving frees only the superseded blob, not the kept one', async ({ page }) => {
  const deleted = await stubNoteMedia(page)
  const body = await openEditor(page)
  await attachPhoto(page, 'first.png') // → nm_e2e_1
  await attachPhoto(page, 'second.png') // → nm_e2e_2 (replaces; _1 now abandoned)

  // Typed text makes the note non-empty so it saves (POST) with the CURRENT key (_2).
  await body.click()
  await page.keyboard.type('Photo note')

  const del = page.waitForRequest((r) => r.url().includes('/api/note-media') && r.method() === 'DELETE')
  await page.getByRole('button', { name: 'Terminé' }).click()
  await del
  expect(deleted).toEqual(['nm_e2e_1']) // _2 is referenced by the saved note → kept
})

test('attaching a photo and saving frees nothing', async ({ page }) => {
  const deleted = await stubNoteMedia(page)
  const body = await openEditor(page)
  await attachPhoto(page, 'keep.png') // → nm_e2e_1
  await body.click()
  await page.keyboard.type('Keep me')

  // Cleanup (if any) is dispatched before the write, so once the POST is observed
  // no DELETE is pending — the saved blob must not be freed.
  const post = page.waitForRequest((r) => r.url().includes('/api/family-notes') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Terminé' }).click()
  await post
  expect(deleted).toEqual([])
})
