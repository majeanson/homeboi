import { test, expect, type Page } from '@playwright/test'
import { MMID, mockApi, seedState } from './mocks'
import { boxOf } from './measure'

// « Les virements » — the second face of Les notes (?section=virements): the standing
// agreement, the folded catch-up math, the history, and the composer that writes the
// bank message.
//
// The one thing this feature exists to remove is hand arithmetic every two weeks, so
// the assertions that matter are: the composer arrives with the unpaid dates ALREADY
// ticked, the total is derived, and the memo is the exact string that goes to the bank.

const DAY = 86_400
// Household-local midnights around the frozen clock (MMID = Sunday 8 June 2025).
// Two past due dates in DIFFERENT months, so the memo has to group them — the case a
// single-month fixture would never exercise.
const DUE_MAY = MMID - 14 * DAY // 25 mai 2025
const DUE_JUN = MMID //  8 juin 2025
const DUE_NEXT = MMID + 14 * DAY // 22 juin 2025

const PLAN = {
  id: 'p1',
  title: 'Hypothèque',
  amountCents: 81282,
  recur: { freq: 'weekly', interval: 2 },
  anchorAt: DUE_MAY,
  shares: { m1: 25641, m2: 55641 },
  catchup: { behindMemberId: 'm2', gapCents: 7_200_000, asOf: DUE_MAY, termEnd: MMID + 365 * DAY },
  colour: null,
  position: 0,
  due: [DUE_MAY, DUE_JUN, DUE_NEXT],
  projection: {
    behindMemberId: 'm2',
    aheadMemberId: 'm1',
    gapCents: 7_200_000,
    asOf: DUE_MAY,
    termEnd: MMID + 365 * DAY,
    extraPerPayment: 30_000,
    paymentsSoFar: 0,
    caughtUpCents: 0,
    remainingCents: 7_200_000,
    paymentsLeft: 26,
    projectedRemainingCents: 6_420_000,
  },
}

const SENT_WITH_TOPUP = {
  id: 't0',
  memberId: 'm2',
  sentAt: MMID - 30 * DAY,
  lines: [{ kind: 'topup', amountCents: 200000 }],
  totalCents: 200000,
  memo: 'renflou 2000',
  reference: null,
  note: null,
}

const SENT = {
  id: 't1',
  memberId: 'm2',
  sentAt: MMID - 30 * DAY,
  lines: [{ kind: 'plan', planId: 'p1', dueAt: MMID - 28 * DAY, amountCents: 55641 }],
  totalCents: 55641,
  memo: 'Hypotheque 11 mai',
  reference: 'CArR4A3Q',
  note: null,
}

interface Opts {
  plans?: unknown[]
  transfers?: unknown[]
  guest?: boolean
  viewport?: { width: number; height: number }
}

const posted: { path: string; method: string; body: unknown }[] = []

async function openVirements(page: Page, opts: Opts = {}) {
  posted.length = 0
  await page.setViewportSize(opts.viewport ?? { width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/transfer**', async (route) => {
    const method = route.request().method()
    const path = new URL(route.request().url()).pathname
    if (method !== 'GET') {
      posted.push({ path, method, body: JSON.parse(route.request().postData() || '{}') })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'new1' }) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        today: MMID,
        plans: opts.plans ?? [PLAN],
        transfers: opts.transfers ?? [SENT],
      }),
    })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/notes?section=virements')
}

test('the Notes tab has two faces, and the money one is the second', async ({ page }) => {
  await openVirements(page)
  const tabs = page.locator('.subtabs')
  await expect(tabs).toBeVisible()
  await expect(tabs.getByRole('tab', { name: 'Virements' })).toBeVisible()
  await expect(page.locator('.virements')).toBeVisible()

  // Back to the notes face, and the URL follows (a deep link must land where it says).
  await tabs.getByRole('tab', { name: 'Les notes' }).click()
  await expect(page.locator('.cercle-notes')).toBeVisible()
  await expect(page.locator('.virements')).toHaveCount(0)
})

