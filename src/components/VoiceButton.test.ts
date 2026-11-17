import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { VoiceStatus } from './VoiceButton'
import type { VoiceInput } from '../lib/useVoiceInput'

// Review 2026-11-17, P1 #8 (five of seven personas): a red « Micro bloqué » sat under the
// field on every load, before anyone had tried to speak. The browser remembering a denial
// is not news for someone who never meant to use the mic; a tap that fails is.

afterEach(cleanup)

const voice = (over: Partial<VoiceInput>): VoiceInput => ({ listening: false, hasVoice: true, error: null, permission: 'unknown', start: () => {}, stop: () => {}, ...over })

describe('VoiceStatus', () => {
  it('says nothing about a remembered denial before a mic attempt', () => {
    const { container } = render(createElement(VoiceStatus, { voice: voice({ permission: 'denied' }) }))
    expect(container.textContent).toBe('')
  })

  it('says it is blocked once a tap has been refused', () => {
    const { container } = render(createElement(VoiceStatus, { voice: voice({ permission: 'denied', error: 'not-allowed' }) }))
    expect(container.textContent).toMatch(/Micro bloqué/)
  })
})
