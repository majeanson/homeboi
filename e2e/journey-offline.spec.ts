import { type Page, test as test2, type Request, test as test3, test as test4, test as test7, type WebSocketRoute, test as test8, test as test10 } from '@playwright/test'
import { test, expect, test as base } from './fixtures'
import { mockApi, seedState, type Theme, BOARD } from './mocks'
import { settled } from './measure'

// JOURNEY — OFFLINE, ERRORS & RECOVERY (review #43; was error-paths.spec.ts + offline-boot.spec.ts + offline-outbox.spec.ts + recovery.spec.ts + degraded-states.spec.ts + gap-states.spec.ts + data-staleness.spec.ts + realtime.spec.ts + midsession.spec.ts + pull-to-refresh.spec.ts).
//
// « No write fails silently » (commit 6d9e18a) — pins the error surfacing on the
// three representative write paths that used to eat a server rejection:
//
//   • AddSheet: an in-sheet submit against a 4xx/5xx keeps the sheet OPEN, keeps
//     the typed text, and shows the shared `.status-msg--error` saveFailed line
//     (the sheet used to just sit there, silent).
//   • ListEditPage: save/delete against a 5xx keep the scene open + say so
//     (they used to `.catch(() => {})` then close() as if it worked).
//   • RecipeForm: a rejected POST keeps the modal open with the error in the
//     footer (it used to close via onSaved() and DROP the recipe), and the new
//     dirty-guard turns a stray backdrop/Esc close into a confirm instead of a
//     discard. NB: `.recipe-modal__scrim` is `display:none` in recipes.css (the
//     form is a full-screen route — the card IS the screen), so the guard is
//     driven through Esc here: useModal wires BOTH the scrim click and the Esc
//     key to the same requestClose, so this pins the shared path.
//
// Offline is deliberately NOT an error anywhere here: a transport failure (no
// response at all) queues through useWrite's outbox and the calm close still
// happens — the last test pins that distinction so a regression can't start
// treating a dead connection as a server "no".

