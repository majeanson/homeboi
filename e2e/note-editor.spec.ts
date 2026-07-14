import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Every toolbar button in the full-screen rich note editor (#richnotes), driven in a
// real browser so execCommand (inline) + the flat-block transforms + checkbox + Enter
// continuation are all covered end-to-end. The pure Markdown⇄HTML layer is unit-tested
// in src/lib/noteHtml.test.ts; this proves the buttons are wired correctly.
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

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/cercle?section=notes')
  await page.getByRole('button', { name: 'Nouvelle note' }).click()
  await expect(page.locator('.note-editor')).toBeVisible()
  return page.locator('.note-editor__body')
}

test('inline buttons (bold / italic / strike) wrap the selected text', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('Hello')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')

  // execCommand emits <b>/<i>/<strike> in Chromium (our serializer maps both forms).
  await page.getByRole('button', { name: 'Gras' }).click()
  await expect(body.locator('b, strong')).toHaveText('Hello')

  // Re-select and add italic + strike on top.
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Italique' }).click()
  await expect(body.locator('i, em')).toHaveCount(1)
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Barré' }).click()
  await expect(body.locator('s, strike, del')).toHaveCount(1)
})

test('block buttons turn the line into heading / bullet / numbered / quote', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('A line')

  await page.getByRole('button', { name: 'Titre' }).click()
  await expect(body.locator('h3')).toHaveText('A line')
  await page.getByRole('button', { name: 'Titre' }).click() // toggles back to plain
  await expect(body.locator('h3')).toHaveCount(0)

  await page.getByRole('button', { name: 'Liste à puces' }).click()
  await expect(body.locator('.ne-bullet')).toHaveCount(1)
  await page.getByRole('button', { name: 'Liste numérotée' }).click()
  await expect(body.locator('.ne-number')).toHaveCount(1)
  await expect(body.locator('.ne-bullet')).toHaveCount(0) // switched, not stacked
  await page.getByRole('button', { name: 'Citation' }).click()
  await expect(body.locator('.ne-quote')).toHaveCount(1)
})

test('checklist button adds a tappable checkbox that toggles', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('Buy milk')
  await page.getByRole('button', { name: 'Case à cocher' }).click()

  const line = body.locator('.ne-check')
  await expect(line).toHaveCount(1)
  await expect(line).toHaveAttribute('data-checked', 'false')
  await line.locator('.ne-cb').click()
  await expect(line).toHaveAttribute('data-checked', 'true')
  await line.locator('.ne-cb').click()
  await expect(line).toHaveAttribute('data-checked', 'false')
})

test('Enter continues a list and an empty item ends it', async ({ page }) => {
  const body = await openEditor(page)
  await body.click()
  await page.keyboard.type('one')
  await page.getByRole('button', { name: 'Liste à puces' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await expect(body.locator('.ne-bullet')).toHaveCount(2)

  // Enter on the now-empty third item drops out of the list.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(body.locator('.ne-bullet')).toHaveCount(2)
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
  await body.click()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.type(`ligne ${i}`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type('DERNIERE')

  // The scroller actually moved…
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  // …and the last line sits inside the visible band, not below its bottom edge.
  const visible = await body.evaluate((el) => {
    const line = [...el.children].at(-1) as HTMLElement
    const l = line.getBoundingClientRect()
    const b = el.getBoundingClientRect()
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
    r.classList.add('kb-open')
    const editor = document.querySelector('.note-editor')!.getBoundingClientRect()
    const body = document.querySelector('.note-editor__body')!.getBoundingClientRect()
    // What actually receives a touch in the middle of the keyboard-covered strip?
    const behind = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - kb / 2)
    return {
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
})

test('a button works on a fresh note without first tapping the body', async ({ page }) => {
  // Bug: on a new note the title input is auto-focused, so the body has no caret. A
  // toolbar press must still land — it drops a caret on the empty line.
  const body = await openEditor(page)
  await page.getByRole('button', { name: 'Liste à puces' }).click()
  await expect(body.locator('.ne-bullet')).toHaveCount(1)
  await page.keyboard.type('milk')
  await expect(body.locator('.ne-bullet')).toHaveText('milk')
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
  await expect(body.locator('b, strong')).toHaveText('cd')
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

  // Empty title + body + no attachment → the note is discarded; the orphaned upload
  // must be freed on close (nothing else ever would).
  const del = page.waitForRequest((r) => r.url().includes('/api/note-media') && r.method() === 'DELETE')
  await page.getByRole('button', { name: 'Terminé' }).click()
  await del
  expect(deleted).toEqual(['nm_e2e_1'])
})

test('replacing a photo then saving frees only the superseded blob, not the kept one', async ({ page }) => {
  const deleted = await stubNoteMedia(page)
  await openEditor(page)
  await attachPhoto(page, 'first.png') // → nm_e2e_1
  await attachPhoto(page, 'second.png') // → nm_e2e_2 (replaces; _1 now abandoned)

  // A title makes the note non-empty so it saves (POST) with the CURRENT key (_2).
  await page.getByRole('textbox', { name: 'Titre (facultatif)' }).fill('Photo note')

  const del = page.waitForRequest((r) => r.url().includes('/api/note-media') && r.method() === 'DELETE')
  await page.getByRole('button', { name: 'Terminé' }).click()
  await del
  expect(deleted).toEqual(['nm_e2e_1']) // _2 is referenced by the saved note → kept
})

test('attaching a photo and saving frees nothing', async ({ page }) => {
  const deleted = await stubNoteMedia(page)
  await openEditor(page)
  await attachPhoto(page, 'keep.png') // → nm_e2e_1
  await page.getByRole('textbox', { name: 'Titre (facultatif)' }).fill('Keep me')

  // Cleanup (if any) is dispatched before the write, so once the POST is observed
  // no DELETE is pending — the saved blob must not be freed.
  const post = page.waitForRequest((r) => r.url().includes('/api/family-notes') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Terminé' }).click()
  await post
  expect(deleted).toEqual([])
})
