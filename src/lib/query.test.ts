import { QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { onAuthLost } from './authEvents'
import { healOnError, live, liveInterval, queryClient } from './query'
import { isRealtimeConnected } from './realtime'

// Three promises. A revoked device lands on the right door at once, whichever request
// noticed first. The wall keeps a day of data, because the offline snapshot can only
// save what is still in the cache. And the board polls in the cheapest gear that costs
// no freshness: slower when a socket carries the news, quieter when nobody is there,
// and awake again on the first touch.

vi.mock('./realtime', () => ({ isRealtimeConnected: vi.fn(() => false) }))
const pushLive = vi.mocked(isRealtimeConnected)

const ONE_MINUTE = 60_000
const ONE_DAY = 24 * 60 * ONE_MINUTE

const touch = () => window.dispatchEvent(new Event('pointerdown'))
const fallAsleep = () => vi.setSystemTime(Date.now() + ONE_MINUTE)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  pushLive.mockReturnValue(false)
  touch()
})
afterEach(() => {
  queryClient.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('401: the whole app lands on the right door', () => {
  it('a query coming back unauthorized broadcasts it', async () => {
    const lost = vi.fn()
    const off = onAuthLost(lost)
    await queryClient
      .fetchQuery({ queryKey: ['a'], queryFn: () => Promise.reject(new ApiError(401, 'no')) })
      .catch(() => undefined)
    off()
    expect(lost).toHaveBeenCalledTimes(1)
  })

  it('a mutation coming back unauthorized broadcasts it too', async () => {
    const lost = vi.fn()
    const off = onAuthLost(lost)
    const m = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.reject(new ApiError(401, 'no')),
    })
    await m.execute(undefined).catch(() => undefined)
    off()
    expect(lost).toHaveBeenCalledTimes(1)
  })

  it('a server hiccup does not read as a lost session', async () => {
    const lost = vi.fn()
    const off = onAuthLost(lost)
    await queryClient
      .fetchQuery({ queryKey: ['b'], queryFn: () => Promise.reject(new ApiError(500, 'oops')) })
      .catch(() => undefined)
    off()
    expect(lost).not.toHaveBeenCalled()
  })
})

describe('retries', () => {
  const retry = queryClient.getDefaultOptions().queries!.retry as (n: number, e: Error) => boolean

  it('a 4xx will not fix itself: it fails at once', () => {
    expect(retry(0, new ApiError(401, 'no'))).toBe(false)
    expect(retry(0, new ApiError(400, 'bad'))).toBe(false)
  })

  it('a 5xx or a dropped connection gets two short tries, no more', () => {
    for (const err of [new ApiError(503, 'busy'), new TypeError('failed to fetch')]) {
      expect(retry(0, err)).toBe(true)
      expect(retry(1, err)).toBe(true)
      expect(retry(2, err)).toBe(false)
    }
  })
})

describe('the snapshot can only save what is still cached', () => {
  it('ten minutes on another tab does not garbage-collect the board', () => {
    vi.useFakeTimers()
    queryClient.setQueryData(['board-gc'], { list: [] })
    vi.advanceTimersByTime(10 * ONE_MINUTE)
    expect(queryClient.getQueryData(['board-gc'])).toBeDefined()
  })

  it('an inactive query lives a day, the age the snapshot restores', () => {
    vi.useFakeTimers()
    queryClient.setQueryData(['board-gc'], { list: [] })
    vi.advanceTimersByTime(ONE_DAY - 1000)
    expect(queryClient.getQueryData(['board-gc'])).toBeDefined()
    vi.advanceTimersByTime(2000)
    expect(queryClient.getQueryData(['board-gc'])).toBeUndefined()
  })
})

