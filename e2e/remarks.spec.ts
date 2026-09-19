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
