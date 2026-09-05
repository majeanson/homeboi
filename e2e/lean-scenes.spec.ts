import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The 2026-08-26 lean pass over the scenes the state matrix had never opened. Each
// test here pins ONE find, so a regression names itself instead of showing up as a
// budget failure with no story:
//
//   /search             the count and « Demander à l'IA » share one line, and the CTA
//                       no longer camps above every result (246 → 151px).
//   /kitchen/recipe/:id a recipe that STATES its servings shows one scaling control,
//                       not two (243 → 209px) — one that doesn't keeps its presets.
//   /home-project/new   the name field leads, the « Courants » presets that FILL it
//                       sit under it (159 → 17px, matching every other form scene).
//   /cercle/carnet/:id  four full-width « ＋ Ajouter … » bars became the shared
//                       SectionAdd ＋ in each section header (the day-page anatomy).
//   /voyage/:id       the itinerary showed an OPEN composer under every single day —
//                       an 8-day trip opened as ~1400px of empty add boxes. One ＋ per
//                       day header now, one composer at a time.
//   /liste/circulaires  the header subtitle that repeated the empty state is gone.
//
// See LEAN.md, and the budgets in e2e/state-matrix.spec.ts.

async function boot(page: Page, overrides?: Record<string, unknown>) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await mockApi(page, { overrides })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
}

// ── /search ─────────────────────────────────────────────────────────────────────

test('search puts the count and « Demander à l’IA » on ONE line, above the results', async ({ page }) => {
  await boot(page)
  await page.goto('/search?q=spag')
  await expect(page.locator('.search__row').first()).toBeVisible({ timeout: 15_000 })

  const meta = page.locator('.search__meta')
  await expect(meta.locator('.search__count')).toHaveCount(1)
  await expect(meta.locator('.search__ask')).toHaveCount(1)

  // One line, not two: their vertical centres agree.
  const count = await meta.locator('.search__count').boundingBox()
  const ask = await meta.locator('.search__ask').boundingBox()
  const row = await page.locator('.search__row').first().boundingBox()
  expect(count && ask && row).toBeTruthy()
  expect(Math.abs(count!.y + count!.height / 2 - (ask!.y + ask!.height / 2))).toBeLessThan(12)
  // …and the whole line sits above the first hit (it is a header, not a footer).
  expect(ask!.y + ask!.height).toBeLessThanOrEqual(row!.y + 1)
})

// ── /kitchen/recipe/:id ─────────────────────────────────────────────────────────

test('a recipe that states its servings shows ONE scaling control, not two', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen/recipe/rc1')
  await expect(page.locator('.recipe-view__ings li').first()).toBeVisible({ timeout: 15_000 })
  // The stepper says it in portions — which is what you want to know.
  await expect(page.locator('.recipe-scale')).toHaveCount(1)
  await expect(page.locator('.recipe-mult')).toHaveCount(0)
})

