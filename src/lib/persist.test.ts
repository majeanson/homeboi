import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'

// The promise (NFR-OFFLINE-1): a kiosk that reboots with no network still shows the last
// board, not an empty shell. Going offline must never erase the one thing offline needs,
// a phantom row must not survive a reboot, a stuck IndexedDB must never keep the app off
// the screen, and a device that lost its auth keeps no household data on disk.

const pendingTmpIds = vi.hoisted(() => vi.fn())
vi.mock('./outbox', () => ({ pendingTmpIds }))

const DAY = 24 * 60 * 60 * 1000
const DEBOUNCE = 1500

type Req = {
  result?: unknown
  onupgradeneeded?: () => void
  onsuccess?: () => void
  onerror?: () => void
  onblocked?: () => void
}

// One object store, one key: exactly the surface persist.ts touches.
function fakeIdb() {
  const rows = new Map<string, unknown>()
  const stores = new Set<string>()
  const db = {
    createObjectStore: (name: string) => void stores.add(name),
    transaction: (name: string) => {
      if (!stores.has(name)) throw new Error('NotFoundError')
      const tx: { oncomplete?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          get: (key: string) => {
            const req: Req = {}
            queueMicrotask(() => {
              req.result = rows.get(key)
              req.onsuccess?.()
            })
            return req
          },
          put: (value: unknown, key: string) => {
            rows.set(key, structuredClone(value))
            queueMicrotask(() => tx.oncomplete?.())
          },
          delete: (key: string) => {
            rows.delete(key)
            queueMicrotask(() => tx.oncomplete?.())
          },
        }),
      }
      return tx
    },
  }
  const open = vi.fn(() => {
    const req: Req = { result: db }
    queueMicrotask(() => {
      if (stores.size === 0) req.onupgradeneeded?.()
      req.onsuccess?.()
    })
    return req
  })
  return { rows, open }
}

let idb: ReturnType<typeof fakeIdb>
let persist: typeof import('./persist')

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  idb = fakeIdb()
  vi.stubGlobal('indexedDB', { open: idb.open })
  pendingTmpIds.mockReset()
  pendingTmpIds.mockResolvedValue(new Set())
  vi.resetModules()
  persist = await import('./persist')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const settle = () => vi.advanceTimersByTimeAsync(0)
const elapse = (ms = DEBOUNCE) => vi.advanceTimersByTimeAsync(ms)
const saved = () => idb.rows.get('rq') as { at: number; state: { queries: { queryHash: string }[] } } | undefined
const savedKeys = () => saved()?.state.queries.map((q) => q.queryHash)

function watched() {
  const qc = new QueryClient()
  persist.startPersistingCache(qc)
  return qc
}

const failedPoll = (qc: QueryClient, key: string, status: number) =>
  qc
    .fetchQuery({ queryKey: [key], queryFn: () => Promise.reject(new ApiError(status, 'no')), retry: false, staleTime: 0 })
    .catch(() => undefined)

describe('the round trip', () => {
  it('a cold reboot paints what was on the board', async () => {
    const before = watched()
    before.setQueryData(['board'], { list: ['lait'] })
    await elapse()
    const after = new QueryClient()
    await persist.restorePersistedCache(after)
    expect(after.getQueryData(['board'])).toEqual({ list: ['lait'] })
  })

  it('a first boot with nothing saved is a quiet no-op', async () => {
    const qc = new QueryClient()
    await expect(persist.restorePersistedCache(qc)).resolves.toBeUndefined()
    expect(qc.getQueryCache().getAll()).toEqual([])
  })

  it('data just under a day old is still worth showing', async () => {
    const before = watched()
    before.setQueryData(['board'], { list: [] })
    await elapse()
    vi.setSystemTime(Date.now() + DAY - 1000)
    const after = new QueryClient()
    await persist.restorePersistedCache(after)
    expect(after.getQueryData(['board'])).toBeDefined()
  })

  it('anything older than a day is not restored: yesterday is not today', async () => {
    const before = watched()
    before.setQueryData(['board'], { list: [] })
    await elapse()
    vi.setSystemTime(Date.now() + DAY + 1000)
    const after = new QueryClient()
    await persist.restorePersistedCache(after)
    expect(after.getQueryData(['board'])).toBeUndefined()
  })

  it('a snapshot with no timestamp cannot prove its age, so it is not trusted', async () => {
    const qc = watched()
    qc.setQueryData(['board'], {})
    await elapse()
    idb.rows.set('rq', { state: saved()?.state })
    const after = new QueryClient()
    await persist.restorePersistedCache(after)
    expect(after.getQueryData(['board'])).toBeUndefined()
  })

  it('a shape that drifted across a deploy is ignored, the queries refill', async () => {
    idb.rows.set('rq', { at: Date.now(), state: { queries: 'not-a-list' } })
    await expect(persist.restorePersistedCache(new QueryClient())).resolves.toBeUndefined()
  })
})

