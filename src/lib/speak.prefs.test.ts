// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { getRate, getVoicePref, setRate, setVoicePref } from './speak'

// The display prefs that back Réglages ▸ Affichage ▸ Voix: a per-language voice
// override and a shared speaking rate, both persisted in localStorage.
describe('voice prefs', () => {
  beforeEach(() => localStorage.clear())

  it('stores the voice override per language, independently', () => {
    setVoicePref('fr', 'com.apple.voice.enhanced.fr-CA.Amelie')
    setVoicePref('en', 'com.apple.voice.premium.en-CA.Liam')
    expect(getVoicePref('fr')).toBe('com.apple.voice.enhanced.fr-CA.Amelie')
    expect(getVoicePref('en')).toBe('com.apple.voice.premium.en-CA.Liam')
  })

  it('clears an override back to auto with an empty string', () => {
    setVoicePref('fr', 'some-voice')
    setVoicePref('fr', '')
    expect(getVoicePref('fr')).toBe('')
  })

  it('defaults to auto (empty) when nothing is stored', () => {
    expect(getVoicePref('fr')).toBe('')
    expect(getVoicePref('en')).toBe('')
  })

  it('round-trips a valid speaking rate', () => {
    setRate(1.2)
    expect(getRate()).toBe(1.2)
  })

  it('clamps an out-of-range or garbage rate back to 1', () => {
    setRate(9)
    expect(getRate()).toBe(1)
    localStorage.setItem('babillard-voice-rate', 'nope')
    expect(getRate()).toBe(1)
  })

  it('defaults the rate to 1 when unset', () => {
    expect(getRate()).toBe(1)
  })
})