test('a recipe with NO stated servings keeps its ×½ ×1 ×2 ×3 presets', async ({ page }) => {
  // The presets are that recipe's whole scaling control — this is the case the fix
  // above must not cargo-cult onto (LEAN.md invariant 3).
  await boot(page, {
    recipes: {
      recipes: [
        {
          id: 'rcX',
          title: 'Sauce à spag',
          ingredients: ['1 pot de sauce tomate', '500 g de bœuf haché'],
          steps: ['Mijoter 20 minutes.'],
          servings: null,
          prepMin: null,
          cookMin: null,
          totalMin: null,
          notes: null,
          source: null,
          image: null,
          tags: [],
          updatedAt: 1_700_000_000,
        },
      ],
    },
  })
  await page.goto('/kitchen/recipe/rcX')
  await expect(page.locator('.recipe-view__ings li').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.recipe-scale')).toHaveCount(0)
  await expect(page.locator('.recipe-mult')).toHaveCount(1)
})

// ── /home-project/new ───────────────────────────────────────────────────────────

test('the project form leads with its name, not with the presets that fill it', async ({ page }) => {
  await boot(page)
  await page.goto('/home-project/new')
  const field = page.locator('.edit-field__input').first()
  await expect(field).toBeVisible({ timeout: 15_000 })
  const chips = page.locator('.picker-chips').first()
  await expect(chips).toBeVisible()

  const f = await field.boundingBox()
  const c = await chips.boundingBox()
  expect(f && c).toBeTruthy()
  expect(f!.y).toBeLessThan(c!.y)

  // They still fill it in one tap — the move must not have cost the feature.
  await chips.getByRole('button').first().click()
  await expect(field).not.toHaveValue('')
})

// ── /cercle/carnet/:id ──────────────────────────────────────────────────────────

const CARNET_FIXTURE = {
  carnets: {
    carnets: [
      {
        id: 'c1',
        parentId: null,
        kind: 'home',
        name: 'La maison',
        mediaKey: null,
        color: '#8a7fd0',
        facts: null,
        installedAt: null,
        lifespanMonths: null,
        linkId: null,
        notes: null,
        sort: 0,
      },
    ],
    soon: [],
  },
}

test('a carnet carries its ＋ in each section header, not as a bar under each list', async ({ page }) => {
  await boot(page, CARNET_FIXTURE)
  await page.goto('/cercle/carnet/c1')
  await expect(page.locator('.carnet-block').first()).toBeVisible({ timeout: 15_000 })

  // Ses choses · Historique · Entretien · En cas de pépin — four ＋ chips, all in
  // their header. (Identité has none: it is edited from the scene's ⋯ menu.)
  await expect(page.locator('.carnet-block .sec-label .sec-label__actbtn')).toHaveCount(4)
  // …and none of the old full-width add bars survive.
  await expect(page.locator('.carnet-block > .btn--ghost')).toHaveCount(0)

  // The ＋ still opens what it always opened.
  await page.locator('.carnet-block').filter({ hasText: 'Ses choses' }).locator('.sec-label__actbtn').click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('a read-only guest gets a carnet with no ＋ at all', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { signedIn: false, overrides: CARNET_FIXTURE })
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/cercle/carnet/c1')
  await expect(page.locator('.carnet-block').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.sec-label__actbtn')).toHaveCount(0)
})

// ── /voyage/:id ▸ Itinéraire ────────────────────────────────────────────────────

const FUTURE = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000) + 20 * 86_400
})()
const TRIP = {
  trips: {
    trips: [
      {
        id: 'tp1',
        title: 'Gaspésie',
        destination: 'Percé',
        // A five-day trip, in the FUTURE (a finished trip opens on its album, not its
        // itinerary): five composers is exactly the shape this fix is about.
        start_at: FUTURE,
        end_at: FUTURE + 4 * 86_400,
        members: [],
        media_kind: null,
        media_key: null,
        colour: '#2a8f85',
        notes: null,
        position: 0,
        created_at: 1_700_000_000,
        updated_at: null,
      },
    ],
  },
  'trip-notes': { notes: [] },
}

test('the itinerary shows ONE ＋ per day, not a composer under every day', async ({ page }) => {
  await boot(page, TRIP)
  await page.goto('/voyage/tp1')
  const days = page.locator('.voyage-itin__day')
  await expect(days).toHaveCount(5, { timeout: 15_000 })

  // Five days, five ＋ chips, ZERO open composers. It used to be five open ones —
  // field + a full-width « ＋ Ajouter » + « Ajouter un document » each, ~180px apiece.
  await expect(page.locator('.voyage-itin__day .sec-label__actbtn')).toHaveCount(5)
  await expect(page.locator('.trip-note-add')).toHaveCount(0)

  // …so the whole itinerary fits where one day's composer used to sit.
  const first = await days.first().boundingBox()
  const last = await days.last().boundingBox()
  expect(last!.y + last!.height - first!.y).toBeLessThan(400)

  // The ＋ opens ONE day's composer, focused, and only that one.
  await days.nth(2).locator('.sec-label__actbtn').click()
  await expect(page.locator('.trip-note-add')).toHaveCount(1)
  await expect(days.nth(2).locator('.trip-note-add input.input')).toBeFocused()

  // Opening another day closes the first — one composer at a time.
  await days.nth(0).locator('.sec-label__actbtn').click()
  await expect(page.locator('.trip-note-add')).toHaveCount(1)
  await expect(days.nth(0).locator('.trip-note-add')).toHaveCount(1)
})

