import { test, expect } from './fixtures'

// Review #18 (2026-11-17; Marco, Geneviève, Thérèse): the page a parent opens to pair a
// tablet read like a developer console (« Agent IA (MCP) », « jeton », « Diagnostic
// clavier », « Tester l'IA »), « Kit de composants (dev) » sat under « Affichage », and
// « Charger des exemples » sat on Découvrir beside « Déconnexion ». Marc: an « Avancé »
// section, no feature flag. The tools are one pill away; the household pages are calm.

test('« Avancé » holds the dev tools; the household pages no longer show them', async ({ app, page }) => {
  await app.boot({ route: '/settings?tab=settings&lens=regler&sub=tablets', wait: '#op-devices' })
  for (const gone of ['#op-mcpAgent', '#op-kbDebug', '#op-aiLog']) await expect(page.locator(gone)).toHaveCount(0)

  await page.goto('/settings?tab=settings&lens=regler&sub=display')
  await expect(page.locator('#op-display')).toBeVisible()
  await expect(page.locator('#op-display .devkit__link')).toHaveCount(0)

  await page.goto('/settings')
  await expect(page.locator('.guide').first()).toBeVisible()
  await expect(page.locator('.guide__sample')).toHaveCount(0)

  await page.getByRole('tab', { name: /Système/ }).click()
  await page.getByRole('tab', { name: 'Avancé' }).click()
  for (const here of ['#op-mcpAgent', '#op-kbDebug', '#op-sample', '#op-devKit']) await expect(page.locator(here)).toBeVisible()
  await expect(page.locator('#op-devKit').getByRole('link')).toHaveAttribute('href', '/dev/kit')
})

test('a link to a moved card still lands on it (?focus= derives the pill)', async ({ app, page }) => {
  await app.boot({ route: '/settings?focus=kbDebug', wait: '#op-kbDebug' })
  await expect(page.getByRole('tab', { name: 'Avancé' })).toHaveAttribute('aria-selected', 'true')
})
