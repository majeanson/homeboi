// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { pickBestVoice } from './speak'

// iOS-realistic fixtures: Apple exposes the quality tier only through the
// voiceURI (compact / enhanced / premium / eloquence), and lists compact first.
const v = (name: string, lang: string, voiceURI: string) => ({ name, lang, voiceURI })

const COMPACT_FRCA = v('Amélie', 'fr-CA', 'com.apple.voice.compact.fr-CA.Amelie')
const ENHANCED_FRCA = v('Amélie (Enhanced)', 'fr-CA', 'com.apple.voice.enhanced.fr-CA.Amelie')
const PREMIUM_FRFR = v('Audrey (Premium)', 'fr-FR', 'com.apple.voice.premium.fr-FR.Audrey')
const ENHANCED_FRFR = v('Thomas (Enhanced)', 'fr-FR', 'com.apple.voice.enhanced.fr-FR.Thomas')
const COMPACT_FRFR = v('Thomas', 'fr-FR', 'com.apple.voice.compact.fr-FR.Thomas')
const ELOQUENCE_FR = v('Eddy (français (Canada))', 'fr-CA', 'com.apple.eloquence.fr-CA.Eddy')
const COMPACT_EN = v('Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha')

describe('pickBestVoice', () => {
  it('picks the user-installed enhanced voice over the compact one iOS lists first', () => {
    expect(pickBestVoice([COMPACT_FRCA, ELOQUENCE_FR, ENHANCED_FRCA], 'fr-CA')).toBe(ENHANCED_FRCA)
  })

  it('quality beats locale variant — an enhanced fr-FR wins over a compact fr-CA', () => {
    expect(pickBestVoice([COMPACT_FRCA, ENHANCED_FRFR], 'fr-CA')).toBe(ENHANCED_FRFR)
  })

  it('premium beats enhanced', () => {
    expect(pickBestVoice([ENHANCED_FRFR, PREMIUM_FRFR], 'fr-CA')).toBe(PREMIUM_FRFR)
  })

  it('on equal quality, the exact locale wins (fr-CA over fr-FR for fr-CA)', () => {
    expect(pickBestVoice([ENHANCED_FRFR, ENHANCED_FRCA], 'fr-CA')).toBe(ENHANCED_FRCA)
    expect(pickBestVoice([COMPACT_FRFR, COMPACT_FRCA], 'fr-CA')).toBe(COMPACT_FRCA)
  })

  it('never picks an eloquence novelty voice when anything else exists', () => {
    expect(pickBestVoice([ELOQUENCE_FR, COMPACT_FRFR], 'fr-CA')).toBe(COMPACT_FRFR)
  })

  it('falls back to eloquence only when it is the whole family', () => {
    expect(pickBestVoice([ELOQUENCE_FR, COMPACT_EN], 'fr-CA')).toBe(ELOQUENCE_FR)
  })

  it('never crosses the language family', () => {
    expect(pickBestVoice([COMPACT_EN], 'fr-CA')).toBeNull()
  })

  it('tolerates underscore locale tags (fr_CA)', () => {
    const odd = v('Amélie', 'fr_CA', 'compact')
    expect(pickBestVoice([COMPACT_EN, odd], 'fr-CA')).toBe(odd)
  })
})