describe('the snapshot', () => {
  it('a poll that fails going into airplane mode keeps the tab in the snapshot', async () => {
    const qc = watched()
    qc.setQueryData(['board'], { list: ['lait'] })
    await failedPoll(qc, 'board', 503)
    expect(qc.getQueryState(['board'])?.status).toBe('error')
    await elapse()
    expect(savedKeys()).toContain('["board"]')
  })

  it('a query that never held data saves nothing', async () => {
    const qc = watched()
    await failedPoll(qc, 'empty', 503)
    await elapse()
    expect(savedKeys()).toEqual([])
  })

  it('a burst of cache changes writes once, after the dust settles', async () => {
    const qc = watched()
    qc.setQueryData(['a'], 1)
    qc.setQueryData(['b'], 2)
    await elapse(DEBOUNCE - 1)
    expect(saved()).toBeUndefined()
    qc.setQueryData(['c'], 3)
    await elapse(1)
    expect(savedKeys()).toEqual(['["a"]', '["b"]', '["c"]'])
  })

  it('an optimistic row with nothing queued behind it does not reach the next boot', async () => {
    const qc = watched()
    pendingTmpIds.mockResolvedValue(new Set(['tmp-queued']))
    qc.setQueryData(['list'], [{ id: 'tmp-orphan' }, { id: 'tmp-queued' }, { id: 'real' }])
    await elapse()
    const after = new QueryClient()
    await persist.restorePersistedCache(after)
    expect(after.getQueryData(['list'])).toEqual([{ id: 'tmp-queued' }, { id: 'real' }])
  })

  it('an unreadable outbox keeps the snapshot rather than losing it', async () => {
    const qc = watched()
    pendingTmpIds.mockRejectedValue(new Error('idb gone'))
    qc.setQueryData(['list'], [{ id: 'tmp-orphan' }])
    await elapse()
    const after = new QueryClient()
    await persist.restorePersistedCache(after)
    expect(after.getQueryData(['list'])).toEqual([{ id: 'tmp-orphan' }])
  })
})

describe('auth loss', () => {
  it('the wipe leaves nothing to restore', async () => {
    const qc = watched()
    qc.setQueryData(['board'], { list: [] })
    await elapse()
    persist.clearPersistedCache()
    await settle()
    expect(saved()).toBeUndefined()
  })

  it('a save already pending does not write the household back after the wipe', async () => {
    const qc = watched()
    qc.setQueryData(['board'], { list: ['lait'] })
    persist.clearPersistedCache()
    await elapse()
    expect(saved()).toBeUndefined()
  })

  it('a revoked device polling into 401s stays wiped: the cache still holds the data', async () => {
    const qc = watched()
    qc.setQueryData(['board'], { list: ['lait'] })
    await elapse()
    persist.clearPersistedCache()
    await settle()
    await failedPoll(qc, 'board', 401)
    await elapse()
    expect(saved()).toBeUndefined()
  })

  it('a write made while revoked does not bring the snapshot back either', async () => {
    const qc = watched()
    await qc.fetchQuery({ queryKey: ['board'], queryFn: () => ({ list: ['lait'] }), meta: { live: true } })
    persist.clearPersistedCache()
    await settle()
    qc.setQueryData(['board'], { list: ['lait', 'pain'] })
    await elapse()
    expect(saved()).toBeUndefined()
  })

  it('a public feed answering is no proof of a session', async () => {
    const qc = watched()
    qc.setQueryData(['board'], { list: ['lait'] })
    persist.clearPersistedCache()
    await settle()
    await qc.fetchQuery({ queryKey: ['weather'], queryFn: () => ({ t: 3 }) })
    await elapse()
    expect(saved()).toBeUndefined()
  })

  it('the household answering again resumes the snapshot', async () => {
    const qc = watched()
    qc.setQueryData(['board'], { list: ['lait'] })
    persist.clearPersistedCache()
    await settle()
    await qc.fetchQuery({ queryKey: ['board'], queryFn: () => ({ list: ['pain'] }), staleTime: 0, meta: { live: true } })
    await elapse()
    expect(savedKeys()).toContain('["board"]')
  })
})

describe('IndexedDB is never allowed to wedge the app', () => {
  async function isPending(p: Promise<unknown>) {
    let done = false
    void p.then(() => (done = true))
    await settle()
    return !done
  }

  it('an open that never answers (WebKit, fresh launch) gives up after three seconds', async () => {
    idb.open.mockReturnValue({})
    const p = persist.restorePersistedCache(new QueryClient())
    expect(await isPending(p)).toBe(true)
    await elapse(2999)
    expect(await isPending(p)).toBe(true)
    await elapse(1)
    expect(await isPending(p)).toBe(false)
  })

  it('a blocked open resolves at once', async () => {
    const req: Req = {}
    idb.open.mockReturnValue(req)
    const p = persist.restorePersistedCache(new QueryClient())
    req.onblocked?.()
    expect(await isPending(p)).toBe(false)
  })

  it('a failed open resolves at once', async () => {
    const req: Req = {}
    idb.open.mockReturnValue(req)
    const p = persist.restorePersistedCache(new QueryClient())
    req.onerror?.()
    expect(await isPending(p)).toBe(false)
  })

  it('a browser with no IndexedDB at all just has no persistence', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(persist.restorePersistedCache(new QueryClient())).resolves.toBeUndefined()
  })
})
