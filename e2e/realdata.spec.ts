import { test, type Page, type BrowserContext } from '@playwright/test'

// Real-data mid-session sweep (see realdata.config.ts). Logs into the deployed
// Worker with a real household, then walks each surface to its SCROLLED-TO-BOTTOM
// state and into the key overlays (cashier, add sheet, quick add, deals browser,
// recipe + cook mode), shooting VIEWPORT-CLIPPED frames so a control hidden behind
// the fixed bottom nav actually shows. Each shot also runs a footer-occlusion
// probe; results are logged (not asserted) so one bad surface never blocks the
// rest of the pass. Review e2e/screenshots/real-*.png + the console summary.

// Creds come from the environment only — never commit a password. Run with:
//   BB_EMAIL=... BB_PASSWORD=... npx playwright test -c e2e/realdata.config.ts --project=iphone
const EMAIL = process.env.BB_EMAIL
const PASSWORD = process.env.BB_PASSWORD
const PHONE = { width: 390, height: 844 }

test.describe.configure({ mode: 'serial' })
// A local, on-demand pass: skip entirely unless real creds are supplied.
test.skip(!EMAIL || !PASSWORD, 'set BB_EMAIL + BB_PASSWORD to run the real-data sweep')

async function seed(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('babillard-theme', 'day')
      localStorage.setItem('babillard-audience', 'parent')
      localStorage.setItem('babillard-lang', 'fr')
      localStorage.setItem('babillard-calm', 'on')
      localStorage.setItem('babillard-surface', 'mobile')
      // Mark the first-login guided tour as already seen, or its overlay covers
      // every page and the sweep just shoots the coachmark (see lib/tour.tsx).
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
}

const API_TARGET = process.env.BABILLARD_API_PROXY || 'https://babillard.marc-jeanson.workers.dev'

// Deterministic login: the browser FORM login flakes intermittently through the
// Vite dev proxy (a Secure-cookie / timing race — the API itself is rock solid).
// So authenticate straight against the deployed Worker, then re-plant the issued
// cookies on the dev origin (127.0.0.1) host-only + non-Secure so the browser
// keeps them over http. Every subsequent navigation is then signed in.
async function login(page: Page, context: BrowserContext) {
  const resp = await context.request.post(`${API_TARGET}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  })
  if (!resp.ok()) throw new Error(`login failed: ${resp.status()} ${await resp.text()}`)
  const cookies = resp
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => {
      const pair = h.value.split(';')[0]
      const eq = pair.indexOf('=')
      return {
        name: pair.slice(0, eq).trim(),
        value: pair.slice(eq + 1),
        domain: '127.0.0.1',
        path: '/',
        sameSite: 'Lax' as const,
      }
    })
  await context.addCookies(cookies)
  // Warm the shell so the first real navigation isn't a cold Vite compile.
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
}

async function settle(page: Page, ready = '.hub') {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(600)
}

async function scrollToBottom(page: Page) {
  await page.evaluate(() => {
    const body = document.querySelector('.hub__body') as HTMLElement | null
    if (body) body.scrollTop = body.scrollHeight
    const root = document.getElementById('root')
    if (root) root.scrollTop = root.scrollHeight
  })
  await page.waitForTimeout(400)
}

// Controls whose tappable center is painted over by the fixed bottom nav, after
// scrolling to the bottom. Empty = everything clears the footer.
async function occluded(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('.hubnav') as HTMLElement | null
    if (!nav) return []
    const navBox = nav.getBoundingClientRect()
    const fixed = getComputedStyle(nav).position === 'fixed' && navBox.top > window.innerHeight / 2
    if (!fixed) return []
    const scope = document.querySelector('.hub__body')
    if (!scope) return []
    const out: string[] = []
    scope.querySelectorAll('button, a, input, textarea, select, [role="button"]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const cy = r.top + r.height / 2
      const cx = r.left + r.width / 2
      if (!(cy > navBox.top && cy < window.innerHeight)) return
      const hit = document.elementFromPoint(cx, cy)
      if (hit && (nav === hit || nav.contains(hit))) {
        out.push((el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.className || el.tagName).trim().slice(0, 50))
      }
    })
    return [...new Set(out)]
  })
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/real-${name}.png`, fullPage: false })
  const hidden = await occluded(page)
  console.log(`[occlusion] ${name}: ${hidden.length ? '⚠ HIDDEN ' + JSON.stringify(hidden) : 'ok'}`)
}

const SURFACES = [
  { name: 'board', path: '/board' },
  { name: 'kitchen', path: '/kitchen' },
  { name: 'routines', path: '/routines' },
  { name: 'liste', path: '/liste' },
  { name: 'settings', path: '/settings' },
]

for (const s of SURFACES) {
  test(`real ${s.name} scrolled to bottom @phone`, async ({ page, context }) => {
    await seed(context)
    await page.setViewportSize(PHONE)
    await login(page, context)
    await page.goto(s.path)
    await settle(page)
    await scrollToBottom(page)
    await shoot(page, `${s.name}-bottom`)
  })
}

