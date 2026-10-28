import { describe, expect, it } from 'vitest'
import { cloudOcrThrottled, markCloudOcrThrottled, resolveOcrEngine } from './ocrPref'

describe('a cloud reader that answered 429 is remembered, for an hour, on this device', () => {
  it('marks → throttled now, not an hour later; nothing marked → not throttled', () => {
    sessionStorage.clear()
    expect(cloudOcrThrottled()).toBe(false)
    markCloudOcrThrottled(1_000)
    expect(cloudOcrThrottled(1_000 + 10 * 60_000)).toBe(true)
    expect(cloudOcrThrottled(1_000 + 61 * 60_000)).toBe(false)
    sessionStorage.clear()
  })
})

// D1 (2026-10-27): a device that never chose reads photos with the cloud reader when the
// deployment has one and the household's AI is on — the read most likely to come out
// wrong gets the reader that gets it right. A choice made by hand always stands.
describe('resolveOcrEngine — the reader a photo read will use', () => {
  it.each([
    ['auto', true, true, 'cloud'],
    ['auto', true, false, 'device'],
    // No usable cloud key, AI on → the in-network vision reader (Gemma 4), not Tesseract.
    ['auto', false, true, 'vision'],
    ['auto', false, false, 'device'],
    ['device', true, true, 'device'],
    ['cloud', true, true, 'cloud'],
    ['cloud', false, false, 'cloud'],
    // Not a known choice (unset, an older build's spelling) → « Auto », never an engine name
    // handed through as-is (Marc's phone, 2026-10-27: nothing highlighted, device read first).
    ['', false, true, 'vision'],
    ['bogus', true, true, 'cloud'],
  ] as const)('%s, cloud %s, AI %s → %s', (choice, cloud, ai, want) => {
    expect(resolveOcrEngine(choice, cloud, ai)).toBe(want)
  })
})
