// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { auditDraft, withAudit } from './recipeAudit'
import { loadCorpus } from '../test/recipeCorpus'
import { readPage, sourceFromHtml } from './recipeImportPage'

// One fixture per flag, and the corpus as the false-positive meter: every corpus page is
// hand-verified correct, so a rule that flags one of them is a rule that cries wolf.

const base = {
  title: 'Pouding chômeur',
  ingredients: ['500 ml de cassonade', '500 ml d’eau', '250 ml de farine', '2 œufs'],
  steps: ['Préchauffer le four à 180 °C.', 'Mélanger la farine et les œufs.', 'Verser l’eau et la cassonade.', 'Cuire 40 minutes.'],
}
const kinds = (d: typeof base, src: string | null = null) => auditDraft(d, src).map((f) => f.kind)

describe('auditDraft — one flag per thing a read can miss', () => {
  it('a clean read has none', () => expect(kinds(base, 'Étape 1\nÉtape 2\nÉtape 3\nÉtape 4')).toEqual([]))

  it('step-count: the page printed « Étape 6 », the draft has 4', () => {
    expect(auditDraft(base, 'Étape 1\nÉtape 2\nÉtape 3\nÉtape 4\nÉtape 5\nÉtape 6\nServir.')).toEqual([{ kind: 'step-count', line: '4/6' }])
  })
  // A cookbook numbers its steps with a bare figure; a reader that drops a step at a
  // column break (the coquilles, photo corpus) leaves « 1, 2, 3, 5 » — the page says 4
  // is missing even when the draft's count looks plausible.
  it('step-gap: the page’s numbering skips one', () => {
    const src = '1 Préchauffer le four à 180 °C.\n2 Mélanger la farine et les œufs.\n3 Verser l’eau et la cassonade.\n5 Cuire 40 minutes.'
    expect(auditDraft(base, src)).toEqual([{ kind: 'step-count', line: '4/5' }, { kind: 'step-gap', line: '4' }])
    // Contiguous bare numbers: no gap, and they count as the page's steps.
    expect(kinds(base, '1. Préchauffer le four.\n2. Mélanger.\n3. Verser.\n4. Cuire 40 minutes.')).toEqual([])
    // A quantity at a line start is not a step number (« 2 oeufs » has no sentence): the
    // list above the method never counts, and never hides a gap.
    expect(kinds(base, '2 oeufs\n4 pommes\n1 Préchauffer le four à 180 °C.\n2 Mélanger.\n3 Verser l’eau.\n4 Cuire 40 minutes.')).toEqual([])
  })

  it('missing-ingredient: the method pours what the list never names', () => {
    const d = { ...base, steps: [...base.steps, 'Napper de 125 ml de crème 35 %.'] }
    expect(auditDraft(d, null)).toEqual([{ kind: 'missing-ingredient', line: '125 ml de crème 35 %' }])
  })

  it('title-junk: a date, a bare label, the site’s share title', () => {
    expect(kinds({ ...base, title: '20 oct. 2026' })).toEqual(['title-junk'])
    expect(kinds({ ...base, title: 'Recette' })).toEqual(['title-junk'])
    expect(kinds({ ...base, title: 'Chili | Recettes du Québec' })).toEqual(['title-junk'])
  })

  it('dup-step: the same step twice', () => {
    expect(kinds({ ...base, steps: [...base.steps, 'Cuire 40 minutes.'] })).toEqual(['dup-step'])
  })

  it('empty-section: a part with nothing under it', () => {
    expect(kinds({ ...base, ingredients: [...base.ingredients, '## Glaçage'] })).toEqual(['empty-section'])
  })

  it('no-quantity: names without amounts', () => {
    expect(kinds({ ...base, ingredients: ['cassonade', 'eau', 'farine', 'œufs'] })).toEqual(['no-quantity'])
  })
})

describe('the corpus — hand-verified reads raise no flag (unless meta.audit names one)', () => {
  for (const e of loadCorpus()) {
    it(e.id, () => {
      const r = readPage(sourceFromHtml(e.html(), e.meta.url))
      expect(r.draft).not.toBeNull()
      expect(auditDraft(r.draft!, r.window).map((f) => f.kind)).toEqual(e.meta.audit ?? [])
    })
  }
})

describe('withAudit — every import response carries its audit', () => {
  it('a flagged read carries its source for the verify panel; a clean one does not', () => {
    const flagged = withAudit({ ...base, steps: [...base.steps, 'Cuire 40 minutes.'] }, 'SOURCE')
    expect(flagged.audit.map((f) => f.kind)).toEqual(['dup-step'])
    expect(flagged.transcript).toBe('SOURCE')
    const clean = withAudit(base, 'SOURCE')
    expect(clean.audit).toEqual([])
    expect(clean).not.toHaveProperty('transcript')
  })
  it('an empty draft is not audited', () => {
    expect(withAudit({ ...base, ingredients: [], steps: [], empty: true }, null).audit).toEqual([])
  })
})
