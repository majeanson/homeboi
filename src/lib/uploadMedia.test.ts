import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { MediaUnavailableError, uploadMedia } from './uploadMedia'

// The one upload path (solidify 7.1). A 503 is the only failure that hides a control, so
// it must stay distinct from every other failure.
const api = vi.hoisted(() => vi.fn())
vi.mock('./api', async (real) => ({ ...(await real<typeof import('./api')>()), api }))

const send = (maxBytes?: number, bytes = 'x') =>
  uploadMedia('note-media', new Blob([bytes]), { resize: false, maxBytes }).then(
    (key) => ({ key }),
    (error: unknown) => ({ error }),
  )

describe('uploadMedia', () => {
  beforeEach(() => void api.mockReset())

  it('a 503 means R2 is off, so the caller can hide the control', async () => {
    api.mockImplementation(() => Promise.reject(new ApiError(503, 'off')))
    expect(await send()).toEqual({ error: expect.any(MediaUnavailableError) })
  })
  it('any other failure stays what it was', async () => {
    const boom = new ApiError(500, 'boom')
    api.mockImplementation(() => Promise.reject(boom))
    const got = (await send()) as { error: unknown }
    expect(got.error).toBe(boom)
  })
  it('a blob over the limit is refused before it costs a request', async () => {
    const got = (await send(2, 'xxxx')) as { error: unknown }
    expect(got.error).toBeInstanceOf(Error)
    expect(api).not.toHaveBeenCalled()
  })
  it('a success returns the stored key', async () => {
    api.mockResolvedValue({ key: 'k1' })
    expect(await send()).toEqual({ key: 'k1' })
  })
})
