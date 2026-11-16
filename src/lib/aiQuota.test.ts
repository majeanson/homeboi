import { describe, expect, it } from 'vitest'
import { aiSpentKind, isAccountQuotaMessage } from './aiQuota'

describe('a spent AI allowance is recognised by its words', () => {
  it.each([
    ['4006: you have used up your daily free allocation of 10,000 neurons, please upgrade…', 'quota'],
    ['3036: Account limited', 'quota'],
    ['AI daily budget spent (1001/1000)', 'budget'],
    ['HTTP 429 {"message":"Rate limit exceeded"}', null], // a rate limit is not a day's allowance
    ['fetch failed', null],
  ] as const)('%s → %s', (message, want) => {
    expect(aiSpentKind(message)).toBe(want)
    expect(isAccountQuotaMessage(message)).toBe(want === 'quota')
  })
})
