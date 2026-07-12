import { describe, expect, it, vi, afterEach } from 'vitest'
import { canShareFile, photoFilename, saveToDevice } from './saveToDevice'

// The one thing that must never regress here: a photo the household snapped inside
// the app can always get back OUT to the phone. Web Share is the only route to the
// camera roll and it's absent on desktop / older Android — so the download fallback
// is not a nicety, it's half the feature.

// `share`/`canShare` are non-optional in lib.dom, so reach for them through a partial
// view — the whole point of these tests is the browsers where they're ABSENT.
const nav = navigator as unknown as { share?: unknown; canShare?: unknown }

afterEach(() => {
  delete nav.share
  delete nav.canShare
  vi.restoreAllMocks()
})

function png() {
  return new Blob(['x'], { type: 'image/png' })
}

describe('photoFilename', () => {
  it('maps the mime type to a real extension, and falls back to jpg', () => {
    expect(photoFilename('image/png', 1720713600000)).toBe('babillard-1720713600000.png')
    expect(photoFilename('image/jpeg', 1)).toBe('babillard-1.jpg')
    expect(photoFilename('', 1)).toBe('babillard-1.jpg')
    expect(photoFilename('application/octet-stream', 1)).toBe('babillard-1.jpg')
  })
})

describe('canShareFile', () => {
  const file = new File(['x'], 'a.png', { type: 'image/png' })

  it('is false when the browser has no share/canShare at all (desktop)', () => {
    expect(canShareFile(file)).toBe(false)
  })

  it('is false when canShare refuses files (share exists, files unsupported)', () => {
    nav.share = () => Promise.resolve()
    nav.canShare = () => false
    expect(canShareFile(file)).toBe(false)
  })

  it('treats a THROWING canShare as "no" rather than exploding', () => {
    nav.share = () => Promise.resolve()
    nav.canShare = () => {
      throw new TypeError('unsupported payload')
    }
    expect(canShareFile(file)).toBe(false)
  })

  it('is true when the platform can share the file (iOS → "Save image")', () => {
    nav.share = () => Promise.resolve()
    nav.canShare = () => true
    expect(canShareFile(file)).toBe(true)
  })
})

describe('saveToDevice', () => {
  it('downloads when the browser cannot share files', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await saveToDevice(png(), 'p.png')).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })

  it('shares when it can — and does NOT also download', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    nav.share = share
    nav.canShare = () => true
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await saveToDevice(png(), 'p.png')).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
    expect(click).not.toHaveBeenCalled()
  })

  it('a DISMISSED share sheet is a decision, not a failure — no surprise download', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' })
    nav.share = vi.fn().mockRejectedValue(abort)
    nav.canShare = () => true
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await saveToDevice(png(), 'p.png')).toBe('shared')
    expect(click).not.toHaveBeenCalled()
  })

  it('falls back to the download when share fails for any OTHER reason', async () => {
    nav.share = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    nav.canShare = () => true
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await saveToDevice(png(), 'p.png')).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })
})