test.describe('error-paths', () => {
  const SAVE_FAILED = 'Pas enregistré — réessaie.'

  // Registered AFTER mockApi, so it intercepts first; everything it doesn't fail
  // falls back to the shared mock. Toggleable so a test can re-run the same submit
  // against a healthy server and prove the recovery path (the sheet closes).
  async function failWrites(page: Page, apiPath: string, methods: string[]) {
    const state = { on: true }
    await page.route(`**/api/${apiPath}`, (route) => {
      if (state.on && methods.includes(route.request().method())) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Erreur serveur' }) })
      }
      return route.fallback()
    })
    return state
  }

  // ─────────────────────────── AddSheet (board ＋) ───────────────────────────

  test('AddSheet: a rejected quick todo add keeps the sheet open, the text, and says so', async ({ page, app }) => {
    await app.boot({ viewport: { width: 420, height: 860 }, route: '/board', wait: '.board-wall' })
    // Since 0150 the ＋ sheet's task form writes /api/tasks (lib/taskSave), not /api/todos.
    const fail = await failWrites(page, 'tasks', ['POST'])

    await page.locator('.add-fab').click()
    const sheet = page.locator('.sheet.show')
    await expect(sheet).toBeVisible()
    await sheet.locator('.cat-pick[data-mode="todo"]').click()

    const input = sheet.locator('.addsheet__todo .edit-field__input')
    await input.fill('Appeler le vétérinaire')
    await sheet.locator('.addsheet__todo').getByRole('button', { name: 'Ajouter' }).click()

    // The server said no: the sheet stays open, the typed line is NOT lost, and
    // the one shared saveFailed line is visible (it used to show nothing at all).
    const errLine = sheet.locator('.status-msg--error')
    await expect(errLine).toBeVisible()
    await expect(errLine).toContainText(SAVE_FAILED)
    await expect(sheet).toBeVisible()
    await expect(input).toHaveValue('Appeler le vétérinaire')

    // Server recovers → the SAME resubmit goes through and the sheet closes calmly.
    fail.on = false
    await sheet.locator('.addsheet__todo').getByRole('button', { name: 'Ajouter' }).click()
    await expect(page.locator('.sheet.show')).toBeHidden()
  })

  // ─────────────────────── ListEditPage (/liste/item/:id) ───────────────────────

  test('ListEditPage: a rejected save keeps the scene open with the error line', async ({ page, app }) => {
    await app.boot({ viewport: { width: 420, height: 860 }, route: '/liste/item/l2', wait: '.li-edit' }) // « Pain », from the board fixture
    await failWrites(page, 'list', ['PATCH'])

    await page.locator('.li-edit__actions .btn--primary').click() // Enregistrer

    const errLine = page.locator('.li-edit .status-msg--error')
    await expect(errLine).toBeVisible()
    await expect(errLine).toContainText(SAVE_FAILED)
    // Still ON the scene — it used to close() as if the save had landed.
    await expect(page).toHaveURL(/\/liste\/item\/l2/)
  })

  test('ListEditPage: a rejected delete (through the confirm) keeps the scene open with the error line', async ({ page, app }) => {
    await app.boot({ viewport: { width: 420, height: 860 }, route: '/liste/item/l2', wait: '.li-edit' })
    await failWrites(page, 'list', ['DELETE'])

    await page.getByRole('button', { name: 'Supprimer de la liste' }).click()
    const dialog = page.locator('.confirm')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click()

    const errLine = page.locator('.li-edit .status-msg--error')
    await expect(errLine).toBeVisible()
    await expect(errLine).toContainText(SAVE_FAILED)
    await expect(page).toHaveURL(/\/liste\/item\/l2/)
  })

  // ─────────────────────── RecipeForm (/kitchen/recipe/new) ───────────────────────

  async function bootRecipe(page: Page) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen/recipe/new')
    await expect(page.locator('.recipe-modal')).toBeVisible({ timeout: 15_000 })
  }

  test('RecipeForm: a rejected save keeps the modal open with the error in the footer', async ({ page }) => {
    await bootRecipe(page)
    await failWrites(page, 'recipes', ['POST'])

    await page.locator('.recipe-title-input').fill('Soupe aux légumes')
    await page.locator('.recipe-modal__foot button[type="submit"]').click()

    const errLine = page.locator('.recipe-modal__foot .status-msg--error')
    await expect(errLine).toBeVisible()
    await expect(errLine).toContainText(SAVE_FAILED)
    // The modal stays: closing here (the old onSaved() path) would have discarded
    // the recipe as if it saved.
    await expect(page.locator('.recipe-modal')).toBeVisible()
    await expect(page.locator('.recipe-title-input')).toHaveValue('Soupe aux légumes')
  })

  test('RecipeForm: a backdrop/Esc close on a DIRTY form asks before discarding; cancel keeps the work', async ({ page }) => {
    await bootRecipe(page)
    await page.locator('.recipe-title-input').fill('Ragoût du dimanche')

    // A stray backdrop/Esc close mid-edit — the dirty guard must intercept it.
    // (The scrim is display:none on the full-screen route, so Esc drives the same
    // shared requestClose the scrim's onClick is wired to.)
    await page.keyboard.press('Escape')
    const dialog = page.locator('.confirm')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Fermer sans enregistrer ?')

    // Cancel the discard → modal still open, title intact.
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('.recipe-modal')).toBeVisible()
    await expect(page.locator('.recipe-title-input')).toHaveValue('Ragoût du dimanche')
  })

  test('RecipeForm: a backdrop/Esc close on a PRISTINE form closes immediately (no confirm)', async ({ page }) => {
    await bootRecipe(page)

    await page.keyboard.press('Escape')
    // Nothing typed → nothing to guard: no dialog, straight back to the kitchen.
    await expect(page.locator('.recipe-modal')).toBeHidden()
    await expect(page.locator('.confirm')).toBeHidden()
    await expect(page).toHaveURL(/\/kitchen/)
  })

  // ─────────────────────── offline is NOT an error ───────────────────────

  // The distinction the whole wave rests on: a TRANSPORT failure (the request never
  // got an answer — here route.abort()) is the offline path. useWrite queues it to
  // the outbox and resolves, so the sheet closes calmly with NO error line — only a
  // server that answered 4xx/5xx (the tests above) keeps the form open and says so.
  test('AddSheet: a network-level failure queues calmly — the sheet closes, no error line', async ({ page, app }) => {
    await app.boot({ viewport: { width: 420, height: 860 }, route: '/board', wait: '.board-wall' })
    await page.route('**/api/todos', (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.fallback(),
    )

    await page.locator('.add-fab').click()
    const sheet = page.locator('.sheet.show')
    await expect(sheet).toBeVisible()
    await sheet.locator('.cat-pick[data-mode="todo"]').click()
    await sheet.locator('.addsheet__todo .edit-field__input').fill('Sortir le compost')
    await sheet.locator('.addsheet__todo').getByRole('button', { name: 'Ajouter' }).click()

    await expect(page.locator('.sheet.show')).toBeHidden()
    await expect(page.locator('.status-msg--error')).toBeHidden()
  })

  // ───────────── A READ that fails with nothing cached SAYS so (solidify 1.6) ─────────────
  //
  // Sixteen scenes wrote `if (!data) return <Loading />` by hand and sat on « Chargement… »
  // forever once the first fetch had errored — nothing retries a cold read, and a wall
  // tablet waited on a server that had already said no. La liste and La cuisine rendered
  // the EMPTY surface instead (a list with no rows), which hides real data behind a calm
  // face. Every one now goes through `loadStateOf(q)` (components/Fallback.tsx): no data +
  // error → `LoadError` with « Réessayer », and the retry is a real door. A representative
  // route per endpoint family; `src/lib/load-error-rule.test.ts` holds the rest.
  const READ_FAILS: { route: string; api: string; name: string }[] = [
    { route: '/liste', api: 'board', name: 'La liste (board)' },
    { route: '/liste/cashier', api: 'board', name: 'the cashier scene (board)' },
    { route: '/kitchen', api: 'meals', name: 'La cuisine (meals)' },
    { route: '/kitchen/recipe/rc1/cook', api: 'recipes', name: 'cook mode (recipes)' },
    { route: '/kitchen/book', api: 'recipes', name: 'the recipe book (recipes)' },
    { route: '/cercle/person/c1', api: 'cercle', name: 'a person form (cercle)' },
    { route: '/routine/r1', api: 'routines', name: 'a routine form (routines)' },
    { route: '/liste-modele/tpl1', api: 'todo-templates', name: 'a list template scene (todo-templates)' },
    { route: '/virement/new', api: 'transfers', name: 'a transfer form (transfers)' },
  ]

  for (const { route, api, name } of READ_FAILS) {
    test(`a failed cold read on ${name} shows « Réessayer », not an eternal wait or a false empty — and the retry recovers`, async ({ page }) => {
      await page.setViewportSize({ width: 420, height: 860 })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
      // Registered AFTER mockApi so it wins; only the GET fails, and only while `on`.
      const state = { on: true }
      await page.route(`**/api/${api}`, (route) => {
        if (state.on && route.request().method() === 'GET') {
          return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Erreur serveur' }) })
        }
        return route.fallback()
      })
      await page.goto(route)

      const error = page.locator('.load-error')
      await expect(error).toBeVisible({ timeout: 15_000 })
      const retry = error.getByRole('button', { name: 'Réessayer' })
      await expect(retry).toBeVisible()
      // The wait is GONE: no « Chargement… », no skeleton left behind the error line.
      await expect(page.locator('.loading')).toHaveCount(0)
      await expect(page.locator('.skeleton')).toHaveCount(0)

      // The door works: with the server back, one tap and the surface renders.
      state.on = false
      await retry.click()
      await expect(error).toBeHidden({ timeout: 15_000 })
      await expect(page.locator('.loading')).toHaveCount(0)
    })
  }
})

