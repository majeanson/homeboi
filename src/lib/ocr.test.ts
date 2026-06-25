import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { ocrImage, disposeOcr, normalizeOcrText, mergeOcrPages } from './ocr'

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
