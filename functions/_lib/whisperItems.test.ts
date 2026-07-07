import { describe, it, expect } from 'vitest'
import { isRealSegment, pickItems, realText, type WhisperSegment } from './whisperItems'

// A word helper — Whisper attaches list punctuation to the token ("pommes,").
function w(word: string, start: number, end: number) {
  return { word, start, end }
}

describe('isRealSegment', () => {
  it('keeps confident speech', () => {
    expect(isRealSegment({ text: 'pommes', no_speech_prob: 0.01, compression_ratio: 1.2 })).toBe(true)
  })

  it('drops a silence hallucination (high no_speech_prob)', () => {
    expect(isRealSegment({ text: 'pommes', no_speech_prob: 0.92, compression_ratio: 1.1 })).toBe(false)
  })

  it('drops a repetition loop (high compression_ratio) — the "Pommes × 6" bug', () => {
    expect(
      isRealSegment({ text: 'pommes, pommes, pommes, pommes', no_speech_prob: 0.1, compression_ratio: 3.5 }),
    ).toBe(false)
  })

  it('drops a subtitle-credit hallucination by its text', () => {
    expect(isRealSegment({ text: 'Sous-titrage Société Radio-Canada', no_speech_prob: 0.2, compression_ratio: 1.5 })).toBe(
      false,
    )
  })
})

describe('pickItems', () => {
  it('splits a spoken list on the pauses between words', () => {
    // "pommes … tomates … pain" — real gaps (>0.6s) between the three groceries.
    const segs: WhisperSegment[] = [
      {
        text: 'pommes tomates pain',
        no_speech_prob: 0.02,
        compression_ratio: 1.3,
        words: [w('pommes', 0.0, 0.5), w('tomates', 1.4, 2.0), w('pain', 3.0, 3.4)],
      },
    ]
    expect(pickItems(segs)).toEqual(['pommes', 'tomates', 'pain'])
  })

  it('keeps a multi-word item whole (micro-gaps stay together)', () => {
    const segs: WhisperSegment[] = [
      {
        no_speech_prob: 0.02,
        compression_ratio: 1.1,
        // "beurre d'arachide" then a real pause, then "lait"
        words: [w('beurre', 0.0, 0.4), w("d'arachide", 0.5, 1.0), w('lait', 2.2, 2.6)],
      },
    ]
    expect(pickItems(segs)).toEqual(["beurre d'arachide", 'lait'])
  })

  it('also splits on the comma Whisper attaches to a word', () => {
    const segs: WhisperSegment[] = [
      {
        no_speech_prob: 0.02,
        compression_ratio: 1.2,
        words: [w('lait,', 0.0, 0.4), w('œufs,', 0.5, 0.9), w('pain', 1.0, 1.4)],
      },
    ]
    expect(pickItems(segs)).toEqual(['lait', 'œufs', 'pain'])
  })

  it('drops words from a hallucinated segment but keeps the real one', () => {
    const segs: WhisperSegment[] = [
      { no_speech_prob: 0.95, compression_ratio: 1.1, words: [w('pommes', 0, 0.4)] }, // silence junk
      { no_speech_prob: 0.02, compression_ratio: 1.2, words: [w('lait', 1.0, 1.4)] },
    ]
    expect(pickItems(segs)).toEqual(['lait'])
  })

  it('returns [] when the build gave no per-word timestamps', () => {
    expect(pickItems([{ text: 'lait, œufs', no_speech_prob: 0.02, compression_ratio: 1.2 }])).toEqual([])
  })
})

describe('realText (fallback when there are no word timings)', () => {
  it('joins only the real-speech segments', () => {
    const segs: WhisperSegment[] = [
      { text: 'lait, œufs', no_speech_prob: 0.02, compression_ratio: 1.2 },
      { text: 'Sous-titrage Radio-Canada', no_speech_prob: 0.2, compression_ratio: 1.5 },
      { text: 'pain', no_speech_prob: 0.9, compression_ratio: 1.1 }, // silence junk dropped
    ]
    expect(realText(segs)).toBe('lait, œufs')
  })
})
