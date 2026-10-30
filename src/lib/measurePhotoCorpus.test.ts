// @vitest-environment node
// The photo corpus's READER ERRORS, on the verify panel's side (2026-10-30). The text
// path cannot mend a glyph the reader flipped (« 160 ml (⅔ de tasse) » read as « ¼ »,
// Marc's « Porc tropical »); what it CAN do is flag the line — `measuresDisagree` sees
// 160 ml against a quarter cup and the cook looks at the photo. Each measured reader
// error in functions/test/fixtures/recipes/photos/*/meta.json (« truth → read ») must be
// flagged as read and quiet as printed, or the panel is silent on exactly the kind of
// error it exists for.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { measuresDisagree } from './measure'
import { normalizeOcrText } from './ocr'

const DIR = join(import.meta.dirname, '..', '..', 'functions', 'test', 'fixtures', 'recipes', 'photos')
const measured: { id: string; truth: string; read: string }[] = []
for (const id of readdirSync(DIR)) {
  const meta = JSON.parse(readFileSync(join(DIR, id, 'meta.json'), 'utf8')) as { readerErrors?: string[] }
  for (const e of meta.readerErrors ?? []) {
    const [truth, read] = e.split(' → ')
    if (truth && read && /\d+\s*ml\s*\(/.test(read)) measured.push({ id, truth, read })
  }
}

describe('photo corpus — a misread measure is flagged by the verify panel', () => {
  it('the corpus names at least one measured reader error (else this test guards nothing)', () => {
    expect(measured.length).toBeGreaterThanOrEqual(1)
  })
  for (const { id, truth, read } of measured) {
    it(`${id}: « ${read} » is flagged, « ${truth} » is not`, () => {
      // The vision transcript keeps its fraction glyphs; the form normalises them before
      // the panel measures (lib/ocr normalizeOcrText) — the same here.
      expect(measuresDisagree(normalizeOcrText(read)), `read as « ${read} » and not flagged`).toBe(true)
      expect(measuresDisagree(normalizeOcrText(truth)), `printed « ${truth} » and flagged`).toBe(false)
    })
  }
})
