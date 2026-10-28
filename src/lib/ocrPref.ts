import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { HEALTH_KEY } from './queryKeys'
import { createDeviceStore } from './createDeviceStore'
import { useAi } from './ai'

// Which reader to use when scanning a recipe photo, a PER-DEVICE preference:
//   • 'device' (default) — on-device Tesseract OCR: free, private, works offline,
//     no data leaves the tablet. The honest default.
//   • 'cloud' — the high-accuracy Mistral OCR (functions/_lib/mistralOcr.ts): far
//     better on dense small glyphs (decimal commas, vulgar fractions, handwriting),
//     but the image leaves the device and it's billed per page (pennies at household
//     scale). Only takes effect when the deployment has a key (health.cloudOcr) AND
//     the household AI switch is on.
//   • 'auto' (the default since 2026-10-27, D1) — the cloud reader WHEN this deployment
//     has one and the household's AI is on, else the device. A photo read is the import
//     most likely to come out wrong, and the cloud reader is the one that gets it right;
//     a household that never chose should get the right one.
// localStorage-backed + useSyncExternalStore, same idiom as lib/ambient — a wall
// tablet and a phone can each choose, and a settings change applies without a reload.

// 'vision' is never CHOSEN, only resolved: « Auto » with no usable cloud key but AI on
// reads with Workers AI's vision model first (Gemma 4 — exact on printed cards, free
// tier, in-network; functions/_lib/ai transcribeImage), the device engine as the
// offline / AI-off fallback. Marc, 2026-10-27: the free Mistral key has no OCR, and the
// device engine timed out on his phone — the vision reader was the one that worked.
export type OcrEngine = 'device' | 'cloud' | 'vision'
export type OcrChoice = 'device' | 'cloud' | 'auto'

const store = createDeviceStore<OcrChoice>('babillard-ocr-engine', 'auto', {
  read: (raw) => (raw === 'cloud' || raw === 'device' ? raw : 'auto'),
  write: (choice) => choice,
})

export const setOcrEngine = store.set
// What this device CHOSE (the Réglages switch shows it).
export const useOcrChoice = store.use

/** The engine a choice comes to, given what the deployment and the household allow. */
export function resolveOcrEngine(choice: OcrChoice | string | null | undefined, cloudAvailable: boolean, aiEnabled: boolean): OcrEngine {
  // Only an explicit, known choice stands. Anything else — unset, a value an older build
  // stored in another spelling — is « Auto ». Marc's phone (2026-10-27) held a value no
  // button recognised (nothing highlighted) that fell through here as the ENGINE and
  // sent every photo to the device reader first.
  if (choice === 'device' || choice === 'cloud') return choice
  return cloudAvailable && aiEnabled ? 'cloud' : aiEnabled ? 'vision' : 'device'
}

// A cloud reader that just answered « rate limited » is not going to answer the next
// tap either (prod, 2026-10-27: a free-plan Mistral key 429s EVERY OCR call) — remember
// the refusal for an hour on this device, so « Auto » stops spending a round trip on it
// and goes straight to the readers that work. sessionStorage: this tab, soon forgotten.
const THROTTLE_KEY = 'babillard-cloud-ocr-throttled-until'
const THROTTLE_MS = 60 * 60_000
export function markCloudOcrThrottled(now = Date.now()): void {
  try {
    sessionStorage.setItem(THROTTLE_KEY, String(now + THROTTLE_MS))
  } catch {
    /* no storage — the next tap simply tries again */
  }
}
export function cloudOcrThrottled(now = Date.now()): boolean {
  try {
    const until = Number(sessionStorage.getItem(THROTTLE_KEY) ?? 0)
    return until > now
  } catch {
    return false
  }
}

// The engine a read will actually use on this device.
export function useOcrEngine(): OcrEngine {
  const choice = useOcrChoice()
  const cloud = useCloudOcrAvailable()
  const { enabled } = useAi()
  return resolveOcrEngine(choice, cloud && !cloudOcrThrottled(), enabled)
}

// Is the cloud reader wired on this deployment (MISTRAL_API_KEY set)? Reads the same
// /api/health the AI flags use, so the settings toggle can offer it only when there's
// actually a key to use. False while health loads / when absent.
export function useCloudOcrAvailable(): boolean {
  const q = useQuery({
    queryKey: HEALTH_KEY,
    queryFn: () => api<{ cloudOcr?: boolean }>('health'),
    staleTime: 5 * 60_000,
  })
  return q.data?.cloudOcr ?? false
}
