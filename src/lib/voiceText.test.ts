import { describe, it, expect } from 'vitest'
import { cleanSpokenItem } from './voiceText'

describe('cleanSpokenItem', () => {
  it('strips a French lead-in and article, then capitalizes', () => {
    expect(cleanSpokenItem("j'aimerais avoir des œufs")).toBe('Œufs')
    expect(cleanSpokenItem('du lait')).toBe('Lait')
    expect(cleanSpokenItem('des framboises')).toBe('Framboises')
    expect(cleanSpokenItem('ajoute du pain')).toBe('Pain')
    expect(cleanSpokenItem('il me faut du beurre')).toBe('Beurre')
    expect(cleanSpokenItem('de la crème')).toBe('Crème')
  })

  it('strips an English lead-in and article', () => {
    expect(cleanSpokenItem('add some milk')).toBe('Milk')
    expect(cleanSpokenItem('i need eggs')).toBe('Eggs')
    expect(cleanSpokenItem('get the bread')).toBe('Bread')
  })

  it('keeps multi-word item names whole (only the LEADING article goes)', () => {
    expect(cleanSpokenItem('du jus d’orange')).toBe('Jus d’orange')
    expect(cleanSpokenItem('pâté chinois')).toBe('Pâté chinois')
    expect(cleanSpokenItem("beurre d'arachide")).toBe("Beurre d'arachide")
  })

  it('trims quotes and trailing punctuation', () => {
    expect(cleanSpokenItem('« lait ».')).toBe('Lait')
    expect(cleanSpokenItem('oeufs!')).toBe('Oeufs')
  })

  it('returns empty when only filler is left', () => {
    expect(cleanSpokenItem("j'aimerais avoir")).toBe('')
    expect(cleanSpokenItem('   ')).toBe('')
  })

  it('leaves a bare item alone but capitalized', () => {
    expect(cleanSpokenItem('lait')).toBe('Lait')
    expect(cleanSpokenItem('Pommes')).toBe('Pommes')
  })
})
