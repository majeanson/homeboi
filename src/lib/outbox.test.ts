import { describe, it, expect } from 'vitest'
import { replayVerdict, MAX_ATTEMPTS } from './outbox'
import { ApiError } from './api'

describe('replayVerdict', () => {
  const apiErr = (status: number) => new ApiError(status, `boom ${status}`)

  it('401 stops the run for the auth-lost path (which clears the queue)', () => {
    expect(replayVerdict(apiErr(401), 0)).toBe('auth-lost')
  })

  it('drops a 4xx as moot — the row is gone/forbidden, the poll reconciles', () => {
    expect(replayVerdict(apiErr(404), 0)).toBe('drop')
    expect(replayVerdict(apiErr(403), 3)).toBe('drop')
    expect(replayVerdict(apiErr(409), 0)).toBe('drop')
  })

  // Review #38: « not now » is not « never ». A rate limit or a timeout says nothing about the
  // write; dropping it lost a write the server would have taken a minute later.
  it('keeps a 408 / 425 / 429 to try again, bounded like a 5xx', () => {
    for (const s of [408, 425, 429]) {
      expect(replayVerdict(apiErr(s), 0), String(s)).toBe('retry')
      expect(replayVerdict(apiErr(s), MAX_ATTEMPTS - 1), String(s)).toBe('dead-letter')
    }
  })

  it('retries a 5xx while the entry has attempts left', () => {
    expect(replayVerdict(apiErr(500), 0)).toBe('retry')
    expect(replayVerdict(apiErr(503), MAX_ATTEMPTS - 2)).toBe('retry')
  })

  it('dead-letters a 5xx once THIS attempt reaches the cap', () => {
    expect(replayVerdict(apiErr(500), MAX_ATTEMPTS - 1)).toBe('dead-letter')
    expect(replayVerdict(apiErr(500), MAX_ATTEMPTS + 9)).toBe('dead-letter')
  })

  it('waits on a transport failure WITHOUT spending an attempt', () => {
    // fetch rejects with a TypeError when the connection fails: no server answer,
    // so it says nothing about this entry. Being offline five times in a row must
    // never dead-letter a perfectly good write.
    expect(replayVerdict(new TypeError('Failed to fetch'), 0)).toBe('wait')
    expect(replayVerdict(new TypeError('Failed to fetch'), MAX_ATTEMPTS + 3)).toBe('wait')
  })
})
