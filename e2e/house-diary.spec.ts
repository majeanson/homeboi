import { test, expect } from './fixtures'

// « La maison cette année » (PARITY, late rows). A deep link lands on the section, and a
// household with nothing yet reads one calm line, not a blank card.
test('a fresh household reads the empty line', async ({ page, app }) => {
  await app.boot({ route: '/settings?focus=houseDiary', api: { fresh: true }, wait: '.operator__section' })
  await expect(page.getByText('L’année s’écrira ici, un moment à la fois.')).toBeVisible()
})

test('a household with history sees its months', async ({ page, app }) => {
  const at = Math.floor(Date.now() / 1000) - 5 * 86_400
  const entries = [{ id: 'cl1', carnetId: 'ca1', at, kind: 'service', title: 'Ramonage cheminée', note: null }]
  await app.boot({ route: '/settings?focus=houseDiary', api: { overrides: { 'care-log': { entries } } }, wait: '.operator__section' })
  await expect(page.locator('.ledger')).toContainText('Ramonage cheminée')
})
