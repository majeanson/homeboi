// @vitest-environment node
// THE PERFECTION METER (2026-10-27). Every real page in the corpus
// (functions/test/fixtures/recipes/corpus/) is read through the production seam —
// importFromHtml, the exact no-model path api/recipe-import takes — and must come out
// EXACTLY as the hand-verified expected.json says: title, yield, times, every ingredient
// line, every step, the parts, the notes, and how it was read. A mismatch prints the
// first differing field.
//
// It is a RATCHET: entries are only ever added (scripts/recipe-corpus.mjs capture <url>,
// then verify expected.json by reading the page). An entry whose meta.json names a
// `pending` gap must still MISMATCH — so the day the gap closes, the marker has to come
// off and the entry joins the exact set.
import { describe, expect, it } from 'vitest'
import { diffExpected, expectedOf, loadCorpus } from '../test/recipeCorpus'
import { importFromHtml } from './recipeImportPage'

const corpus = loadCorpus()

describe('recipe corpus — real pages, read exactly', () => {
  it('the corpus is there (a scan of nothing would pass forever)', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(12)
    for (const e of corpus) expect(e.expected, `${e.id} has no expected.json`).not.toBeNull()
  })

  for (const e of corpus) {
    if (!e.expected) continue
    const want = e.expected
    it(`${e.id}${e.meta.pending ? ` (pending: ${e.meta.pending})` : ''}`, () => {
      const diff = diffExpected(want, expectedOf(importFromHtml(e.html(), e.meta.url)))
      if (e.meta.pending) {
        expect(diff, `${e.id} now reads exactly — remove meta.pending (« ${e.meta.pending} »)`).not.toEqual([])
      } else {
        expect(diff, `${e.id}\n${diff.join('\n')}`).toEqual([])
      }
    })
  }
})
