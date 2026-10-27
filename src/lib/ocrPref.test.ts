import { describe, expect, it } from 'vitest'
import { resolveOcrEngine } from './ocrPref'

// D1 (2026-10-27): a device that never chose reads photos with the cloud reader when the
// deployment has one and the household's AI is on — the read most likely to come out
// wrong gets the reader that gets it right. A choice made by hand always stands.
describe('resolveOcrEngine — the reader a photo read will use', () => {
  it.each([
    ['auto', true, true, 'cloud'],
    ['auto', true, false, 'device'],
    ['auto', false, true, 'device'],
    ['auto', false, false, 'device'],
    ['device', true, true, 'device'],
    ['cloud', true, true, 'cloud'],
    ['cloud', false, false, 'cloud'],
  ] as const)('%s, cloud %s, AI %s → %s', (choice, cloud, ai, want) => {
    expect(resolveOcrEngine(choice, cloud, ai)).toBe(want)
  })
})
