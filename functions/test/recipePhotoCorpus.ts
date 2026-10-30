import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Expected } from './recipeCorpus'

// THE PHOTO CORPUS (2026-10-30) — real cookbook pages photographed on a phone, with the
// transcript the vision reader ACTUALLY returned and a hand-verified expected read. One
// folder per recipe under functions/test/fixtures/recipes/photos/:
//   page-N.jpg             the photo, downscaled to 1500 px (what the reader sees is
//                          ~1120 px — lib/image VISION_MAX); absent for a duplicate shot
//   page-N.transcript.txt  the reader's transcript of that page, verbatim
//   meta.json              { pages, readerModel, readAt, notes, pending?, readerErrors? }
//   expected.json          what a cook would type from the PAGE — verified by reading it
//
// Two readers of this corpus, deliberately split:
//   recipePhotoCorpus.test.ts (every push) — the DETERMINISTIC half: the transcripts are
//     stitched (lib/ocrMerge) and structured without a model, and the test demands that
//     every expected line is ONE whole pickable line of the stitched text and that the
//     draft built from those lines is exactly the expectation. That is the half that
//     broke on 2026-10-30 (lines swallowed by the merge, cut at sentences, a column-break
//     remainder dropped) — none of it needed a model to go wrong.
//   scripts/recipe-photos.mjs (on demand) — the LIVE half: re-reads the photos through the
//     deployed reader and the deployed selection model, and scores the result against
//     expected.json. The reader is non-deterministic; one run proves nothing, three say
//     something.
//
// `meta.readerErrors` names what the READER got wrong on the page (a ⅔ read as ¼, a step
// lost at a column break) — the text path cannot mend those, so expected.json holds the
// page's truth and the entry is `pending` until a better read replaces the transcript.

export const PHOTO_CORPUS_DIR = join(import.meta.dirname, 'fixtures', 'recipes', 'photos')

export interface PhotoMeta {
  pages: number
  source: string
  shot: string
  readAt: string
  readerModel: string
  notes?: string
  // A KNOWN gap with what closes it — the test then demands the entry still mismatch.
  pending?: string
  // What the reader misread on the page, one line each (the verify panel's job).
  readerErrors?: string[]
  // The audit flags this entry SHOULD raise (none unless named).
  audit?: string[]
}

export interface PhotoEntry {
  id: string
  dir: string
  meta: PhotoMeta
  expected: Expected | null
  transcripts: string[]
}

export function loadPhotoCorpus(dir = PHOTO_CORPUS_DIR): PhotoEntry[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((id) => {
      const p = join(dir, id)
      const meta = JSON.parse(readFileSync(join(p, 'meta.json'), 'utf8')) as PhotoMeta
      const ex = join(p, 'expected.json')
      const transcripts: string[] = []
      for (let i = 1; i <= meta.pages; i++) transcripts.push(readFileSync(join(p, `page-${i}.transcript.txt`), 'utf8'))
      return {
        id,
        dir: p,
        meta,
        expected: existsSync(ex) ? (JSON.parse(readFileSync(ex, 'utf8')) as Expected) : null,
        transcripts,
      }
    })
}
