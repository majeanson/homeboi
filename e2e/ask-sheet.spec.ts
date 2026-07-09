import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// E-22 « Demande à la maison » — Playwright has no mic, so this exercises the
// TYPED path (the EditField fallback), which shares its whole answer/degrade
// machinery with the voice path (both call the same ask()). Mocks
// /api/health (AI on/off) + /api/ask per test.
test.use({ hasTouch: true })

async function mockAsk(
  page: Page,
  respond: (question: string) => { answer: string | null; kind: string; degraded?: boolean },
  opts: { aiError?: string } = {},
) {
  await page.route('**/api/ask', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    let question = ''
    try {
      question = JSON.parse(route.request().postData() || '{}').question ?? ''
    } catch {
      /* no body */
    }
    const body = respond(question)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (opts.aiError) headers['X-AI-Error'] = encodeURIComponent(opts.aiError)
    await route.fulfill({ status: 200, headers, body: JSON.stringify(body) })
  })
}

async function openAsk(page: Page) {
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
  await page.locator('.app-head__ask').click()
  // `.kit-modal` (not the generic dialog role): a few ALWAYS-MOUNTED `Sheet`s
  // (ProfilePicker, "Depuis ce matin", the ＋ AddSheet…) already carry
  // `role="dialog"` in the DOM even while closed (CSS-only show/hide), so a bare
  // `getByRole('dialog')` is ambiguous — `.kit-modal` is AskSheet's own shell.
  await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
}

async function askTyped(page: Page, question: string) {
  await page.locator('.ask-sheet input.edit-field__input').fill(question)
  await page.locator('.ask-sheet .edit-field__submit').click()
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('the mic entry point opens AskSheet; the typed path answers with the domain-tagged card', async ({ page }) => {
  await mockAsk(page, () => ({ answer: 'Spaghetti mercredi soir.', kind: 'meal' }))
  await openAsk(page)

  await askTyped(page, 'Qu’est-ce qu’on mange mercredi ?')

  await expect(page.locator('.search__answer-text')).toHaveText('Spaghetti mercredi soir.')
  await expect(page.locator('.search__answer-kind')).toHaveText('Repas')
  // The auto-speak-once replay control is offered.
  await expect(page.locator('.ask-sheet__replay')).toBeVisible()
})

// An enumerated answer ("what's on the list?") comes back as a lead sentence + one
// item per "- " line. It must render as a real <ul>, not a comma-wall in one <p>:
// dropping the newlines into a paragraph is what made the answer unreadable.
test('an enumerated answer renders as a lead sentence + a real list', async ({ page }) => {
  await mockAsk(page, () => ({
    answer: 'La liste contient 3 articles :\n- Lime\n- Citron\n- Pain',
    kind: 'list',
  }))
  await openAsk(page)

  await askTyped(page, 'Qu’est-ce qu’il y a sur la liste ?')

  await expect(page.locator('.search__answer-text')).toHaveText('La liste contient 3 articles :')
  await expect(page.locator('.search__answer-list li')).toHaveText(['Lime', 'Citron', 'Pain'])
})

test('the honest "je ne sais pas" degrade shows the search-everywhere link', async ({ page }) => {
  await mockAsk(page, () => ({ answer: null, kind: 'none' }))
  await openAsk(page)

  await askTyped(page, 'Une question sans réponse dans les données')

  await expect(page.locator('.search__asking')).toContainText('pas pu répondre')
  await expect(page.locator('.search__related-chip').first()).toBeVisible()
})

test('a model failure surfaces the X-AI-Error toast AND the card\'s "not what you wanted?" link', async ({ page }) => {
  await mockAsk(page, () => ({ answer: null, kind: 'none' }), { aiError: 'IA momentanément indisponible' })
  await openAsk(page)

  await askTyped(page, 'Une question quelconque')

  // The global X-AI-Error toast (lib/aiErrorToast — every /api/* caller shares it).
  await expect(page.locator('.ai-error-toast')).toBeVisible()
  await expect(page.locator('.ai-error-toast__msg')).toHaveText('IA momentanément indisponible')
  // …and the answer card still offers the "chercher partout" links, same as any
  // other couldn't-answer case.
  await expect(page.locator('.search__asking')).toContainText('pas pu répondre')
  await expect(page.locator('.search__related-chip').first()).toBeVisible()
})

test('closing the sheet unmounts it; reopening starts fresh (no stale question/answer)', async ({ page }) => {
  await mockAsk(page, () => ({ answer: 'Une réponse.', kind: 'note' }))
  await openAsk(page)
  await askTyped(page, 'Une question')
  await expect(page.locator('.search__answer-text')).toBeVisible()

  await page.locator('.kit-modal__close').click()
  await expect(page.locator('.kit-modal')).toHaveCount(0)

  await page.locator('.app-head__ask').click()
  await expect(page.locator('.ask-sheet input.edit-field__input')).toHaveValue('')
  await expect(page.locator('.search__answer-text')).toHaveCount(0)
})

test('AI off keeps the mic but drops « Demander » — « Classer » alone, with its degraded picker', async ({ page }) => {
  // The mic USED to hide entirely when AI was off (the sheet only asked questions, and
  // an answer needs the model). It now also carries « Classer », the capture WRITE
  // spine, whose degraded path — pick the type yourself — needs no model at all. Hiding
  // the mic on !aiEnabled would take the write spine offline with it, so instead the
  // sheet drops the « Demander » segment and opens straight on « Classer ».
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, app: 'Babillard', ai: false, aiAvailable: true, invite: false, sessionSecret: true }),
    })
  })
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

  // The mic reuses `.app-head__search` for its chrome, so scope the loupe assertion —
  // with the mic now present (it used to hide here) a bare `.app-head__search` matches
  // both and trips Playwright's strict mode.
  await expect(page.locator('.app-head__search:not(.app-head__ask)')).toBeVisible()
  await expect(page.locator('.app-head__ask')).toBeVisible()

  await page.locator('.app-head__ask').click()
  await expect(page.locator('.kit-modal.ask-sheet')).toBeVisible()
  // One thing left to do → no segment (a one-option segmented control is noise),
  // and the capture form is what's on screen. No question field, no answer card.
  await expect(page.locator('.ask-sheet__modes')).toHaveCount(0)
  await expect(page.locator('.capture-form')).toBeVisible()
  await expect(page.locator('.ask-sheet__mic')).toHaveCount(0)
})

