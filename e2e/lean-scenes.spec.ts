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