// ── folded from offline-boot.spec.ts ──────────────────────────────────────────────
test2.describe('offline-boot', () => {
  // Regression: the app MUST mount even when IndexedDB is broken (NFR-OFFLINE-1).
  //
  // Reported symptom: an installed iOS PWA, opened offline, showed an all-black
  // screen — the shell HTML/theme loaded (so the service worker served it fine) but
  // React never mounted, leaving an empty #root over the dark shell. Root cause: the
  // boot in src/main.tsx `await`ed restorePersistedCache() (an IndexedDB read) BEFORE
  // createRoot().render(), and on iOS a fresh-launch `indexedDB.open()` can hang with
  // no success/error/blocked event ever firing — so render() never ran. The boot now
  // caps that wait and mounts regardless; the IDB helpers also self-bound.
  //
  // These specs run on the default (dev-server) harness — no service worker needed,
  // since this is about the boot ORDER, which is identical online and offline.

  test2('the app mounts when indexedDB.open() hangs forever (iOS cold-launch bug)', async ({ page }) => {
    // Make every open() return a request whose events NEVER fire — the exact WebKit
    // hang that wedged the old boot. If the boot still gated render on this, .hub
    // would never appear and the test would time out (the original ∞-hang).
    await page.addInitScript(() => {
      const inert = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: null }
      const idb: { open: unknown } = window.indexedDB
      idb.open = () => inert
    })
    await mockApi(page)
    await seedState(page, { theme: 'night', audience: 'parent', lang: 'fr', surface: 'kiosk' })

    await page.goto('/board')

    // Mounts despite IDB never resolving — the boot cap fires and renders the shell.
    await expect(page.locator('.hub')).toBeVisible({ timeout: 10_000 })
  })

  test2('the app mounts when indexedDB is unavailable (private mode / disabled storage)', async ({ page }) => {
    // Some iOS contexts expose no usable IndexedDB (private browsing, storage off):
    // open() throws. The helpers catch it and resolve null; the app must still boot.
    await page.addInitScript(() => {
      const idb: { open: unknown } = window.indexedDB
      idb.open = () => {
        throw new Error('IndexedDB unavailable')
      }
    })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })

    await page.goto('/board')

    await expect(page.locator('.hub')).toBeVisible({ timeout: 10_000 })
  })
})


// ── folded from offline-outbox.spec.ts ──────────────────────────────────────────────
test3.describe('offline-outbox', () => {
  // The offline write OUTBOX end-to-end (REVIEW-PASS §931). A write made while offline
  // must QUEUE (never hit the network, never be lost) and REPLAY automatically when the
  // connection returns: useWrite → writeWith enqueues when navigator.onLine is false, and
  // startOutbox (wired at boot in main.tsx) replays on the 'online' event. This drives a
  // real /liste add across an offline→online transition and proves the POST fires ONLY
  // after reconnect — the core promise of NFR-OFFLINE-1 that unit tests can't observe.

  const isListPost = (r: Request) =>
    r.method() === 'POST' && new URL(r.url()).pathname === '/api/list'

  test3('a list write made offline queues in the outbox, then replays on reconnect', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/liste')

    // Count every POST /api/list so we can prove it does NOT fire while offline.
    let listPosts = 0
    page.on('request', (r) => {
      if (isListPost(r)) listPosts++
    })

    const add = page.locator('.edit-field .input').first()
    await expect(add).toBeVisible()

    // Go offline — the offline bar appearing confirms useOnline()/navigator.onLine now
    // reads false, exactly the signal writeWith checks to queue instead of send.
    await page.context().setOffline(true)
    await expect(page.locator('.offline-bar')).toBeVisible()

    await add.fill('Piles AA')
    // Enter commits — La liste's add bar dropped its « Ajouter » button (the lean pass).
    await page.locator('.edit-field .input').first().press('Enter')

    // Queued to the outbox: the offline bar shows a pending count (useOutboxCount), and
    // nothing was sent over the wire.
    await expect(page.locator('.offline-bar__stamp', { hasText: 'en attente' })).toBeVisible()
    expect(listPosts).toBe(0)

    // Reconnect → the 'online' event triggers startOutbox's replay → the held POST fires
    // now (with its idempotency key). It never fired before this moment.
    await Promise.all([
      page.waitForRequest(isListPost, { timeout: 20_000 }),
      page.context().setOffline(false),
    ])
    expect(listPosts).toBe(1)

    // And the outbox drains — the pending stamp clears once the write lands.
    await expect(page.locator('.offline-bar__stamp', { hasText: 'en attente' })).toHaveCount(0)
  })

  // B-9 (bmad/10): before the fix, only a REPLAY carried an Idempotency-Key (a fresh
  // one minted at enqueue) — a normal online write sent none. So a "response lost
  // after the server already applied it" transport failure would queue the retry
  // under a DIFFERENT key than the (never-sent) online attempt, and a genuinely
  // double-tapped write could double-apply. This drives a real transport failure
  // (not a full offline transition) while nominally online, then forces a replay,
  // and asserts both POSTs — the failed attempt and its replay — carry the exact
  // same Idempotency-Key header (the hoisted key in writeWith).
  test3('a write that fails in transit and its outbox replay carry the SAME Idempotency-Key', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    // Fail exactly the FIRST POST /api/list (simulating a dropped response), then
    // let every subsequent one (the replay) through via mockApi's normal handling.
    const idemKeys: (string | undefined)[] = []
    let failedOnce = false
    await page.route('**/api/list', async (route) => {
      const req = route.request()
      if (req.method() !== 'POST') return route.fallback()
      idemKeys.push(req.headers()['idempotency-key'])
      if (!failedOnce) {
        failedOnce = true
        await route.abort('failed')
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'newitem', text: 'Piles AAA' }),
      })
    })

    await page.goto('/liste')
    const add = page.locator('.edit-field .input').first()
    await expect(add).toBeVisible()
    await add.fill('Piles AAA')
    // Enter commits — La liste's add bar dropped its « Ajouter » button (the lean pass).
    await page.locator('.edit-field .input').first().press('Enter')

    // The transport failure queues the write to the outbox (writeWith's catch).
    await expect.poll(() => idemKeys.length, { timeout: 10_000 }).toBe(1)
    expect(idemKeys[0]).toBeTruthy()

    // Force a reconnect cycle so startOutbox's 'online' listener replays the queue
    // (we were never truly offline — this only re-fires the trigger).
    await page.context().setOffline(true)
    await page.context().setOffline(false)

    await expect.poll(() => idemKeys.length, { timeout: 20_000 }).toBe(2)
    expect(idemKeys[1]).toBe(idemKeys[0])
  })
})