// ── /liste/circulaires ──────────────────────────────────────────────────────────

test('the flyer scene drops the subtitle its own empty state already says', async ({ page }) => {
  await boot(page)
  await page.goto('/liste/circulaires')
  await expect(page.locator('.deal-tabs')).toBeVisible({ timeout: 15_000 })
  // The header says the name once; the field's placeholder and the empty state below
  // carry the instruction (and the empty state alone explains the chips).
  await expect(page.locator('.scene__head')).not.toContainText('en aubaine cette semaine')
  await expect(page.getByText('Cherche un article, ou touche une suggestion.')).toBeVisible()
})

// ── /board ▸ « Aujourd'hui » ─────────────────────────────────────────────────────
// The card opened with THREE full-width labelled pills — « Planifier aujourd'hui »,
// « Préparer le repas · <plat> », « Avant de partir » — before a single fact about the
// day. Two of the three were already small discs in the card's own header, so the body
// was mostly a duplicate of the chrome above it. « Demain » had the same shape with one
// pill. The doors live in the header now; the body is the day.
test("« Aujourd'hui » leads with the day, not with a stack of buttons", async ({ page }) => {
  await boot(page)
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible' })
  const card = page.locator('.wg-slot[data-card="today"]')
  await expect(card).toBeVisible()

  // No pill row in the body…
  await expect(card.locator('.board-actions')).toHaveCount(0)
  // …and the doors are all in the header, as discs.
  const discs = card.locator('.sec-label__act > *')
  await expect(discs).toHaveCount(3) // plan · cook · before-you-leave
  await expect(card.getByLabel(/Planifier aujourd/)).toBeVisible()
  await expect(card.getByLabel(/Avant de partir/)).toBeVisible()

  // Each disc holds the 44px touch floor and does not eat its neighbour's: the visible
  // circle is 28px, widened by an invisible ::after, so the GAP has to be ≥ 2× that
  // bleed or the later button swallows a slice of the one before it.
  const gaps = await discs.evaluateAll((els) => {
    const r = els.map((e) => e.getBoundingClientRect())
    return r.slice(1).map((b, i) => Math.round(b.left - r[i]!.right))
  })
  for (const g of gaps) expect(g, 'discs must not overlap their 44px targets').toBeGreaterThanOrEqual(16)
})

test('« Demain » does the same — one door, in the header', async ({ page }) => {
  await boot(page)
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible' })
  const card = page.locator('.wg-slot[data-card="tomorrow"]')
  await expect(card).toBeVisible()
  await expect(card.locator('.board-actions')).toHaveCount(0)
  await expect(card.locator('.sec-label__act > *')).toHaveCount(1)
  await expect(card.getByLabel(/Planifier demain/)).toBeVisible()
})

test('on a 320px phone the doors take their own line rather than push the row off screen', async ({ page }) => {
  // Three 44px touch targets are 132px whatever diameter you draw inside them. At
  // 320px that leaves ~53px for a 94px title, so the header cannot fit on one line —
  // and it bled off the screen (CI: layout-overflow « lo-board-w320 »). It wraps now:
  // title whole, doors whole, hard right on the second line. Nothing clipped, nothing
  // unreachable, one extra row of header on the phones that need it.
  await boot(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible' })
  const head = page.locator('.wg-slot[data-card="today"] .sec-label').first()
  await expect(head).toBeVisible()
  const m = await head.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const b = el.querySelector('b')!
    const act = el.querySelector('.sec-label__act')!.getBoundingClientRect()
    return {
      titleClipped: b.scrollWidth > b.clientWidth + 1,
      actWrapped: act.top - r.top > 8,
      actRightGap: r.right - act.right,
      actPastEdge: act.right - r.right,
    }
  })
  expect(m.titleClipped, 'the title reads in full').toBe(false)
  expect(m.actWrapped, 'the doors moved to their own line').toBe(true)
  expect(m.actRightGap, 'and stayed hard right').toBeLessThan(2)
  expect(m.actPastEdge, 'nothing bleeds off the header').toBeLessThanOrEqual(0)
})
