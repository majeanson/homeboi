import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { ocrImage, disposeOcr, normalizeOcrText, mergeOcrPages, columnizeOcrPage } from './ocr'

// tesseract.js is a heavy WASM package; ocr.ts dynamic-imports it. Mock the module
// so these stay pure-logic — we're testing the wrapper (degrade-to-empty, text +
// low-confidence extraction), not the engine.
vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }))

const mockCreateWorker = vi.mocked(createWorker)
const blob = new Blob(['x'], { type: 'image/jpeg' })

afterEach(async () => {
  await disposeOcr() // reset the singleton worker between cases
  vi.clearAllMocks()
})

describe('ocrImage', () => {
  it('degrades to empty when the worker fails to create', async () => {
    mockCreateWorker.mockRejectedValueOnce(new Error('no wasm'))
    const r = await ocrImage(blob)
    expect(r).toEqual({ text: '', confidence: 0, lowConfidenceWords: [] })
  })

  it('degrades to empty when recognize throws', async () => {
    mockCreateWorker.mockResolvedValueOnce({
      recognize: vi.fn().mockRejectedValue(new Error('boom')),
      terminate: vi.fn(),
    } as never)
    const r = await ocrImage(blob)
    expect(r.text).toBe('')
    expect(r.confidence).toBe(0)
  })

  it('returns the text, mean confidence, and only the shaky words', async () => {
    const page = {
      text: 'Farine 3/4 tasse',
      confidence: 88,
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    { text: 'Farine', confidence: 95 },
                    { text: '3/4', confidence: 40 }, // shaky number → flagged
                    { text: 'tasse', confidence: 92 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    mockCreateWorker.mockResolvedValueOnce({
      recognize: vi.fn().mockResolvedValue({ data: page }),
      setParameters: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as never)
    const r = await ocrImage(blob)
    expect(r.text).toBe('Farine 3/4 tasse')
    expect(r.confidence).toBe(88)
    expect(r.lowConfidenceWords).toEqual(['3/4'])
  })

  it('normalizes vulgar fraction glyphs to ASCII (so measure pills parse them)', () => {
    expect(normalizeOcrText('¾ tasse de farine')).toBe('3/4 tasse de farine')
    expect(normalizeOcrText('½ c. à thé de sel')).toBe('1/2 c. à thé de sel')
    expect(normalizeOcrText('1½ tasse')).toBe('1 1/2 tasse') // mixed number
    expect(normalizeOcrText('1 ⅓ tasse')).toBe('1 1/3 tasse')
    expect(normalizeOcrText('farine')).toBe('farine') // untouched
    expect(normalizeOcrText('')).toBe('')
  })
})

describe('mergeOcrPages', () => {
  it('returns the single page unchanged', () => {
    expect(mergeOcrPages(['3/4 tasse de farine\n2 oeufs'])).toBe('3/4 tasse de farine\n2 oeufs')
    expect(mergeOcrPages([])).toBe('')
  })

  it('lets a zoomed close-up REPLACE the matching fuzzy line, not duplicate it', () => {
    const wide = '% tasse de farine\n2 oeufs\n1 pincee de sel'
    const zoom = '3/4 tasse de farine' // the same line, read clearly
    expect(mergeOcrPages([wide, zoom])).toBe('3/4 tasse de farine\n2 oeufs\n1 pincee de sel')
  })

  it('appends a non-overlapping page (ingredients + steps) instead of merging', () => {
    const ingredients = '3/4 tasse de farine\n2 oeufs'
    const steps = 'Melanger le tout\nCuire 12 minutes'
    expect(mergeOcrPages([ingredients, steps])).toBe(
      '3/4 tasse de farine\n2 oeufs\nMelanger le tout\nCuire 12 minutes',
    )
  })
})

// Build a bboxed page tree the way Tesseract merges a 2-column recipe: each
// physical "line" carries column 1's words THEN column 2's words, and data.text
// joins them ("de 85 g chacun soupe) de miel" — the invented-ingredient bug).
// Column 1 occupies x 0–400, column 2 x 600–1000; word height 20.
function twoColumnPage() {
  const H = 20
  const mkLine = (y: number, col1: string, col2: string) => {
    const words = (text: string, startX: number) =>
      text.split(' ').map((w, i) => ({
        text: w,
        confidence: 90,
        bbox: { x0: startX + i * 80, y0: y, x1: startX + i * 80 + 70, y1: y + H },
      }))
    return { words: [...words(col1, 0), ...words(col2, 600)] }
  }
  const rows: [string, string][] = [
    ['225 g de ramens', '22,5 ml de vinaigre'],
    ['de 85 g chacun', 'soupe) de miel'],
    ['1 grosse carotte', '10 ml d’ail'],
    ['500 ml de chou', '7,5 ml d’huile'],
    ['80 ml d’arachides', '2,5 ml de sriracha'],
    ['60 ml de coriandre', '2,5 ml de gingembre'],
    ['45 ml de beurre', '16 crevettes cuites'],
    ['22,5 ml d’eau', '450 g de poulet'],
  ]
  return {
    text: rows.map(([a, b]) => `${a} ${b}`).join('\n'), // the merged (buggy) order
    confidence: 90,
    blocks: [{ paragraphs: [{ lines: rows.map(([a, b], i) => mkLine(i * 30, a, b)) }] }],
  }
}

describe('columnizeOcrPage', () => {
  it('re-reads a two-column page column by column — never "85 g de miel"', () => {
    const out = columnizeOcrPage(twoColumnPage() as never)
    expect(out).toBeTruthy()
    const lines = out!.split('\n')
    // The two fragments Tesseract had merged are separate lines again…
    expect(lines).toContain('de 85 g chacun')
    expect(lines).toContain('soupe) de miel')
    // …and no line mixes the columns.
    expect(lines.some((l) => l.includes('chacun') && l.includes('miel'))).toBe(false)
    // Column 1 reads out in full before column 2 begins.
    expect(lines.indexOf('45 ml de beurre')).toBeLessThan(lines.indexOf('22,5 ml de vinaigre'))
  })

  it('leaves a single-column page alone (null → caller keeps engine order)', () => {
    const H = 20
    const lines = ['Melanger le tout', 'Cuire 12 minutes', 'Saler au gout', 'Servir chaud', 'Bon appetit ici', 'Une derniere ligne'].map(
      (text, row) => ({
        words: text.split(' ').map((w, i) => ({
          text: w,
          confidence: 90,
          bbox: { x0: i * 200, y0: row * 30, x1: i * 200 + 180, y1: row * 30 + H },
        })),
      }),
    )
    const page = { text: 'x', confidence: 90, blocks: [{ paragraphs: [{ lines }] }] }
    expect(columnizeOcrPage(page as never)).toBeNull()
  })

  it('emits a big straddling title first, not sliced into the columns', () => {
    const page = twoColumnPage()
    // A display-size title (height 60 ≫ 1.8 × the 20px body) spanning both columns.
    page.blocks[0].paragraphs[0].lines.unshift({
      words: [
        { text: 'Salade', confidence: 90, bbox: { x0: 100, y0: -80, x1: 400, y1: -20 } },
        { text: 'de', confidence: 90, bbox: { x0: 420, y0: -80, x1: 560, y1: -20 } },
        { text: 'ramens', confidence: 90, bbox: { x0: 580, y0: -80, x1: 900, y1: -20 } },
      ],
    })
    const out = columnizeOcrPage(page as never)
    expect(out!.split('\n')[0]).toBe('Salade de ramens')
  })
})

describe('ocrImage column path', () => {
  it('prefers the columnized read over the merged engine text', async () => {
    mockCreateWorker.mockResolvedValueOnce({
      recognize: vi.fn().mockResolvedValue({ data: twoColumnPage() }),
      terminate: vi.fn(),
    } as never)
    const r = await ocrImage(blob)
    expect(r.text).not.toContain('chacun soupe')
    expect(r.text.split('\n')).toContain('soupe) de miel')
  })

  it('asks the engine for the blocks output (v6 defaults it off)', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: 'hi', confidence: 50, blocks: null } })
    mockCreateWorker.mockResolvedValueOnce({ recognize, terminate: vi.fn() } as never)
    await ocrImage(blob)
    expect(recognize).toHaveBeenCalledWith(blob, {}, { text: true, blocks: true })
  })
})

describe('ocrImage edge', () => {
  it('tolerates a null block tree (no words) without throwing', async () => {
    mockCreateWorker.mockResolvedValueOnce({
      recognize: vi.fn().mockResolvedValue({ data: { text: 'hi', confidence: 50, blocks: null } }),
      setParameters: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as never)
    const r = await ocrImage(blob)
    expect(r.text).toBe('hi')
    expect(r.lowConfidenceWords).toEqual([])
  })
})