// ── folded from recovery.spec.ts ──────────────────────────────────────────────
test4.describe('recovery', () => {
  // Auth-loss recovery + the first-run welcome path. Same frontend-only harness
  // as interactions-*.spec.ts: Vite dev server + stubbed /api/** (see mocks.ts).
  // mockApi({ unauthorized: true }) turns every data route into a 401 —
  // a revoked device token or a dead session, as the client sees it.

  async function settle(page: Page, ready: string) {
    await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  test4.describe('401 recovery', () => {
    test4('a paired kiosk whose token was revoked gets the re-pair screen, and re-pairing clears the token', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page, { unauthorized: true, signedIn: false })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk', paired: true })
      await page.goto('/board')
      // The shell-level recovery replaces the hub — not a per-page prompt.
      await settle(page, '.pair-lost')
      await page.locator('.pair-lost .btn--primary').click()
      await expect(page).toHaveURL(/\/pair$/)
      // The stale token is gone, so the pairing screen starts clean.
      const token = await page.evaluate(() => localStorage.getItem('babillard-device-token'))
      expect(token).toBeNull()
    })

    test4('the recovery screen survives the kid lock (?kid=1) — no URL surgery needed', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page, { unauthorized: true, signedIn: false })
      await seedState(page, { theme: 'day', lang: 'fr', calm: true, paired: true })
      await page.goto('/board?kid=1')
      // Before this screen existed, a locked kiosk with a revoked token was stuck
      // on per-page prompts with the settings tab blocked — a true dead end.
      await settle(page, '.pair-lost')
      await expect(page.locator('.pair-lost .btn--primary')).toBeVisible()
    })

    test4('an unpaired phone hitting 401 gets the login door first (pair second)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page, { unauthorized: true, signedIn: false })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/board')
      await settle(page, '.pairprompt')
      // Surface-aware doors: mobile leads with sign-in, pairing stays reachable.
      await expect(page.locator('.pairprompt .btn--primary')).toHaveAttribute('href', '/login')
      await expect(page.locator('.pairprompt a[href="/pair"]')).toBeVisible()
    })
  })

  test4.describe('first-run welcome', () => {
    test4('a fresh household sees the welcome steps in Réglages ▸ La maisonnée', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page, { fresh: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/settings?tab=household')
      await settle(page, '.operator__tabs')
      await expect(page.locator('.welcome-steps')).toBeVisible()
    })

    test4('the empty board shows the welcome checklist, and the add-family step lands on the household tab', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page, { fresh: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/board')
      // The first-run WelcomeCard: its first step ("Ajouter la famille") is the
      // next action for a brand-new household and links to Réglages ▸ Maison ▸
      // La maisonnée (the members sub-section).
      await settle(page, '.welcome-card')
      await page.locator('.welcome-card__step a').first().click()
      await expect(page).toHaveURL(/\/settings\?tab=maison&sub=members$/)
      await settle(page, '.welcome-steps')
    })
  })
})