describe('the poll gear', () => {
  it('awake with no socket, polling is the only freshness there is: ten seconds', () => {
    expect(liveInterval()).toBe(10_000)
  })

  it('nobody around, no socket: a quiet heartbeat', () => {
    fallAsleep()
    expect(liveInterval()).toBe(120_000)
  })

  it('a live socket carries the news, so the awake poll is only a safety heartbeat', () => {
    pushLive.mockReturnValue(true)
    expect(liveInterval()).toBe(60_000)
  })

  it('a live socket and nobody around is the cheapest gear of all', () => {
    pushLive.mockReturnValue(true)
    fallAsleep()
    expect(liveInterval()).toBe(300_000)
  })

  it('just short of the idle window, the screen still counts as awake', () => {
    vi.setSystemTime(Date.now() + ONE_MINUTE - 1)
    expect(liveInterval()).toBe(10_000)
  })

  it.each(['pointerdown', 'keydown', 'touchstart'])('%s snaps back to the fast gear', (type) => {
    fallAsleep()
    window.dispatchEvent(new Event(type))
    expect(liveInterval()).toBe(10_000)
  })

  it('live queries read the gear on every tick, and ask for focus refetch and no staleness', () => {
    expect(live.refetchInterval).toBe(liveInterval)
    expect(live.staleTime).toBe(0)
    expect(live.refetchOnWindowFocus).toBe(true)
    expect(live.meta.live).toBe(true)
  })
})

describe('waking up', () => {
  // A subscribed observer with data in hand, so only a forced refetch can call queryFn.
  function watched(key: string, meta: Record<string, unknown> = {}) {
    const queryFn = vi.fn(async () => ({ key }))
    queryClient.setQueryData([key], { key: 'seeded' })
    const observer = new QueryObserver(queryClient, { queryKey: [key], queryFn, meta, staleTime: Infinity })
    const unsubscribe = observer.subscribe(() => {})
    return { queryFn, unsubscribe }
  }
  const settled = () => vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))

  it('the first tap on a sleeping wall shows fresh data', async () => {
    const board = watched('board', { live: true })
    fallAsleep()
    touch()
    await vi.waitFor(() => expect(board.queryFn).toHaveBeenCalledTimes(1))
    board.unsubscribe()
  })

  it('taps during active use cost no request: the fast poll already covers them', async () => {
    const board = watched('board', { live: true })
    touch()
    touch()
    await settled()
    expect(board.queryFn).not.toHaveBeenCalled()
    board.unsubscribe()
  })

  it('the weather and the flyers keep their own slow cache', async () => {
    const board = watched('board', { live: true })
    const weather = watched('weather')
    fallAsleep()
    touch()
    await vi.waitFor(() => expect(board.queryFn).toHaveBeenCalledTimes(1))
    await settled()
    expect(weather.queryFn).not.toHaveBeenCalled()
    board.unsubscribe()
    weather.unsubscribe()
  })

  it('a live query nobody is looking at is not refetched', async () => {
    const closed = watched('closed-tab', { live: true })
    closed.unsubscribe()
    fallAsleep()
    touch()
    await settled()
    expect(closed.queryFn).not.toHaveBeenCalled()
  })

  it('coming back to the tab resumes the fast gear, and leaves the refetch to focus', async () => {
    const board = watched('board', { live: true })
    fallAsleep()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(liveInterval()).toBe(10_000)
    await settled()
    expect(board.queryFn).not.toHaveBeenCalled()
    board.unsubscribe()
  })

  it('a tab being hidden is not activity: the wall still falls asleep', () => {
    fallAsleep()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(liveInterval()).toBe(120_000)
  })
})

describe('healOnError: a browse surface that heals without polling', () => {
  it('a calendar stuck in error retries on a quiet interval', () => {
    expect(healOnError.refetchInterval({ state: { status: 'error' } })).toBe(60_000)
  })

  it('a calendar that loaded fine is never polled', () => {
    expect(healOnError.refetchInterval({ state: { status: 'success' } })).toBe(false)
  })

  it('re-focusing the app also heals it, the door that used to need a hard refresh', () => {
    expect(healOnError.refetchOnWindowFocus).toBe(true)
  })
})
