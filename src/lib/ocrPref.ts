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

export type OcrEngine = 'device' | 'cloud'
export type OcrChoice = OcrEngine | 'auto'

const store = createDeviceStore<OcrChoice>('babillard-ocr-engine', 'auto', {
  read: (raw) => (raw === 'cloud' || raw === 'device' ? raw : 'auto'),
  write: (choice) => choice,
})

export const setOcrEngine = store.set
// What this device CHOSE (the Réglages switch shows it).
export const useOcrChoice = store.use

/** The engine a choice comes to, given what the deployment and the household allow. */
export function resolveOcrEngine(choice: OcrChoice, cloudAvailable: boolean, aiEnabled: boolean): OcrEngine {
  if (choice === 'auto') return cloudAvailable && aiEnabled ? 'cloud' : 'device'
  return choice
}

// The engine a read will actually use on this device.
export function useOcrEngine(): OcrEngine {
  const choice = useOcrChoice()
  const cloud = useCloudOcrAvailable()
  const { enabled } = useAi()
  return resolveOcrEngine(choice, cloud, enabled)
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
