import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// « Le défi du jour » — the day-long family défi on the Habitudes card (migration
// 0115). Locks the whole flow: draw a défi, re-roll up to three times (« la
// troisième est la bonne »), commit it, then check it off per face (faces light
// up, never a count). Same frontend-only harness as habits.spec.ts: Vite + stubbed
// /api/**, clock frozen to the mock epoch so the fixture's days read as "today".

async function board(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
}

// The board's face picker is the header chip → a face sheet (mirrors habits.spec).
async function pickFace(page: Page, name: string) {
  await page.locator('.profile-chip').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  await page.locator('.profile-face', { hasText: name }).click()
  await expect(page.locator('.sheet.show')).toHaveCount(0)
}

test.describe('Le défi du jour', () => {
  test('draws a défi, re-rolls up to three times, then commits it', async ({ page }) => {
    await board(page)
    const card = page.locator('.habitudes-card')
    const defi = card.locator('.defi-block')
    await expect(defi).toBeVisible()

    // Nothing committed yet → the pige invitation.
    await defi.getByRole('button', { name: 'Pige un défi' }).click()
    // A candidate appears, with the re-roll offered.
    await expect(defi.locator('.defi-block__text')).not.toHaveText('')
    const again = defi.getByRole('button', { name: 'Pige encore' })
    await expect(again).toBeVisible()

    // Two re-rolls (three draws total). After the third, « Pige encore » retires and
    // the gentle « la troisième est la bonne » takes its place — you commit now.
    await again.click()
    await again.click()
    await expect(defi.getByRole('button', { name: 'Pige encore' })).toHaveCount(0)
    await expect(defi).toContainText('La troisième est la bonne')

    // Commit it — the drawn défi becomes today's, and the pige flow gives way to the
    // committed défi (its text survives the refetch the write triggers).
    const committed = await defi.locator('.defi-block__text').textContent()
    await defi.getByRole('button', { name: 'On l’essaie !' }).click()
    await expect(card.locator('.defi-block--live')).toBeVisible()
    await expect(defi.locator('.defi-block__text')).toHaveText(committed ?? '')
    // No pige button once committed — the day has its défi.
    await expect(defi.getByRole('button', { name: 'Pige un défi' })).toHaveCount(0)
  })

  test('each face checks it off on its own — faces light up, never a count', async ({ page }) => {
    await board(page)
    const card = page.locator('.habitudes-card')
    const defi = card.locator('.defi-block')

    // Commit a défi first.
    await defi.getByRole('button', { name: 'Pige un défi' }).click()
    await defi.getByRole('button', { name: 'On l’essaie !' }).click()
    await expect(card.locator('.defi-block--live')).toBeVisible()

    // At « Maisonnée » (no face) there's no check-off — a mark is always someone's.
    await expect(defi.locator('.defi-block__mark')).toHaveCount(0)
    await expect(defi.locator('.defi-block__hint')).toBeVisible()

    // Maman picks her face and takes it on — her face lights up.
    await pickFace(page, 'Maman')
    const mark = defi.locator('.defi-block__mark')
    await expect(mark).toHaveText('Je l’ai tenu !')
    await mark.click()
    await expect(defi.locator('.defi-block__faces .avatar')).toHaveCount(1)
    // Her own control now offers to undo it — the day is never locked.
    await expect(mark).toHaveText('Finalement, non')

    // A second face takes it on too — two faces, still no number anywhere.
    await pickFace(page, 'Papa')
    await expect(defi.locator('.defi-block__mark')).toHaveText('Je l’ai tenu !')
    await defi.locator('.defi-block__mark').click()
    await expect(defi.locator('.defi-block__faces .avatar')).toHaveCount(2)
    await expect(defi.locator('.defi-block__foot')).not.toContainText('2')
  })

  test('the défi also shows in « Le point du jour »', async ({ page }) => {
    await board(page)
    // Commit from the board, then open the scene: the same défi surface is there.
    const card = page.locator('.habitudes-card')
    const cardDefi = card.locator('.defi-block')
    await cardDefi.getByRole('button', { name: 'Pige un défi' }).click()
    await cardDefi.getByRole('button', { name: 'On l’essaie !' }).click()
    await expect(card.locator('.defi-block--live')).toBeVisible()

    await page.goto('/board/habitudes')
    await page.locator('.habitudes').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.habitudes .defi-block--live')).toBeVisible()
  })

  test('the board « ? » explains the défi in place and deep-links to its guide', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
      } catch {
        /* noop */
      }
    })
    await board(page)
    // Arm the board's help mode (the round "?" toggle in the header).
    await page.locator('.help-toggle').first().click()
    // The défi kicker is now a help target; tapping it explains it in place.
    const title = page.locator('.help-title', { hasText: 'Le défi du jour' })
    await expect(title).toBeVisible()
    await title.click()
    const bubble = page.locator('.help-bubble').first()
    await expect(bubble).toBeVisible()
    // « Voir le guide » deep-links to the habits guide card (défi is its first point).
    await bubble.locator('.help-bubble__guide').click()
    await expect(page).toHaveURL(/card=habits/)
  })
})
