import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { HEALTH_KEY } from './queryKeys'
import { createDeviceStore } from './createDeviceStore'

// Which reader to use when scanning a recipe photo, a PER-DEVICE preference:
//   • 'device' (default) — on-device Tesseract OCR: free, private, works offline,
//     no data leaves the tablet. The honest default.
//   • 'cloud' — the high-accuracy Mistral OCR (functions/_lib/mistralOcr.ts): far
//     better on dense small glyphs (decimal commas, vulgar fractions, handwriting),
//     but the image leaves the device and it's billed per page (pennies at household
//     scale). Only takes effect when the deployment has a key (health.cloudOcr) AND
//     the household AI switch is on.
// localStorage-backed + useSyncExternalStore, same idiom as lib/ambient — a wall
// tablet and a phone can each choose, and a settings change applies without a reload.

export type OcrEngine = 'device' | 'cloud'

const store = createDeviceStore<OcrEngine>('babillard-ocr-engine', 'device', {
  read: (raw) => (raw === 'cloud' ? 'cloud' : 'device'),
  write: (engine) => engine,
})

export const setOcrEngine = store.set
// The chosen engine (per device). Default 'device' on the server / before hydration.
export const useOcrEngine = store.use

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
