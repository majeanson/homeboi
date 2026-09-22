import { test, expect, type Request } from '@playwright/test'
import { mockApi, seedState, ROUTES } from './mocks'

// « Les remarques » (0136) — the household's side of the loop, through the real UI.
//
// What this file is for is the SEAM, not the rendering: a report that renders beautifully
// and posts nothing is the settings-panel failure mode config-panels.spec.ts exists to
// catch, and this surface has the same shape (a modal that closes on submit looks
// successful whether or not the write left).
//
// So every test here asserts the REQUEST — and specifically that the two facts nobody
// should have to type, the route and the build, actually ride along. Those are the whole
// reason the feature is worth more than an email.

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

const REMARKS_URL = '/settings?tab=settings&sub=tablets&focus=remarks'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('filing a remark posts the words AND the context nobody should have to type', async ({ page }) => {
  await page.goto(REMARKS_URL)
  const panel = page.locator('#operator-panel')
  await expect(panel.getByText('Les remarques')).toBeVisible()

  await panel.getByRole('button', { name: 'Signaler' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // The kind is a choice, and it must actually travel — a composer that always posts
  // 'bug' would look identical on screen.
  await dialog.getByRole('button', { name: 'Souhait' }).click()

  const post = page.waitForRequest(isApi('POST', 'remarks'))
  await dialog.getByRole('textbox').fill('Un bouton « refaire hier »\nsur la carte du souper')
  await dialog.getByRole('button', { name: 'Envoyer' }).click()

  const body = (await (await post).postDataJSON()) as Record<string, unknown>
  expect(body.kind).toBe('wish')
  // The FIRST LINE becomes the title, the rest the body — the one-field design.
  expect(body.title).toBe('Un bouton « refaire hier »')
  expect(body.body).toBe('sur la carte du souper')
  // The two facts that make a report actionable. `seen_build` is '' in a dev build
  // (__BUILD_SHA__ resolves to 'dev' or the local sha) — what matters is that the field
  // is SENT, because a missing field is how « ça marche chez moi » comes back.
  expect(String(body.seen_path)).toContain('/settings')
  expect(body).toHaveProperty('seen_build')
  expect(body).toHaveProperty('context')
})

test('the empty state invites rather than reporting nothing', async ({ page }) => {
  await page.goto(REMARKS_URL)
  await expect(page.locator('#operator-panel').getByText(/Rien à signaler/)).toBeVisible()
})

test('a shipped remark shows the commit and the explanation, and only then offers the verdict', async ({ page }) => {
  // The verdict buttons must NOT appear on an open remark: there is nothing to confirm
  // before a deploy has claimed it, and offering it would invite closing a remark
  // nobody has acted on.
  await mockApi(page, {
    overrides: {
      remarks: {
        remarks: [
          {
            id: 'rmOpenOnly1',
            kind: 'bug',
            title: 'Encore ouverte',
            body: '',
            help_key: null,
            seen_path: '/kitchen',
            seen_build: 'a3f21c9',
            context_json: '{}',
            status: 'open',
            reported_by: null,
            created_at: 1,
            updated_at: 1,
            events: [{ id: 'e1', remark_id: 'rmOpenOnly1', kind: 'filed', text: '', sha: null, media_kind: null, media_key: null, scene_key: null, author_member_id: null, created_at: 1 }],
          },
          {
            id: 'rmShipped11',
            kind: 'bug',
            title: 'Les en-têtes partaient à l’épicerie',
            body: '',
            help_key: null,
            seen_path: '/kitchen',
            seen_build: 'a3f21c9',
            context_json: '{}',
            status: 'shipped',
            reported_by: null,
            created_at: 1,
            updated_at: 2,
            events: [
              { id: 'e2', remark_id: 'rmShipped11', kind: 'filed', text: '', sha: null, media_kind: null, media_key: null, scene_key: null, author_member_id: null, created_at: 1 },
              { id: 'e3', remark_id: 'rmShipped11', kind: 'shipped', text: 'l’itérateur ne sautait pas les en-têtes', sha: 'deadbeef1234', media_kind: null, media_key: null, scene_key: null, author_member_id: null, created_at: 2 },
            ],
          },
        ],
      } as (typeof ROUTES)['remarks'],
    },
  })
  await page.goto(REMARKS_URL)
  const panel = page.locator('#operator-panel')

  await panel.getByText('Encore ouverte').click()
  await expect(panel.getByRole('button', { name: 'C’est réglé' })).toHaveCount(0)

  await panel.getByText('Les en-têtes partaient à l’épicerie').click()
  // The explanation the deploy attached, and the commit that carried it.
  await expect(panel.getByText('l’itérateur ne sautait pas les en-têtes')).toBeVisible()
  await expect(panel.getByText(/deadbeef/)).toBeVisible()

  // …and the verdict is a real PATCH, not a local state flip.
  const patch = page.waitForRequest(isApi('PATCH', 'remarks'))
  await panel.getByRole('button', { name: 'C’est réglé' }).click()
  const body = (await (await patch).postDataJSON()) as { id: string; action: string }
  expect(body).toMatchObject({ id: 'rmShipped11', action: 'confirm' })
})

test('the « ? » door lands with the SECTION it was asking about, not just a URL', async ({ page }) => {
  // The hand-off, at the seam that matters: `?report=1` opens the composer and `hk=`
  // rides into the POST as `help_key`. A help key is semantic (`kitchen.recipes`) where
  // a path is only where someone happened to be standing — and it is what makes a
  // report point at code.
  await page.goto(`${REMARKS_URL}&report=1&hk=kitchen.recipes`)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const post = page.waitForRequest(isApi('POST', 'remarks'))
  await dialog.getByRole('textbox').fill('Les collections se mélangent')
  await dialog.getByRole('button', { name: 'Envoyer' }).click()
  const body = (await (await post).postDataJSON()) as Record<string, unknown>
  expect(body.help_key).toBe('kitchen.recipes')
})

test('landing WITHOUT ?report does not ambush anyone with a composer', async ({ page }) => {
  // The other half: the section is a place you visit to read what came back, and an
  // ordinary visit must not open a form over it.
  await page.goto(REMARKS_URL)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

// ── The board card: add and resolve WITHOUT leaving the board ────────────────────
//
// The second half of the loop, and the half a remark asked for (« widget on board for
// remarques (add and resolve) »). The card shipped first as a pure glance — every row a
// link into Réglages — which reads well and costs a navigation for the only two things
// anyone does with a remark. So what these two tests pin is not the rendering: it is that
// the write leaves AND the board is still under it. `toHaveURL(/\/board/)` after the
// request is the whole assertion — a door that quietly navigates is the regression.

const SHIPPED_ROW = {
  id: 'rmBoard0001',
  kind: 'bug',
  title: 'Le clavier saute sur la liste',
  body: '',
  help_key: null,
  seen_path: '/liste',
  seen_build: 'a3f21c9',
  context_json: '{}',
  status: 'shipped',
  reported_by: null,
  created_at: 1,
  updated_at: 2,
  events: [
    { id: 'be1', remark_id: 'rmBoard0001', kind: 'filed', text: '', sha: null, media_kind: null, media_key: null, scene_key: null, author_member_id: null, created_at: 1 },
    { id: 'be2', remark_id: 'rmBoard0001', kind: 'shipped', text: 'la fenêtre ne se re-mesurait pas', sha: 'cafe12345678', media_kind: null, media_key: null, scene_key: null, author_member_id: null, created_at: 2 },
  ],
}

async function boardWith(page: import('@playwright/test').Page, rows: unknown[]) {
  await mockApi(page, { overrides: { remarks: { remarks: rows } } })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // The first-login tour navigates on its own and would yank the board out from under
  // the card (the help.spec.ts precedent).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await page.goto('/board')
  return page.locator('.bento', { hasText: 'Les remarques' })
}

test('the board card files a remark in place — the composer opens ON the board', async ({ page }) => {
  const card = await boardWith(page, [SHIPPED_ROW])
  await expect(card).toBeVisible()

  // The header ＋ (SectionAdd, `popup`: it opens a dialog, so it announces
  // aria-haspopup rather than promising a region below it).
  await card.getByRole('button', { name: 'Signaler' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/board/)

  const post = page.waitForRequest(isApi('POST', 'remarks'))
  await dialog.getByRole('textbox').fill('La carte des remarques devrait se replier')
  await dialog.getByRole('button', { name: 'Envoyer' }).click()
  const body = (await (await post).postDataJSON()) as Record<string, unknown>
  expect(body.title).toBe('La carte des remarques devrait se replier')
  // Filed FROM the board, and the report says so — the path is the one fact the
  // reporter never types and the one that dates every screenshot.
  expect(String(body.seen_path)).toContain('/board')
  // And we never left.
  await expect(page).toHaveURL(/\/board/)
})

test('the board card takes the verdict in place — and only once a deploy claimed it', async ({ page }) => {
  const openOnly = { ...SHIPPED_ROW, id: 'rmBoardOpen1', title: 'Encore ouverte', status: 'open', events: [SHIPPED_ROW.events[0]] }
  const card = await boardWith(page, [openOnly, SHIPPED_ROW])
  await expect(card).toBeVisible()

  // An `open` remark carries no verdict: there is nothing to confirm before something
  // shipped, and offering it invites closing a remark nobody acted on. One row is
  // shipped, so exactly ONE pair of chips exists on the card.
  await expect(card.getByRole('button', { name: 'C’est réglé' })).toHaveCount(1)
  await expect(card.getByText('Encore ouverte')).toBeVisible()

  const patch = page.waitForRequest(isApi('PATCH', 'remarks'))
  await card.getByRole('button', { name: 'C’est réglé' }).click()
  const body = (await (await patch).postDataJSON()) as { id: string; action: string }
  expect(body).toMatchObject({ id: 'rmBoard0001', action: 'confirm' })
  await expect(page).toHaveURL(/\/board/)
})

test('the « ? » door opens the composer where you stand, carrying the section', async ({ page }) => {
  // It used to be a LINK into Réglages: you tapped « ? » because something was wrong
  // HERE, and the answer walked you off the page you were describing. Now the bubble
  // mounts the same composer in place (lazily) — and the help KEY still rides into the
  // POST, which is what makes a report point at code rather than at a URL.
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await page.locator('.help-toggle').first().click()
  await page.locator('.help-title').first().click()
  const bubble = page.locator('.help-bubble').first()
  await expect(bubble).toBeVisible()

  await bubble.locator('.help-bubble__report').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // Still on the kitchen — the whole point of the change.
  await expect(page).toHaveURL(/\/kitchen/)

  const post = page.waitForRequest(isApi('POST', 'remarks'))
  await dialog.getByRole('textbox').fill('Les collections se mélangent')
  await dialog.getByRole('button', { name: 'Envoyer' }).click()
  const body = (await (await post).postDataJSON()) as Record<string, unknown>
  expect(String(body.help_key)).not.toBe('')
  expect(String(body.seen_path)).toContain('/kitchen')
})
