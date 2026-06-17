import { describe, it, expect } from 'vitest'
import { cleanTranscript, isHallucination } from './transcript'

describe('cleanTranscript', () => {
  it('drops a whole-clip subtitle hallucination', () => {
    expect(cleanTranscript('Sous-titrage Société Radio-Canada')).toBe('')
    expect(cleanTranscript("Sous-titrage ST' 501")).toBe('')
    expect(cleanTranscript('Amara.org')).toBe('')
    expect(cleanTranscript("Merci d'avoir regardé cette vidéo !")).toBe('')
    expect(cleanTranscript('Thanks for watching!')).toBe('')
  })

  it('drops content-free noise', () => {
    expect(cleanTranscript('   ')).toBe('')
    expect(cleanTranscript('♪♪♪')).toBe('')
    expect(cleanTranscript('...')).toBe('')
  })

  it('keeps real speech, dropping a trailing credit sentence', () => {
    expect(cleanTranscript('Du lait et des œufs. Sous-titrage Radio-Canada')).toBe('Du lait et des œufs.')
  })

  it('leaves a clean transcript untouched', () => {
    expect(cleanTranscript('lait, œufs, pain')).toBe('lait, œufs, pain')
    expect(cleanTranscript('  pâté chinois ')).toBe('pâté chinois')
  })

  it('does not flag a real word that merely contains a marker substring', () => {
    // "amaranthe" contains "amara" but is a real grain — must survive.
    expect(isHallucination('amaranthe')).toBe(false)
    expect(cleanTranscript('amaranthe')).toBe('amaranthe')
  })

  it('flags the credits but not ordinary words', () => {
    expect(isHallucination('Sous-titres réalisés par la communauté')).toBe(true)
    expect(isHallucination('lait')).toBe(false)
  })
})
