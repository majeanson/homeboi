import { createDeviceStore } from './createDeviceStore'

// D-21 (bmad/10) « Sortir le bac » — per-device opt-out for the board's "evening
// before" chore announce line (a flagged recurring chore's `announce_evening`,
// see src/lib/boardModel.ts + migration 0107). Same pattern as the fêtes toggle
// (lib/year.ts) and the "Photo du jour" band (lib/apod.ts): a device-local display
// preference, default ON, localStorage-backed, read live via useSyncExternalStore
// (lib/createDeviceStore) so flipping it in Réglages ▸ Affichage takes effect on
// this device without a reload — no schema, no household round-trip.
const store = createDeviceStore<boolean>('babillard-bac', true, {
  read: (raw) => raw !== '0',
  write: (on) => (on ? '1' : '0'),
})

export const setChoreAnnounceEnabled = store.set
export const useChoreAnnounceEnabled = store.use