test('the agreement shows WHO sends WHAT — faces and amounts, never a ranking', async ({ page }) => {
  await openVirements(page)
  const card = page.locator('.virements__plan')
  await expect(card).toBeVisible()
  await expect(card.getByText('Hypothèque')).toBeVisible()
  // Both shares, each beside its own face.
  await expect(card.locator('.virements__share', { hasText: 'Maman' })).toContainText('256,41')
  await expect(card.locator('.virements__share', { hasText: 'Papa' })).toContainText('556,41')
  // Calm: no total, no comparison, no percentage anywhere on the card.
  await expect(card).not.toContainText('%')
})

test('« La math » is FOLDED by default and opens to plain sentences — no chart', async ({ page }) => {
  await openVirements(page)
  const math = page.locator('.virements__math')
  await expect(math).toBeVisible()
  // Closed on arrival: the between-people number never greets anyone.
  await expect(math.locator('p')).toHaveCount(0)

  await math.getByRole('button', { name: 'La math' }).click()
  await expect(math.locator('p').first()).toBeVisible()
  await expect(math).toContainText('300,00')
  await expect(math).toContainText('72 000,00')
  // Sentences, not a visualisation. Scoped to the BODY: the disclosure's own caret is
  // an <svg> and a control affordance, not a chart — asserting over the whole block
  // would be measuring the wrong thing and would go red for the wrong reason.
  const body = math.locator('.disclosure__body')
  await expect(body.locator('svg, canvas, progress, meter')).toHaveCount(0)
  // …and the sentences are sentences: every line is a paragraph of words.
  await expect(body.locator('p').first()).toContainText(' ')
})

test('the history row reads as money + day, with the bank message under it', async ({ page }) => {
  await openVirements(page)
  const row = page.locator('.virements__list .listrow')
  await expect(row).toBeVisible()
  await expect(row).toContainText('556,41')
  await expect(row).toContainText('Hypotheque 11 mai')
})

