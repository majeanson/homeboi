// @vitest-environment node
// THE PHOTO CORPUS — real cookbook pages, the reader's real transcripts, read exactly
// without a model (2026-10-30). See functions/test/recipePhotoCorpus.ts for the layout.
//
// Why no model here: on 2026-10-30 Marc's « Saumon à l'asiatique » came back with page 2's
// sauce REPLACING page 1's marinade, printed step 3 as three steps and a column-break
// remainder dropped — and not one of those needed the model to go wrong. They were the
// merge, the line segmentation and a missing rejoin: all deterministic, all between the
// reader's transcript and the model's choice. So this test holds exactly that stretch:
//
//   1. STITCHED WHOLE — every line of every page survives the merge (nothing swallowed as
//      a « clearer read » of another line), in page order.
//   2. PICKABLE WHOLE — every line the cook expects (ingredient, step, note, label) is ONE
//      line of what the selection model would be shown: never cut at a sentence or an
//      amount, never left as two halves across a column break.
//   3. EXACT — the draft built from those lines (the same code the model's choice goes
//      through: parts, refineSteps, the repair, the text's own yield/times/title) is the
//      hand-verified expected.json, field for field.
//
// It is a RATCHET like the URL corpus: entries are added (scripts/recipe-photos.mjs add,
// read, propose — then VERIFY by reading the page), never loosened. An entry whose
// meta.json names `pending` (a reader error the text path cannot mend: a ⅔ read as ¼, a
// step lost at a column break) must still mismatch on step 3 — but 1 and 2 hold for it
// too, for every expected line the reader did transcribe.
import { describe, expect, it } from 'vitest'
import { mergeOcrPages } from '../../src/lib/ocrMerge'
import { type Expected, diffExpected as diffRaw, expectedOf as rawOf } from '../test/recipeCorpus'
import { canonExpected, loadPhotoCorpus, perfectSelection } from '../test/recipePhotoCorpus'

// Every comparison apostrophe-blind (recipePhotoCorpus canon): « d’huile » and « d'huile »
// are one word.
const expectedOf: typeof rawOf = (d) => canonExpected(rawOf(d))
const diffExpected = (want: Expected, got: Expected) => diffRaw(canonExpected(want), got)
import { selectionLines } from './ai'
import { draft, draftFromSelection, readText } from './recipeDraft'

const corpus = loadPhotoCorpus()
const unheading = (l: string) => l.replace(/^##\s*/, '')

describe('photo corpus — real pages, the reader’s real transcripts, read exactly without a model', () => {
  it('the corpus is there (a scan of nothing would pass forever)', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(8)
    for (const e of corpus) expect(e.expected, `${e.id} has no expected.json`).not.toBeNull()
  })

  for (const e of corpus) {
    if (!e.expected) continue
    const want = e.expected
    const stitched = mergeOcrPages(e.transcripts)
    const lines = selectionLines(stitched)

    it(`${e.id} · 1. stitched whole — every line of every page survives, in order`, () => {
      const stitchedLines = stitched.split('\n')
      let at = 0
      for (const [p, page] of e.transcripts.entries()) {
        for (const line of page.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
          // A duplicate shot of the same page (…-bis) legitimately merges INTO the base
          // page, so a line may sit at an earlier index than the previous one — but it
          // must be there.
          const i = stitchedLines.indexOf(line, p === 0 ? at : 0)
          expect(i, `page ${p + 1}: « ${line} » is not in the stitched text`).toBeGreaterThanOrEqual(0)
          if (p === 0) at = i + 1
        }
      }
    })

    it(`${e.id} · 2. pickable whole — every expected line is ONE line the model could choose`, () => {
      const { missing } = perfectSelection(lines, want)
      // A line the reader never transcribed is the READER's miss (meta.readerErrors), not a
      // cut: only a line whose words ARE in the text, but not as one line, fails here.
      // Digits and fraction glyphs stay in the comparison (a « ⅔ » read as « ¼ » is a
      // reader miss, not a cut); case and accents do not.
      const loose = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[''’]/g, "'").replace(/\s+/g, ' ')
      const inText = (s: string) => loose(stitched).includes(loose(unheading(s.replace(/^\(note\) /, ''))))
      const cut = missing.filter(inText)
      expect(cut, `${e.id}: expected lines present in the text but not as ONE pickable line:\n${cut.map((c) => `  « ${c} »`).join('\n')}\n\nlines:\n${lines.map((l, i) => `  ${i}: ${l}`).join('\n')}`).toEqual([])
      if (!e.meta.pending) expect(missing, `${e.id}: expected lines absent from the transcript (a reader miss needs meta.pending + readerErrors)`).toEqual([])
    })

    it(`${e.id} · 3. exact${e.meta.pending ? ` (pending: ${e.meta.pending})` : ''}`, () => {
      const r = readText(stitched)
      const { sel } = perfectSelection(lines, want)
      const built = draftFromSelection(lines, sel, r.known)
      expect(built, `${e.id}: nothing could be built`).not.toBeNull()
      const got = expectedOf(draft({ ...built!, structuring: 'ai' }))
      const diff = diffExpected(want, got)
      if (e.meta.pending) {
        expect(diff, `${e.id} now reads exactly — remove meta.pending (« ${e.meta.pending} »)`).not.toEqual([])
      } else {
        expect(diff, `${e.id}\n${diff.join('\n')}`).toEqual([])
      }
    })

    // The SHAPE read, when it is sure of itself, skips the model on the live path — so on
    // a page it claims, it must be exactly right too. Deployed on 2026-10-30 it claimed
    // the quiche and the pâté and put « Sel au goût » and the page's blurb in the steps.
    it(`${e.id} · 4. the shape read, when confident, is exact too${e.meta.pending ? ' (pending: skipped)' : ''}`, () => {
      if (e.meta.pending) return
      const r = readText(stitched)
      if (!r.read) return // not confident: the model path above is the one that runs
      const got = expectedOf(r.read)
      const diff = diffExpected({ ...want, structuring: got.structuring }, got)
      expect(diff, `${e.id} (shape read, structuring ${got.structuring})\n${diff.join('\n')}`).toEqual([])
    })
  }
})