test('the mic offers both « Demander » and « Classer », and switching modes drops the answer', async ({ page }) => {
  await mockAsk(page, () => ({ answer: 'Spaghetti jeudi.', kind: 'meal' }))
  await openAsk(page)

  // Demander is the default when AI is on: the big tap-to-talk mic + the typed fallback.
  await expect(page.locator('.ask-sheet__mic')).toBeVisible()
  await askTyped(page, 'on mange quoi jeudi ?')
  await expect(page.locator('.search__answer-text')).toContainText('Spaghetti jeudi.')

  // Switching to « Classer » swaps the surface to the capture spine and clears the
  // answer — a reply still sitting under a label that now means "file this" is exactly
  // the ambiguity the segment exists to remove.
  await page.locator('.ask-sheet__modes button', { hasText: 'Classer' }).click()
  await expect(page.locator('.capture-form')).toBeVisible()
  await expect(page.locator('.search__answer-text')).toHaveCount(0)
  await expect(page.locator('.ask-sheet__mic')).toHaveCount(0)

  // …and back.
  await page.locator('.ask-sheet__modes button', { hasText: 'Demander' }).click()
  await expect(page.locator('.ask-sheet__mic')).toBeVisible()
  await expect(page.locator('.capture-form')).toHaveCount(0)
})

// Phone-width overflow sweep (see CLAUDE.md "Horizontal overflow"): a per-element
// bounds check against .kit-modal's right edge — sees through overflow-x:hidden,
// which a scrollWidth check cannot. Checked with a long answer (the likeliest
// place a new sheet bleeds) at both phone widths.
for (const width of [360, 390]) {
  test(`AskSheet never overflows sideways @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await mockAsk(page, () => ({
      answer:
        'Une réponse assez longue pour vérifier que la carte réponse retombe à la ligne plutôt que de déborder à droite de la fenêtre, même sur un téléphone étroit.',
      kind: 'event',
    }))
    await openAsk(page)
    await askTyped(page, 'Une question assez longue pour tester le champ de texte au complet')
    await expect(page.locator('.search__answer-text')).toBeVisible()

    const { bleed, culprit } = await page.evaluate(() => {
      const modal = document.querySelector('.kit-modal') as HTMLElement | null
      if (!modal) return { bleed: -1, culprit: 'no .kit-modal' }
      const edge = modal.getBoundingClientRect().right
      let worst = 0
      let who = ''
      for (const el of Array.from(modal.querySelectorAll<HTMLElement>('*'))) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue // hidden/collapsed — ignore
        const over = r.right - edge
        if (over > worst) {
          worst = over
          who = (el.className || el.tagName).toString().slice(0, 80)
        }
      }
      return { bleed: worst, culprit: who }
    })
    expect(bleed, `"${culprit}" bleeds off the AskSheet's right edge`).toBeLessThanOrEqual(1)
  })
}