test('real liste overlays (cashier / quick-add / browse)', async ({ page, context }) => {
  await seed(context)
  await page.setViewportSize(PHONE)
  await login(page, context)
  await page.goto('/liste')
  await settle(page)

  // Quick add panel.
  const quick = page.locator('.list-quick')
  if (await quick.count()) {
    await quick.first().click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'e2e/screenshots/real-liste-quickadd.png', fullPage: false })
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
  }

  // Deals browser.
  const browse = page.getByRole('button', { name: /Parcourir|Browse/ })
  if (await browse.count()) {
    await browse.first().click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: 'e2e/screenshots/real-liste-browse.png', fullPage: false })
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
  }

  // Cashier (only if a deal is staged → the "Montrer à la caisse" button exists).
  const present = page.getByRole('button', { name: /Montrer|Show the cashier/ })
  if (await present.count()) {
    await present.first().click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: 'e2e/screenshots/real-cashier-review.png', fullPage: false })
    const go = page.getByRole('button', { name: /Montrer|Show the cashier/ })
    if (await go.count()) {
      await go.first().click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: 'e2e/screenshots/real-cashier-present.png', fullPage: false })
    }
  } else {
    console.log('[info] no staged deal on the real list — cashier button absent, skipped')
  }
})

test('real add sheet @phone', async ({ page, context }) => {
  await seed(context)
  await page.setViewportSize(PHONE)
  await login(page, context)
  await page.goto('/liste')
  await settle(page)
  const fab = page.locator('.add-fab')
  if (await fab.count()) {
    await fab.first().click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'e2e/screenshots/real-addsheet.png', fullPage: false })
  }
})

// The board's Mois (month) calendar with the shape-coded dots (event circle, meal
// square, chore diamond, note ring) over the real household's events/meals/chores.
test('real board month view @phone-tall', async ({ page, context }) => {
  await seed(context)
  await context.addInitScript(() => {
    try {
      localStorage.setItem('babillard-boardview', 'month')
    } catch {
      /* noop */
    }
  })
  await page.setViewportSize({ width: 390, height: 2400 })
  await login(page, context)
  await page.goto('/board')
  await settle(page)
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'e2e/screenshots/real-board-month.png', fullPage: true })
})

// ── CRUD-row sweep ──────────────────────────────────────────────────────────
// The uniform add/edit/delete pass put a RowActions pair (✏️/🗑️) on every
// manageable row. Crowding ("too much on one line") only shows under real content
// volume — long member names, long recipe/tag names, many chores. These deep-link
// each Settings sub-tab (?tab=<id> matches Operator.tsx section ids) and walk the
// Kitchen sub-tabs. The themed tabs render inside an inner scroller (.hub__body)
// with a fixed 100dvh height, so fullPage only ever captures the top — we use a
// TALL phone-WIDTH viewport instead, which keeps the (crowding-prone) phone width
// but reveals every row in one frame. Review e2e/screenshots/real-crud-*.png.
// ONE test, ONE login: walk every CRUD surface in a single session. Logging in
// per-test hammered prod with dozens of logins (intermittent auth flake on a
// reused checkout); a single session is faster and reliable.
const PHONE_TALL = { width: 390, height: 2400 }
const SETTINGS_TABS = ['household', 'agenda', 'chores', 'routines', 'recipes', 'devices', 'shopping', 'ghost']

test('real crud rows: all settings + kitchen tabs @phone-tall', async ({ page, context }) => {
  await seed(context)
  await page.setViewportSize(PHONE_TALL)
  await login(page, context)

  for (const id of SETTINGS_TABS) {
    await page.goto(`/settings?tab=${id}`)
    await settle(page, '.operator__tabs')
    await page.waitForTimeout(400)
    await page.screenshot({ path: `e2e/screenshots/real-crud-settings-${id}.png`, fullPage: true })
  }

  // Kitchen sub-tabs that carry RowActions rows: pantry (running-low) + recipes
  // (book grid). Tab order is meals(0) / pantry(1) / recipes(2).
  for (const [idx, name] of [[1, 'pantry'], [2, 'recipes']] as const) {
    await page.goto('/kitchen')
    await settle(page)
    await page.locator('.subtabs__opt').nth(idx).click().catch(() => {})
    await page.waitForTimeout(500)
    await page.screenshot({ path: `e2e/screenshots/real-crud-kitchen-${name}.png`, fullPage: true })
  }
})

test('real recipe + cook mode @phone', async ({ page, context }) => {
  await seed(context)
  await page.setViewportSize(PHONE)
  await login(page, context)
  await page.goto('/kitchen')
  await settle(page)
  // Find the recipes tab/section, open the first recipe card.
  const card = page.locator('.recipe-card').first()
  if (await card.count()) {
    await card.click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: 'e2e/screenshots/real-recipe-sheet.png', fullPage: false })
    const cook = page.getByRole('button', { name: /Cuisiner|Cook|cuisin/i })
    if (await cook.count()) {
      await cook.first().click()
      await page.waitForTimeout(700)
      await page.screenshot({ path: 'e2e/screenshots/real-cook-mode.png', fullPage: false })
    }
  } else {
    console.log('[info] no .recipe-card found on /kitchen (maybe a different tab is default)')
  }
})
