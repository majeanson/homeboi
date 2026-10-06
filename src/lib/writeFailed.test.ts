import { describe, it, expect, vi, afterEach } from 'vitest'
import { ApiError } from './api'
import { setWriteFailedNotifier, writeFailed, wrote, writeOrNull } from './writeFailed'

// What a fire-and-forget write does with its rejection (lib/write). The contract that
// replaced ~100 anonymous `.catch(() => {})`: a REAL server refusal is announced once,
// calmly; a 401 is the auth-lost path's business; a non-ApiError is never a server
// answer (writeWith queues transport failures instead of throwing them).
describe('writeFailed', () => {
  afterEach(() => setWriteFailedNotifier(null))

  it('announces a server refusal once', () => {
    const notify = vi.fn()
    setWriteFailedNotifier(notify)
    writeFailed(new ApiError(500, 'Erreur 500'))
    writeFailed(new ApiError(403, 'Interdit'))
    writeFailed(new ApiError(404, 'Ligne introuvable.'))
    expect(notify).toHaveBeenCalledTimes(3)
  })

  it('stays quiet for a 401 (the auth-lost screen owns it) and for anything that is not a server answer', () => {
    const notify = vi.fn()
    setWriteFailedNotifier(notify)
    writeFailed(new ApiError(401, 'Non autorisé'))
    writeFailed(new TypeError('Failed to fetch'))
    writeFailed(undefined)
    expect(notify).not.toHaveBeenCalled()
  })

  it('is harmless with no notifier registered (before the provider mounts)', () => {
    expect(() => writeFailed(new ApiError(500, 'x'))).not.toThrow()
  })
})

describe('wrote / writeOrNull — for a follow-up that depends on the outcome', () => {
  afterEach(() => setWriteFailedNotifier(null))

  it('wrote() is true on success and false (after announcing) on failure', async () => {
    const notify = vi.fn()
    setWriteFailedNotifier(notify)
    expect(await wrote(Promise.resolve({ ok: true }))).toBe(true)
    expect(notify).not.toHaveBeenCalled()
    expect(await wrote(Promise.reject(new ApiError(500, 'x')))).toBe(false)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('writeOrNull() passes the value through, or yields null after announcing', async () => {
    const notify = vi.fn()
    setWriteFailedNotifier(notify)
    expect(await writeOrNull(Promise.resolve(42))).toBe(42)
    expect(await writeOrNull(Promise.reject(new ApiError(500, 'x')))).toBeNull()
    expect(notify).toHaveBeenCalledTimes(1)
  })
})
