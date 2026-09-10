import { expect, type Locator, type Page } from '@playwright/test'

// Address a `/dev/kit` specimen by its NAME.
//
// Several specs drive the gallery rather than a real surface, because a primitive's
// contract is better pinned on the primitive than on any one caller. They all found
// their card with `.filter({ hasText: 'X' })` — which matches ANY text in the card,
// including a neighbouring specimen's explanatory prose.
//
// That broke for real on 2026-09-09: a new `Loading · PairPrompt` specimen whose label
// says « … c'est LoadError (juste au-dessus) » made `hasText: 'LoadError'` match two
// cards, and `kb-latch.spec.ts` died on a strict-mode violation in CI. The prose is
// worth keeping — it is the reason the gallery is useful — so the SELECTOR is what has
// to be precise. `.kit-entry__name` holds exactly the entry's `name`, nothing else.
export function kitEntry(page: Page, name: string): Locator {
  return page.locator('details.kit-entry').filter({
    has: page.locator('.kit-entry__name', { hasText: new RegExp(`^${escapeRe(name)}`) }),
  })
}

/** Open a specimen and hand back its card. Fails loudly if the name matched no entry. */
export async function openKitEntry(page: Page, name: string): Promise<Locator> {
  const entry = kitEntry(page, name)
  await expect(entry, `no /dev/kit entry named « ${name} »`).toHaveCount(1)
  await entry.locator('summary').click()
  return entry
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
