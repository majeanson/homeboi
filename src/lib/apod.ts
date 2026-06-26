import { createDeviceStore } from './createDeviceStore'

// Per-device opt-out for the board's "Photo du jour" (NASA APOD) band — a little
// daily wonder on the wall. Default ON. localStorage-backed (a device-local display
// preference, not household data, so no server round-trip), read live via
// useSyncExternalStore (see lib/createDeviceStore) so toggling it in Réglages ▸
// Affichage shows or hides the band on this device without a reload.
const store = createDeviceStore<boolean>('babillard-apod', true, {
  read: (raw) => raw !== '0', // unset / anything-but-"0" = ON
  write: (on) => (on ? '1' : '0'),
})

export const setApodEnabled = store.set
export const useApodEnabled = store.use
