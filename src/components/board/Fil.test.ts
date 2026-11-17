import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Fil } from './Fil'

// Review 2026-11-17, P1 #9: the day page of a FUTURE day showed « Maintenant · 9 h 45 »
// above its first row. Another day has no « now » in it.
afterEach(cleanup)

const now = Math.floor(Date.now() / 1000)
const props = (showNow?: boolean) => ({
  timed: [
    { id: 'a', start_at: now + 3600, node: createElement('span', null, 'A') },
    { id: 'b', start_at: now + 7200, node: createElement('span', null, 'B') },
  ],
  untimed: [],
  anytimeLabel: 'À tout moment',
  nowLabel: 'Maintenant',
  freeLabel: 'Libre',
  lang: 'fr' as const,
  ...(showNow === undefined ? {} : { showNow }),
})

describe('Fil — the « maintenant » marker', () => {
  it('is drawn on today (the default)', () => {
    const { container } = render(createElement(Fil, props()))
    expect(container.querySelectorAll('.fil__now')).toHaveLength(1)
  })
  it('is not drawn on another day', () => {
    const { container } = render(createElement(Fil, props(false)))
    expect(container.querySelectorAll('.fil__now')).toHaveLength(0)
  })
})