test('the composer arrives with the unpaid dates ALREADY ticked, and writes the bank message', async ({ page }) => {
  await openVirements(page, { transfers: [] })
  await page.goto('/virement/new')

  const form = page.locator('.virements__form')
  await expect(form).toBeVisible()

  // Papa is the face this device acts as by default in the fixture; pick explicitly so
  // the share the lines carry is unambiguous.
  await form.getByRole('button', { name: 'Papa' }).click()

  // The two past due dates arrive selected; the future one does not.
  const dates = form.locator('fieldset', { hasText: 'Dates couvertes' })
  await expect(dates.getByRole('button', { name: /25 mai/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(dates.getByRole('button', { name: /8 juin/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(dates.getByRole('button', { name: /22 juin/ })).toHaveAttribute('aria-pressed', 'false')

  // Two shares of 556,41 = 1 112,82 — derived, never typed.
  await expect(form.locator('.virements__total')).toContainText('1 112,82')

  // A top-up joins the same send, and the total follows.
  await form.getByLabel('Renflouement').fill('2000')
  await expect(form.locator('.virements__total')).toContainText('3 112,82')

  // THE message: the plan's name, the day numbers grouped by month, then the top-up —
  // exactly the shape this household was typing by hand.
  const memo = form.locator('textarea').first()
  await expect(memo).toHaveValue('Hypotheque 25 mai 8 juin renflou 2000')
})

test('copying the message leaves the word « Copié ! » standing — a toast would be gone', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openVirements(page, { transfers: [] })
  await page.goto('/virement/new')
  const form = page.locator('.virements__form')
  await expect(form).toBeVisible()

  const copy = page.locator('.copybtn button')
  await copy.click()
  await expect(copy).toContainText('Copié !')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Hypotheque')

  // It STAYS — the whole point. You left for the bank app; the page was covered.
  await page.waitForTimeout(2500)
  await expect(copy).toContainText('Copié !')
})

test('saving posts the lines, the memo and the reference', async ({ page }) => {
  await openVirements(page, { transfers: [] })
  await page.goto('/virement/new')
  const form = page.locator('.virements__form')
  await expect(form).toBeVisible()
  await form.getByRole('button', { name: 'Papa' }).click()
  await form.getByLabel('Renflouement').fill('2000')
  await form.getByLabel('Numéro de référence').fill('CArR4A3Q')

  await form.getByRole('button', { name: 'Envoyer un virement' }).click()
  await expect.poll(() => posted.length).toBeGreaterThan(0)

  const write = posted.find((p) => p.path.endsWith('/transfers'))!
  expect(write.method).toBe('POST')
  const body = write.body as { lines: { kind: string; amountCents: number }[]; memo: string; reference: string; memberId: string }
  expect(body.memberId).toBe('m2')
  expect(body.reference).toBe('CArR4A3Q')
  expect(body.memo).toBe('Hypotheque 25 mai 8 juin renflou 2000')
  // Two plan lines at Papa's share + the top-up. The TOTAL is not sent: it is summed
  // from these, so there is no second number that can disagree.
  expect(body.lines.filter((l) => l.kind === 'plan')).toHaveLength(2)
  expect(body.lines.filter((l) => l.kind === 'plan').every((l) => l.amountCents === 55641)).toBe(true)
  expect(body.lines.find((l) => l.kind === 'topup')?.amountCents).toBe(200_000)
})

test('with no agreement yet, the empty state IS the door to writing one', async ({ page }) => {
  await openVirements(page, { plans: [], transfers: [] })
  const empty = page.locator('.empty-state')
  await expect(empty).toBeVisible()
  await empty.getByRole('link', { name: 'Ajouter une entente' }).click()
  await expect(page).toHaveURL(/\/virement\/plan\/new/)
  await expect(page.locator('.scene')).toBeVisible()
})

test('a read-only guest is never offered the money face', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { signedIn: false })
  // A link guest, exactly as the public demo is (a `showcase` token — see
  // guest-settings.spec.ts). The server denies both transfer paths to this kind, so
  // offering the tab could only ever lead to a failed read.
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/notes')
  await expect(page.locator('.cercle-notes')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Virements' })).toHaveCount(0)
})

test('nothing bleeds off the right edge at 360px', async ({ page }) => {
  await openVirements(page, { viewport: { width: 360, height: 780 } })
  const section = page.locator('.virements')
  await expect(section).toBeVisible()
  await page.locator('.virements__math').getByRole('button', { name: 'La math' }).click()

  const box = await boxOf(section)
  const edge = box.x + box.width

  // Every visible descendant EXCEPT the contents of a Rail. A Rail is the sanctioned
  // one-line horizontal scroller (Layout.tsx): its children are supposed to continue
  // past the edge, which is the whole difference between "scrolls" and "bleeds". The
  // rail element itself is still measured — that one must fit.
  const spill = await page.evaluate((right) => {
    const root = document.querySelector('.virements')
    if (!root) return ['no section']
    return [...root.querySelectorAll<HTMLElement>('*')]
      .filter((el) => !el.closest('.rail') || el.classList.contains('rail'))
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > right + 1
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className || '?'}`)
  }, edge)
  expect(spill, 'these bleed off the right edge at 360px').toEqual([])
})

// Screenshots for the LOOK pass. LEAN.md's method is « screenshot the first screen at
// 390px and look — do not reason about it », and this feature's two screens are exactly
// the kind that read fine in assertions and badly to an eye (a wall of labelled fields).
// Ignored by git (e2e/screenshots/), regenerated on demand.
test('capture the two screens at 390px for review', async ({ page }) => {
  await openVirements(page)
  await page.locator('.virements__math').getByRole('button', { name: 'La math' }).click()
  await page.screenshot({ path: 'e2e/screenshots/virements-section.png', fullPage: true })

  await page.goto('/virement/new')
  await expect(page.locator('.virements__form')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/virements-composer.png', fullPage: true })

  await page.goto('/virement/plan/new')
  await expect(page.locator('.operator__inline-form')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/virements-plan.png', fullPage: true })
})

// The ＋ answers to the SECTION, and each face of Les notes has exactly one add — so
// each gets the one-tap navigation, never a chooser offering the other one's verb.
//
// This pair exists because shipping the tile broke the note door: adding `virement` to
// `SECTION_MODES.notes` turned « a blank note, instantly » into a two-tile sheet, and
// `nav-restructure.spec.ts` caught it on CI. `modesFor` resolves path + `?section=`.
test('the ＋ opens the transfer composer on the money face — one tap, no chooser', async ({ page }) => {
  await openVirements(page)
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toHaveCount(0)
  await expect(page).toHaveURL(/\/virement\/new/)
  await expect(page.locator('.virements__form')).toBeVisible()
})

test('…and the notes face still opens a blank note, untouched', async ({ page }) => {
  await openVirements(page)
  await page.locator('.subtabs').getByRole('tab', { name: 'Les notes' }).click()
  await expect(page.locator('.cercle-notes')).toBeVisible()
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toHaveCount(0)
  await expect(page.locator('.note-editor')).toBeVisible()
})

test('capture the Rattrapage fold, open, at 390px', async ({ page }) => {
  await openVirements(page)
  await page.goto('/virement/plan/new')
  await expect(page.locator('.operator__inline-form')).toBeVisible()
  await page.getByRole('button', { name: 'Rattrapage' }).click()
  await page.screenshot({ path: 'e2e/screenshots/virements-plan-catchup.png', fullPage: true })
})

// « i cant repeat every 2 weeks » (Marc, 2026-09-12). It COULD: pick « Chaque semaine »
// and an interval row appears below. But all three of its parts are unshrinkable —
// « tous les » + a 4.5rem number + the unit — so at 390px the unit ran past the form
// edge and was CLIPPED by the scene's overflow. Clipped, not scrolled: invisible to a
// scrollWidth check (the documented trap), and it reads as "the app can't do this".
test('the plan form can say « tous les 2 semaines », and nothing is clipped at 360px', async ({ page }) => {
  await openVirements(page, { viewport: { width: 360, height: 780 } })
  await page.goto('/virement/plan/new')
  const form = page.locator('.operator__inline-form')
  await expect(form).toBeVisible()

  await page.locator('.recur select').selectOption('weekly')
  const interval = page.locator('input.recur__interval')
  await expect(interval).toBeVisible()
  await interval.fill('2')
  await interval.blur()

  // The unit agrees with the number: « semaines », not « semaine(s) » and not « semaine ».
  await expect(page.locator('.recur__unit')).toHaveText('semaines')
  await interval.fill('1')
  await interval.blur()
  await expect(page.locator('.recur__unit')).toHaveText('semaine')

  // And the whole row fits: measured against the form's own right edge, which sees
  // through the clip that hides the bug from the eye.
  const box = await boxOf(form)
  const spill = await page.evaluate((right) => {
    const root = document.querySelector('.operator__inline-form')
    if (!root) return ['no form']
    return [...root.querySelectorAll<HTMLElement>('.recur *')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > right + 1
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className || '?'}`)
  }, box.x + box.width)
  expect(spill, 'these run past the form edge at 360px').toEqual([])
})

// THE SCREEN MARC PHOTOGRAPHED (2026-09-12): an entente whose first date is still
// ahead, so no chip is ticked, the total reads 0,00 $ and the message is empty — and
// nothing said why. It read as broken rather than as waiting.
test('an entente whose first date is still ahead says so, and offers the way out', async ({ page }) => {
  const future = MMID + 5 * DAY // the first due date is next week
  await openVirements(page, {
    plans: [{ ...PLAN, anchorAt: future, due: [future, future + 14 * DAY], projection: null, catchup: null }],
    transfers: [],
  })
  await page.goto('/virement/new')
  const form = page.locator('.virements__form')
  await expect(form).toBeVisible()

  // Nothing ticked, and the screen SAYS which nothing this is.
  await expect(form.locator('.virements__total')).toContainText('0,00')
  await expect(form.getByText(/Aucune date à cocher/)).toBeVisible()
  // The message is empty, so the copy button is INERT rather than silently doing nothing.
  await expect(page.locator('.copybtn button')).toBeDisabled()
})

test('« Une autre date » logs a transfer made before the entente was written down', async ({ page }) => {
  const future = MMID + 5 * DAY
  await openVirements(page, {
    plans: [{ ...PLAN, anchorAt: future, due: [future], projection: null, catchup: null }],
    transfers: [],
  })
  await page.goto('/virement/new')
  const form = page.locator('.virements__form')
  await expect(form).toBeVisible()
  await form.getByRole('button', { name: 'Papa' }).click()

  // A date with no chip of its own — the August payment the entente cannot reach.
  await form.locator('.virements__otherdate input[type="date"]').fill('2025-05-08')
  // It joins the row, already ticked, and the total picks up this face's share.
  const chip = form.getByRole('button', { name: /8 mai/ })
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(form.locator('.virements__total')).toContainText('556,41')
  await expect(form.locator('textarea').first()).toHaveValue('Hypotheque 8 mai')
})

// « propose to me the next sensible thing i would do » (Marc, 2026-09-12). The dates
// tick themselves because they are DUE. The top-up is the one number the screen cannot
// know and the one that repeats — so it is OFFERED, never slid into the field.
test('a new transfer offers last time’s top-up, one tap, and does not fill it in', async ({ page }) => {
  await openVirements(page, { transfers: [SENT_WITH_TOPUP] })
  await page.goto('/virement/new')
  const form = page.locator('.virements__form')
  await expect(form).toBeVisible()
  await form.getByRole('button', { name: 'Papa' }).click()

  // NOT pre-filled: an amount nobody noticed is money nobody decided.
  await expect(form.getByLabel('Renflouement')).toHaveValue('')
  const offer = form.getByRole('button', { name: /Comme la dernière fois/ })
  await expect(offer).toBeVisible()
  await expect(offer).toContainText('2 000,00')

  // One tap takes it, and the total and the message follow.
  await offer.click()
  await expect(form.getByLabel('Renflouement')).toHaveValue('2000')
  // Two due dates already ticked + the offered top-up = Marc's real 14 août transfer,
  // composed without typing a number: 2 × 556,41 + 2 000.
  await expect(form.locator('.virements__total')).toContainText('3 112,82')
  await expect(form.locator('textarea').first()).toHaveValue('Hypotheque 25 mai 8 juin renflou 2000')
  // …and the offer retires once it has been taken.
  await expect(form.getByRole('button', { name: /Comme la dernière fois/ })).toHaveCount(0)
})

test('the date a transfer was sent is stored as the day you picked', async ({ page }) => {
  await openVirements(page, { transfers: [] })
  await page.goto('/virement/new')
  const form = page.locator('.virements__form')
  await expect(form).toBeVisible()
  await form.getByRole('button', { name: 'Papa' }).click()
  await form.getByLabel('Renflouement').fill('2000')
  await form.getByLabel('Envoyé le').fill('2025-08-14')
  await form.getByRole('button', { name: 'Envoyer un virement' }).click()
  await expect.poll(() => posted.length).toBeGreaterThan(0)
  const body = posted.find((p) => p.path.endsWith('/transfers'))!.body as { sentAt: number }
  // The 14th, at the household's LOCAL midnight — not the 13th at 20:00, which is what
  // the appointment helper's UTC midnight produced on Marc's own row.
  const shown = new Date(body.sentAt * 1000).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', timeZone: 'America/Toronto' })
  expect(shown).toBe('14 août')
})