// ── folded from degraded-states.spec.ts ──────────────────────────────────────────────
test.describe('degraded-states', () => {
  // The degraded / transient states the happy-path sweeps skip, via the new mockApi
  // levers (delay → loading, error → 500/network):
  //   • LOADING — the <Loading/> frame while the first fetch is in flight.
  //   • ERROR   — the app must SURVIVE a 500 or a dropped connection on every surface
  //               (crash-smoke beyond the 401 recovery path) and degrade, not white-screen.
  //   • TOAST   — the undo toast after an undoable action (clear-checked on the list).
  // Mock-based + Chromium, so it runs in CI.

  const PHONE = { width: 390, height: 844 }
  const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/deg-${name}.png`, fullPage: false })

  // ── 1. LOADING ───────────────────────────────────────────────────────────────
  // /liste renders <Loading/> until the board fetch lands; hold it ~2s so the frame
  // is capturable.
  for (const theme of ['day', 'night'] as Theme[]) {
    const sfx = theme === 'night' ? '-night' : ''
    test(`deg loading${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/liste', state: { theme: theme, calm: true }, api: { delay: 2000 } })
      await page.locator('.loading').waitFor({ state: 'visible', timeout: 10_000 })
      await expect(page.locator('.loading')).toBeVisible()
      await shot(page, `loading-liste-phone${sfx}`)
    })
  }

  // ── 2. ERROR (crash-smoke) ───────────────────────────────────────────────────
  // Every surface under a 500 AND a dropped connection: it must throw no pageerror
  // and paint *something* (a degraded shell), never a white screen. This is the
  // value beyond the existing 401 tests — a non-auth failure is a different path.
  const ERROR_SURFACES = ['/board', '/kitchen', '/liste', '/maison', '/notes', '/settings']
  for (const kind of ['500', 'network'] as const) {
    for (const path of ERROR_SURFACES) {
      test(`deg error-${kind}: ${path.slice(1)}`, async ({ page, app }) => {
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(e.message))
        await app.boot({ viewport: PHONE, route: path, state: { theme: 'day', calm: true }, api: { error: kind } })
        // SOMETHING must render (shell, loading, or an error/empty state) — not a blank doc.
        await page.locator('.hub, .page, main, .loading').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
        await settled(page)
        const painted = await page.evaluate(() => (document.body.innerText || '').trim().length)
        expect(painted, `${path} painted something under ${kind}`).toBeGreaterThan(0)
        await shot(page, `error-${kind}-${path.slice(1)}`)
        expect(errors, `pageerror under ${kind} on ${path}`).toEqual([])
      })
    }
  }

  // ── 3. TOAST ─────────────────────────────────────────────────────────────────
  // The undo toast (lib/toast) after a deferred removal: check a list row, then
  // « Vider les cochés » holds the delete behind the toast.
  for (const theme of ['day', 'night'] as Theme[]) {
    const sfx = theme === 'night' ? '-night' : ''
    test(`deg undo-toast${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/liste', state: { theme: theme, calm: true }, api: {} })
      await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
      await page.locator('.list-row__toggle').first().click()
      await page.getByRole('button', { name: /Vider les cochés/ }).click()
      await page.locator('.undo-toast').waitFor({ state: 'visible', timeout: 10_000 })
      await settled(page)
      await expect(page.locator('.undo-toast')).toBeVisible()
      await shot(page, `undo-toast-phone${sfx}`)
    })
  }
})


// ── folded from gap-states.spec.ts ──────────────────────────────────────────────
test.describe('gap-states', () => {
  // Screenshot-review loop — the OPENED states the mature suite still missed (audited
  // against the full inventory): the destructive CONFIRM dialog, the generic DETAIL
  // PEEK sheet, the in-app GUIDE, and the kiosk AMBIENT screensaver — each in DAY and
  // NIGHT (night is where token/contrast bugs hide and most opened states were day-
  // only). Mock-based + Chromium, so it runs in CI without creds. Also a crash-smoke
  // suite: any pageerror fails.
  const test = base.extend({
    page: async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(page)
      expect(errors, 'pageerror in an opened gap-state').toEqual([])
    },
  })

  const PHONE = { width: 390, height: 844 }
  const WALL = { width: 1280, height: 800 }
  const shot = async (page: Page, name: string) => {
    await settled(page)
    await page.screenshot({ path: `e2e/screenshots/gap-${name}.png`, fullPage: false })
  }

  // ── 1. The destructive CONFIRM dialog (useConfirm) — never screenshotted before.
  // Deleting a household member is a HEAVY delete, so it asks via the in-app confirm
  // (not the undo toast). We open the dialog and shoot it; we do NOT confirm.
  for (const theme of ['day', 'night'] as Theme[]) {
    const sfx = theme === 'night' ? '-night' : ''
    test(`gap confirm-dialog${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/settings?tab=household', state: { theme: theme, calm: true, surface: 'mobile' }, wait: '.hub, .page, main' })
      await page.getByRole('button', { name: 'Supprimer la personne' }).first().click()
      await page.locator('.confirm').waitFor({ state: 'visible', timeout: 10_000 })
      // The danger-toned dialog: message + the yes/no actions.
      await expect(page.locator('.confirm__actions')).toBeVisible()
      await shot(page, `confirm-dialog-phone${sfx}`)
    })
  }

  // ── 2. The generic DETAIL PEEK (useEntityDetail → .detail-sheet). Tap any board
  // activity row (.act__hit) → its detail sheet. The recipe peek was covered; this
  // is the shared sheet for events/chores/meals.
  for (const theme of ['day', 'night'] as Theme[]) {
    const sfx = theme === 'night' ? '-night' : ''
    test(`gap detail-peek${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: PHONE, route: '/board', state: { theme: theme, calm: true, surface: 'mobile' }, wait: '.hub, .page, main' })
      await page.locator('.act__hit').first().click()
      await page.locator('.detail-sheet').waitFor({ state: 'visible', timeout: 10_000 })
      await shot(page, `detail-peek-phone${sfx}`)
    })
  }

  // ── 3. The in-app GUIDE (the user manual, Réglages ▸ Guide) — a whole surface never
  // captured. Day + night, phone + wall (it reads as one column on phone, wider grid
  // on a wall tablet).
  for (const theme of ['day', 'night'] as Theme[]) {
    const sfx = theme === 'night' ? '-night' : ''
    for (const fmt of [{ name: 'phone', vp: PHONE, surface: 'mobile' as const }, { name: 'wall', vp: WALL, surface: 'kiosk' as const }]) {
      // Wall night is redundant with phone for the Guide's flat content; keep phone
      // both themes + wall day to bound the matrix.
      if (fmt.name === 'wall' && theme === 'night') continue
      test(`gap guide-${fmt.name}${sfx}`, async ({ page, app }) => {
        await app.boot({ viewport: fmt.vp, route: '/settings?tab=guide', state: { theme: theme, calm: true, surface: fmt.surface }, wait: '.hub, .page, main' })
        await page.locator('.guide').first().waitFor({ state: 'visible', timeout: 15_000 })
        await shot(page, `guide-${fmt.name}${sfx}`)
      })
    }
  }

  // ── 4. The kiosk AMBIENT screensaver (AmbientScreen) — the at-rest full-screen
  // clock/photo-frame, never captured. forceIdle('screensaver') dispatches the
  // bb:idle-debug CustomEvent HubLayout listens for, so we trigger it directly (no
  // waiting on the real idle timer). Kiosk surface — it's a wall-tablet behaviour.
  for (const theme of ['day', 'night'] as Theme[]) {
    const sfx = theme === 'night' ? '-night' : ''
    test(`gap ambient-screensaver${sfx}`, async ({ page, app }) => {
      await app.boot({ viewport: WALL, route: '/board', state: { theme: theme, calm: true, surface: 'kiosk' }, wait: '.hub, .page, main' })
      await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('bb:idle-debug', { detail: 'screensaver' })))
      await page.locator('.ambient').waitFor({ state: 'visible', timeout: 10_000 })
      await shot(page, `ambient-screensaver-wall${sfx}`)
    })
  }
})


// ── folded from data-staleness.spec.ts ──────────────────────────────────────────────
test7.describe('data-staleness', () => {
  // bmad/10 B-7 — "La ligne de vérité." The board must flag stale data even when
  // navigator.onLine still reads true — a captive portal, a dead uplink past the
  // router, or a Worker outage all leave the interface "online" while nothing
  // actually refreshes. `context.setOffline(true)` (journey-offline.spec.ts) only
  // covers the OTHER half (the interface itself going down); this covers the half
  // unit tests can't reach: real TanStack Query state + the real poll gear, wired
  // through OfflineBanner's second condition.
  test7('data staleness — a captive-portal outage (still "online", nothing refreshing) surfaces the calm stale bar', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })

    // Fresh load, genuinely online, data just landed → no bar of either kind.
    await expect(page.locator('.offline-bar')).toHaveCount(0)

    // Simulate the outage: every further /api/* request fails at the network layer
    // (a dropped connection, not a 4xx) — registered AFTER mockApi's own route, so
    // it wins for anything from this point on. navigator.onLine is left untouched
    // (still true) — that's the whole point of this scenario.
    await page.route('**/api/**', (route) => route.abort('failed'))

    // Install the fake clock only NOW (after the app has already booted on the real
    // clock — installing it before navigation freezes React's own real-timer-driven
    // bootstrap and the page never finishes rendering). `fastForward` (not
    // `setFixedTime`) both moves Date.now() AND actually fires the pending
    // setInterval ticks (our useDataFreshness check + TanStack's own
    // refetchInterval), which is what makes the staleness re-evaluate without
    // waiting on real wall-clock time.
    await page.clock.install()

    // Fast-forward the clock 7 minutes with no successful fetch able to land in
    // between. Past the 60 s "asleep" cutoff, the poll settles into the idle gear
    // (120 s), whose stale threshold is 3× = 6 min — 7 min is comfortably past it
    // (the exact boundary math is exhaustively covered by src/lib/online.test.ts;
    // this only proves the real wiring — the setInterval check + live TanStack
    // Query state — actually fires).
    await page.clock.fastForward('07:00')

    await expect(page.locator('.offline-bar--stale')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.offline-bar__stamp', { hasText: 'en attente' })).toHaveCount(0)
    // The stale bar is calm, not an alarm — it never claims to BE the offline banner.
    await expect(page.locator('.offline-bar')).not.toContainText('Hors ligne')
  })
})


// ── folded from realtime.spec.ts ──────────────────────────────────────────────
test8.describe('realtime', () => {
  // The realtime PUSH channel end-to-end (REVIEW-PASS §931). When another device
  // writes, the RealtimeHub Durable Object fans out an `{type:'invalidate', keys}`
  // frame over the /api/live WebSocket; the client (src/lib/realtime.ts) invalidates
  // those TanStack Query keys so open screens refetch IMMEDIATELY instead of waiting
  // for the next poll. Unit tests can't observe the socket→invalidate→refetch loop,
  // so we mock the DO with Playwright's routeWebSocket (no wrangler/D1/secrets) and
  // drive it the way a cross-device write would.
  //
  // WHY THE SIGNAL IS UNAMBIGUOUS: once the socket is OPEN, isRealtimeConnected() is
  // true, so the board poll drops to its slow safety heartbeat (60s, RT_ACTIVE_POLL_MS
  // in lib/query.ts). A change that shows up within a couple of seconds therefore
  // arrived via the push, not a poll tick.

  // La liste reads the board (BOARD_KEY) and renders board.list. We serve it from a
  // mutable holder so the test can add a row — the "other device's write" — before it
  // pushes the matching invalidate.
  async function serveBoard(page: import('@playwright/test').Page, extra: () => unknown[]) {
    // Registered AFTER mockApi so this handler wins for the board read (Playwright
    // matches the most recently added route first); every other /api/* still falls
    // through to the shared mock.
    await page.route(/\/api\/board(\?|$)/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...BOARD, list: [...BOARD.list, ...extra()] }),
      })
    })
  }

  test8('a realtime invalidate refetches the board so another device\'s write lands without waiting for the poll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })

    // Mock the RealtimeHub DO: accept the /api/live handshake WITHOUT connecting to any
    // real server (no connectToServer() → we ARE the server), so the client's socket
    // opens and isRealtimeConnected() flips true. Registered before navigation because
    // connectRealtime opens the socket at boot.
    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(/\/api\/live/, (ws) => {
      serverWs = ws
    })

    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    let extra: unknown[] = []
    await serveBoard(page, () => extra)

    await page.goto('/liste')
    await expect(page.getByText('Lait', { exact: true })).toBeVisible()
    await expect(page.getByText('Bananes E2E', { exact: true })).toHaveCount(0)

    // The socket is open once our mock server captured it — push now owns freshness and
    // the poll is a 60s heartbeat, so the change below can ONLY reach the screen via WS.
    await expect.poll(() => serverWs !== null, { timeout: 10_000 }).toBe(true)

    // Another device adds a row: the server board now includes it, and the DO fans out
    // an invalidate for the board key.
    extra = [{ id: 'lRT', text: 'Bananes E2E', source: 'manual' }]
    serverWs!.send(JSON.stringify({ type: 'invalidate', keys: [['board']] }))

    // It lands promptly — far inside the 60s realtime heartbeat, proving the WS drove
    // the refetch rather than a poll tick.
    await expect(page.getByText('Bananes E2E', { exact: true })).toBeVisible({ timeout: 8_000 })
  })

  test8('a malformed realtime frame is ignored without breaking the socket (polling-grade robustness)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })

    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(/\/api\/live/, (ws) => {
      serverWs = ws
    })

    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    let extra: unknown[] = []
    await serveBoard(page, () => extra)

    await page.goto('/liste')
    await expect(page.getByText('Lait', { exact: true })).toBeVisible()
    await expect.poll(() => serverWs !== null, { timeout: 10_000 }).toBe(true)

    // Garbage + a non-invalidate message must both be swallowed (the client JSON.parses
    // in a try/catch and type-guards `invalidate`) and leave the socket usable.
    serverWs!.send('not json {')
    serverWs!.send(JSON.stringify({ type: 'noise', hello: 'world' }))

    // A real invalidate right after still works — the bad frames didn't wedge the
    // channel or crash the page.
    extra = [{ id: 'lRT2', text: 'Bananes E2E', source: 'manual' }]
    serverWs!.send(JSON.stringify({ type: 'invalidate', keys: [['board']] }))
    await expect(page.getByText('Bananes E2E', { exact: true })).toBeVisible({ timeout: 8_000 })
  })

  // Presence dot (nav bar): the RealtimeHub DO echoes back the WHOLE household's
  // view→[memberId] map on every presence change; the nav bar shows a subtle dot
  // on a tab when someone OTHER than this device is on it. No wrangler/DO here
  // either — the mock server plays the DO's part by hand.
  test8('a presence snapshot from another device shows the nav-bar dot, and it clears when they leave', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // A picked face — presence is opt-in, tied to the same rule as write attribution
    // (lib/profile.ts): no face picked, no announce, nothing to receive either.
    await page.addInitScript(() => localStorage.setItem('babillard-profile', 'm1'))

    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(/\/api\/live/, (ws) => {
      serverWs = ws
    })

    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    await page.goto('/board')
    await expect.poll(() => serverWs !== null, { timeout: 10_000 }).toBe(true)

    const dot = page.locator('a[href="/board"] .hubnav__presence')
    await expect(dot).toHaveCount(0) // nobody else here yet

    // Another device (m2) is also on the board tab.
    serverWs!.send(JSON.stringify({ type: 'presence', byView: { today: ['m1', 'm2'] } }))
    await expect(dot).toBeVisible({ timeout: 8_000 })

    // m2 leaves (or their socket drops) — the DO's next snapshot omits them.
    serverWs!.send(JSON.stringify({ type: 'presence', byView: { today: ['m1'] } }))
    await expect(dot).toHaveCount(0)
  })
})


// ── folded from midsession.spec.ts ──────────────────────────────────────────────
test.describe('midsession', () => {
  // Mid-session sweep: the OPEN states the first-paint screenshots never show —
  // bottom sheets, full-screen portals, the cashier stepper, cook mode. Mock-based
  // + Chromium (deterministic; WebKit-on-Windows is too flaky for a loop). Writes
  // ms-*.png for review; each step guards its trigger so a missing one is skipped,
  // not fatal. Doubles as a crash-smoke suite: opening any overlay that throws a
  // pageerror fails the test (how a blank-surface render crash would surface here).
  const test = base.extend({
    page: async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(page)
      expect(errors, 'pageerror during mid-session flow').toEqual([])
    },
  })

  const PHONE = { width: 390, height: 844 }

  async function open(page: Page, path: string, theme: Theme = 'day') {
    await mockApi(page)
    await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto(path)
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    await settled(page)
  }

  const shot = async (page: Page, name: string) => {
    await settled(page)
    await page.screenshot({ path: `e2e/screenshots/ms-${name}.png`, fullPage: false })
  }

  // --- Liste overlays -------------------------------------------------------
  test('ms: liste add sheet', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/liste')
    await page.locator('.add-fab').click()
    await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
    await shot(page, 'liste-addsheet')
  })

  test('ms: liste quick add panel', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/liste')
    await page.locator('.add-fab').click() // Ajout rapide lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Ajout rapide/ }).click() // scope to sheet (page has its own shortcut behind the scrim)
    await page.locator('.scene .qa__list').waitFor({ state: 'visible' })
    await shot(page, 'liste-quickadd')
  })

  test('ms: liste deals browser', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/liste')
    await page.locator('.add-fab').click() // flyer browser lives in the ＋ sheet now
    await page.getByRole('dialog').getByRole('button', { name: /Parcourir les circulaires/ }).click()
    await page.locator('.deal-stores').first().waitFor({ state: 'visible' })
    await shot(page, 'liste-deals-browser')
  })

  test('ms: cashier grid + proof peek', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/liste')
    await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
    await page.locator('.cashier').waitFor({ timeout: 5000 })
    await shot(page, 'cashier-grid')
    // Tap a tile → the big proof peek (random-access, no sequential stepper).
    await page.locator('.cashier__tile').first().click()
    await page.locator('.bigcard').waitFor({ timeout: 5000 })
    await shot(page, 'cashier-peek')
  })

  test('ms: liste edit item sheet', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/liste')
    // The ✏️ pencil is the edit affordance now (the name/centre toggles the check);
    // it navigates to the edit scene /liste/item/:id.
    await page.locator('.list-row', { hasText: 'Pain' }).locator('.list-row__img').click()
    await page.locator('.scene .li-edit').waitFor({ state: 'visible' })
    await shot(page, 'liste-item-sheet')
  })

  // --- Kitchen overlays -----------------------------------------------------
  test('ms: kitchen add sheet', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/kitchen')
    await page.locator('.add-fab').click()
    await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
    await shot(page, 'kitchen-addsheet')
  })

  test('ms: recipe sheet + cook mode', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/kitchen')
    // Switch to the Recettes tab (role="tab"), open the first recipe card.
    await page.getByRole('tab', { name: /Recettes/ }).click().catch(() => {})
    await settled(page)
    const card = page.locator('.recipe-card').first()
    if (await card.count()) {
      // A card now navigates STRAIGHT to the full recipe view (.recipe-modal) — the old
      // browse-path detail peek was removed. Cook mode is reached from the view's Cuisiner.
      await card.click()
      await page.locator('.recipe-modal').waitFor({ state: 'visible', timeout: 15_000 })
      await shot(page, 'recipe-sheet')
      await page.locator('.recipe-actions .btn--primary').first().click() // Cuisiner
      await page.locator('.cook').waitFor({ state: 'visible' })
      await shot(page, 'cook-mode')
    }
  })

  // --- Board overlay --------------------------------------------------------
  test('ms: board add sheet', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/board')
    await page.locator('.add-fab').click()
    await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
    await shot(page, 'board-addsheet')
  })

  // A couple of night-theme overlay shots (contrast check on portals/sheets).
  test('ms: cashier grid night', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/liste', 'night')
    await page.getByRole('button', { name: /Montrer à la caisse/ }).click()
    await page.locator('.cashier').waitFor({ timeout: 5000 })
    await shot(page, 'cashier-grid-night')
  })

  test('ms: liste add sheet night', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await open(page, '/liste', 'night')
    await page.locator('.add-fab').click()
    await page.locator('.sheet.show').first().waitFor({ timeout: 5000 }).catch(() => {})
    await shot(page, 'liste-addsheet-night')
  })
})


// ── folded from pull-to-refresh.spec.ts ──────────────────────────────────────────────
test10.describe('pull-to-refresh', () => {
  // Pull-to-refresh on the hub body (bmad/12 #17).
  //
  // The gesture had to be built by hand: `html, body` are `overflow: hidden` with
  // `overscroll-behavior: none`, so the document never overscrolls and no browser
  // offers its own pull-to-refresh. See src/lib/pullToRefresh.ts.
  //
  // Playwright's touchscreen API only taps, so the drag is dispatched as raw
  // TouchEvents. That's honest here — the hook listens for exactly those.
  const PHONE = { width: 390, height: 780 }

  async function drag(page: Page, dy: number, dx = 0, release = true, from = '.hub__body') {
    await page.evaluate(
      ([dyv, dxv, rel, sel]) => {
        const el = document.querySelector('.hub__body') as HTMLElement
        // Dispatch FROM `sel` (defaults to the scroller itself) so a nested list can
        // be the touch target while the listener still sits on .hub__body.
        const src = (document.querySelector(sel as string) ?? el) as HTMLElement
        const rect = src.getBoundingClientRect()
        const x0 = rect.left + rect.width / 2
        const y0 = rect.top + 20
        const touch = (x: number, y: number) =>
          new Touch({ identifier: 1, target: src, clientX: x, clientY: y })
        const fire = (type: string, x: number, y: number) => {
          const t = touch(x, y)
          src.dispatchEvent(
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
        // Several steps, as a real finger produces — the hook only engages past a
        // small slop, and reads dx vs dy to reject a sideways swipe.
        for (let i = 1; i <= 6; i++) fire('touchmove', x0 + (dxv * i) / 6, y0 + (dyv * i) / 6)
        if (rel) fire('touchend', x0 + dxv, y0 + dyv)
      },
      [dy, dx, release, from] as const,
    )
  }

  test10.describe('pull to refresh', () => {
    test10.use({ viewport: PHONE })

    test10.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
    })

    test10('a long pull refetches; a short one and a sideways swipe do not', async ({ page }) => {
      await seedState(page, { surface: 'mobile' })
      await page.goto('/liste')
      await page.waitForSelector('.hub__body')

      // /liste reads BOARD_KEY (`GET /api/board`) — that's the query an
      // unfiltered invalidate must refetch here.
      let listCalls = 0
      page.on('request', (r) => {
        if (r.url().includes('/api/board')) listCalls++
      })

      // Short pull — under the threshold. Nothing refetches.
      await drag(page, 40)
      // Proving no refetch left: nothing marks an absence, so give it the time it would have taken.
      await page.waitForTimeout(200)
      expect(listCalls).toBe(0)

      // Mostly sideways: a Rail / SubTabs swipe living inside the body must never
      // be swallowed by the pull.
      await drag(page, 60, 200)
      // Proving no refetch left: nothing marks an absence, so give it the time it would have taken.
      await page.waitForTimeout(200)
      expect(listCalls).toBe(0)

      // A real pull, past PULL_THRESHOLD / RESISTANCE.
      await drag(page, 180)
      await expect.poll(() => listCalls, { timeout: 5000 }).toBeGreaterThan(0)
    })

    test10('the indicator opens while dragging and arms past the threshold', async ({ page }) => {
      await seedState(page, { surface: 'mobile' })
      await page.goto('/liste')
      await page.waitForSelector('.hub__body')

      // Held mid-drag (no touchend) so the indicator is observable.
      await drag(page, 180, 0, false)
      const ptr = page.locator('.hub__ptr')
      await expect(ptr).toBeVisible()
      await expect(ptr).toHaveClass(/hub__ptr--armed/)
      // It's a flow child, not an overlay: it pushes content down rather than
      // covering it, so nothing is ever hidden behind it.
      expect(await ptr.evaluate((el) => getComputedStyle(el).position)).toBe('static')
    })

    test10('a nested scroller keeps its own drag', async ({ page }) => {
      // A capped list inside the page owns any vertical drag that starts in it. Before
      // this, pulling one down while the page happened to be at its top opened the
      // refresh indicator AND preventDefault'd the list's own scroll — the list simply
      // stopped moving under the thumb, which reads as a broken app.
      await seedState(page, { surface: 'mobile' })
      await page.goto('/liste')
      await page.waitForSelector('.hub__body')

      // Build one, so the guard is tested rather than the fixture's luck.
      await page.evaluate(() => {
        const body = document.querySelector('.hub__body') as HTMLElement
        const box = document.createElement('div')
        box.id = 'nested-scroller'
        box.style.cssText = 'max-height:80px;overflow-y:auto'
        box.innerHTML = '<div style="height:600px"></div>'
        body.prepend(box)
      })
      await drag(page, 180, 0, false, '#nested-scroller')
      await expect(page.locator('.hub__ptr')).toHaveCount(0)
    })

    test10('a kiosk has no pull gesture at all', async ({ page }) => {
      // A wall tablet is glanced at, not held — and it already polls. A sleeve
      // brushing the screen must not fire a refetch.
      await seedState(page, { surface: 'kiosk' })
      await page.goto('/liste')
      await page.waitForSelector('.hub__body')
      await drag(page, 180, 0, false)
      await expect(page.locator('.hub__ptr')).toHaveCount(0)
    })
  })
})
