// « Sur l'écran d'accueil » — can THIS device install the app, and has it been told once?
//
// The app is a PWA (manifest `display: standalone`) and nothing anywhere said so: an
// iPhone household would live in Safari with the address bar forever (the demo walk,
// STATE.md §4-K wave 2, 2026-09-16). Marc's rule: ONE quiet line, once, on the device
// that could install — in Réglages ▸ Affichage & veille, and once on the board right
// after an account is created. Never a banner that comes back.
//
// Two paths, because the platforms differ:
//   · Chromium (Android, desktop) fires `beforeinstallprompt`. We keep the event and
//     call its prompt() from our own « Installer » button. preventDefault() so the
//     browser's mini-bar does not double the offer.
//   · iOS Safari never fires anything. The only door is the share sheet, so the hint is
//     WORDS: « Partager, puis Sur l'écran d'accueil ».
// Already standalone → nothing to offer. Device-local, like every display preference
// (localStorage; a guest may see it; the household never does).
import { useSyncExternalStore } from 'react'
import { createDeviceStore } from './createDeviceStore'

export type InstallNudge = 'idle' | 'pending' | 'done'
const store = createDeviceStore<{ nudge: InstallNudge }>('babillard-install', { nudge: 'idle' })
export const useInstallNudge = store.use
/** Signup / claim succeeded on this device: offer the home screen once, on the board. */
export function requestInstallNudge(): void {
  if (store.get().nudge === 'idle') store.set({ nudge: 'pending' })
}
export function dismissInstallNudge(): void {
  store.set({ nudge: 'done' })
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    dismissInstallNudge()
    notify()
  })
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (installed) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (window.matchMedia?.('(display-mode: standalone)').matches ?? false)
}

/** iOS Safari: no prompt event exists, the share sheet is the only door. */
export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !isStandalone()
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
// A snapshot must be referentially stable between notifies, or React loops.
let snap = { promptable: false, standalone: false }
const getSnap = () => {
  const next = { promptable: deferred != null, standalone: isStandalone() }
  if (next.promptable !== snap.promptable || next.standalone !== snap.standalone) snap = next
  return snap
}

export function useInstall(): { promptable: boolean; standalone: boolean; ios: boolean; prompt: () => Promise<boolean> } {
  const s = useSyncExternalStore(subscribe, getSnap, getSnap)
  return {
    ...s,
    ios: isIosBrowser(),
    prompt: async () => {
      const ev = deferred
      if (!ev) return false
      deferred = null
      notify()
      await ev.prompt()
      const choice = await ev.userChoice?.catch(() => null)
      const accepted = choice?.outcome === 'accepted'
      if (accepted) dismissInstallNudge()
      return accepted
    },
  }
}
