import { test, expect, type App } from './fixtures'
import { BASE, notesFromMots } from './mocks'

// « Pour toi » (PLAN-mots C2, accepted 2026-09-25): with a face picked, ONE calm line
// under the board's controls says what is theirs right now — a mot waiting (presence,
// never a count), their next rendez-vous today, the routine of the moment. Absent for the
// Maisonnée and absent when nothing is pending: the calm inverse of a notification centre.
//
// Clock frozen at BASE (04:00 local, a morning): Léa (m3) has « Garderie » at 05:00 in
// the shared fixture, a « Matin » routine served here with her memberId, and one mot
// waiting; Papa (m2) has nothing of his own.

const MOT = {
  id: 'mo1',
  member_id: 'm3',
  author_member_id: 'm1',
  text: 'Bonne journée ma puce',
  media_kind: null,
  media_key: null,
  scene_key: null,
  created_at: BASE - 3600,
  updated_at: null,
  opened_at: null,
  saved_at: null,
  surface_at: null,
  reply_to: null,
}
const ROUTINES = [
  { id: 'r1', name: 'Matin', memberId: 'm3', memberName: 'Léa', color: '#88A36F', timeOfDay: 'morning', cards: [{ icon: 'tooth' }], doneIdx: [] },
  { id: 'r2', name: 'Dodo', memberId: 'm3', memberName: 'Léa', color: '#88A36F', timeOfDay: 'evening', cards: [{ icon: 'bed' }], doneIdx: [] },
]

async function openBoard(app: App, face: string | null, mots: object[] = [MOT]) {
  const { page } = app
  await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE' })
  if (face) await page.addInitScript((f) => localStorage.setItem('babillard-profile', f), face)
  // Mots are fridge notes since 0142 — served in the notes shape.
  await page.route('**/api/notes**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notesFromMots(mots as Record<string, unknown>[])) }))
  await page.route('**/api/routines**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ routines: ROUTINES }) }))
  await page.goto('/board')
  await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
}

test('Léa reads her line: the waiting mot, her next rendez-vous, her morning routine — and not the evening one', async ({ page, app }) => {
  await openBoard(app, 'm3')
  const line = page.locator('.pourtoi')
  await expect(line).toBeVisible()
  await expect(line.locator('.pourtoi__name')).toHaveText('Léa')
  await expect(line).toContainText('un mot t’attend')
  await expect(line).toContainText('Garderie 5 h')
  await expect(line).toContainText('routine Matin')
  // Red against handing every routine to the ambient picker: « Dodo » would be named at 04:00.
  await expect(line).not.toContainText('Dodo')
  // The whole line is one paragraph — presence, no count anywhere in it.
  await expect(line).not.toContainText(/\d+ mots?/)
})

test('the Maisonnée has no line, and neither does a face with nothing pending', async ({ page, app }) => {
  await openBoard(app, null)
  await expect(page.locator('.pourtoi')).toHaveCount(0)
  await page.close()
})

test('a face with nothing of their own reads nothing — no empty frame', async ({ page, app }) => {
  // Papa: no mot addressed to him, no rendez-vous naming him today, no routine.
  await openBoard(app, 'm2', [])
  await expect(page.locator('.board-controls')).toBeVisible()
  await expect(page.locator('.pourtoi')).toHaveCount(0)
})
