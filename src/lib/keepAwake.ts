import { createDeviceStore } from './createDeviceStore'

// Per-device opt-out for the Screen Wake Lock the hub shell holds (HubLayout) so a
// wall tablet doesn't dim/sleep while the board is showing. Default ON — the primary
// device is a kiosk that should stay lit. On a phone you'd turn it OFF to save battery
// (the hint in Réglages ▸ Affichage says so). localStorage-backed + read live via
// useSyncExternalStore (see lib/createDeviceStore), so toggling it engages/releases the
// lock on this device immediately, no reload. The cook surfaces hold their own lock
// unconditionally (you're actively cooking) — this setting only governs the shell.
const store = createDeviceStore<boolean>('babillard-keep-awake', true, {
  read: (raw) => raw !== '0', // unset / anything-but-"0" = ON
  write: (on) => (on ? '1' : '0'),
})

export const setKeepAwake = store.set
export const useKeepAwake = store.use
