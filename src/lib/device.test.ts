import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearDeviceToken, clearGuestToken, setDeviceToken, setGuestToken } from './device'

// /api/img serves a household's picture only to that household (review 2026-11-17, P0 #7),
// and a plain <img> never sends the X-Device-Token header. So the kiosk's (or a guest
// link's) token rides the `bb_media` cookie — set and cleared with the token itself, and
// scoped to /api/img (which is also why a page at / cannot read it back: the assertions
// are on what is WRITTEN).
let written: string[] = []
const last = () => written.filter((c) => c.startsWith('bb_media=')).at(-1) ?? ''

describe('the pictures’ cookie follows the token', () => {
  beforeEach(() => {
    clearDeviceToken()
    clearGuestToken()
    written = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation((v: string) => void written.push(v))
  })
  afterEach(() => vi.restoreAllMocks())

  it('a paired kiosk sends its token with every picture — on /api/img only — and stops when unpaired', () => {
    setDeviceToken('dev.token', 'hh1')
    expect(last()).toMatch(/^bb_media=dev\.token; Path=\/api\/img; Max-Age=\d+; SameSite=Strict/)
    clearDeviceToken()
    expect(last()).toMatch(/^bb_media=; Path=\/api\/img; Max-Age=0/)
  })

  it('a guest link’s token rides it too, and the device token wins over it', () => {
    setGuestToken('guest.token')
    expect(last()).toMatch(/^bb_media=guest\.token;/)
    setDeviceToken('dev.token', 'hh1')
    expect(last()).toMatch(/^bb_media=dev\.token;/)
  })
})
