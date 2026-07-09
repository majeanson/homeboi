import { describe, it, expect } from 'vitest'
import { answerBlocks, speakableAnswer } from './askAnswer'

// E-22 — the AI answers in one or two sentences and puts an enumeration one item
// per line ("- Lime"). The card has to parse that shape back out: rendering it raw
// into a <p> collapses the newlines, which is how "où est la liste ?" came back as
// an unreadable comma-wall.
describe('answerBlocks', () => {
  it('keeps a plain one-sentence answer as a single paragraph', () => {
    expect(answerBlocks('Le souper de vendredi, c’est du pâté chinois.')).toEqual([
      { kind: 'p', text: 'Le souper de vendredi, c’est du pâté chinois.' },
    ])
  })

  it('turns a run of bullet lines into one list, under its lead sentence', () => {
    expect(answerBlocks('Il y a 3 articles :\n- Lime\n- Citron\n- Pain')).toEqual([
      { kind: 'p', text: 'Il y a 3 articles :' },
      { kind: 'ul', items: ['Lime', 'Citron', 'Pain'] },
    ])
  })

  it('accepts the bullet characters a model actually reaches for', () => {
    expect(answerBlocks('• Lime\n* Citron\n– Pain\n— Lait')).toEqual([
      { kind: 'ul', items: ['Lime', 'Citron', 'Pain', 'Lait'] },
    ])
  })

  it('starts a new list when prose interrupts, and drops blank lines', () => {
    expect(answerBlocks('- Lime\n\nEt aussi :\n- Pain')).toEqual([
      { kind: 'ul', items: ['Lime'] },
      { kind: 'p', text: 'Et aussi :' },
      { kind: 'ul', items: ['Pain'] },
    ])
  })

  it('does not mistake a hyphenated or negative word for a bullet', () => {
    expect(answerBlocks('-5 degrés dehors, rendez-vous à 8h.')).toEqual([
      { kind: 'p', text: '-5 degrés dehors, rendez-vous à 8h.' },
    ])
  })
})

// The dashes are a visual affordance, not words — read-aloud must not say
// "tiret, Lime, tiret, Citron".
describe('speakableAnswer', () => {
  it('strips the bullet markers and ends each line so the voice pauses', () => {
    expect(speakableAnswer('Il y a 2 articles :\n- Lime\n- Citron')).toBe('Il y a 2 articles : Lime. Citron.')
  })

  it('leaves a plain answer alone', () => {
    expect(speakableAnswer('Le dentiste, c’est mardi.')).toBe('Le dentiste, c’est mardi.')
  })
})
