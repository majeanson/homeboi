import { createDeviceStore } from './createDeviceStore'

// Per-device opt-out for the board's ambient « living canvas » — a subtle backdrop that
// drifts with the season + weather + time of day (a faint seasonal wash, gentle snow in
// winter). Default ON. localStorage-backed device-local preference (not household data),
// read live via useSyncExternalStore (see lib/createDeviceStore) so toggling it in
// Réglages ▸ Affichage shows/hides it on this device without a reload.
const store = createDeviceStore<boolean>('babillard-canvas', true, {
  read: (raw) => raw !== '0', // unset / anything-but-"0" = ON
  write: (on) => (on ? '1' : '0'),
})

export const setCanvasEnabled = store.set
export const useCanvasEnabled = store.use
