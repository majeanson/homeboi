// Kiosk device token storage. A paired wall tablet keeps its device token in
// localStorage and sends it on every /api call. This is the kiosk's whole
// identity — no cookie, no login per boot. Revoking the device server-side
// makes the token inert regardless of what's stored here.

const KEY = 'babillard-device-token'
const HOUSEHOLD_KEY = 'babillard-device-household'

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setDeviceToken(token: string, householdId: string): void {
  try {
    localStorage.setItem(KEY, token)
    localStorage.setItem(HOUSEHOLD_KEY, householdId)
  } catch {
    /* private mode — kiosk just won't persist; acceptable */
  }
}

export function clearDeviceToken(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(HOUSEHOLD_KEY)
  } catch {
    /* noop */
  }
}

export const isPaired = () => !!getDeviceToken()

// Guest (babysitter) token. A stateless, read-only, time-boxed credential the
// operator hands out. Stored separately from the device token; sent on the SAME
// X-Device-Token header (the server distinguishes the two by payload tag). A
// device token, if present, wins — a paired kiosk is never downgraded to guest.
const GUEST_KEY = 'babillard-guest-token'

export function getGuestToken(): string | null {
  try {
    return localStorage.getItem(GUEST_KEY)
  } catch {
    return null
  }
}

export function setGuestToken(token: string): void {
  try {
    localStorage.setItem(GUEST_KEY, token)
  } catch {
    /* private mode — won't persist; acceptable */
  }
}

export function clearGuestToken(): void {
  try {
    localStorage.removeItem(GUEST_KEY)
    localStorage.removeItem(GUEST_KIND_KEY)
  } catch {
    /* noop */
  }
}

// The share-mode of the current LINK guest (auth.ts GuestKind), learned from
// /api/guest/whoami after boot and cached so the SPA can route synchronously
// (showcase → the read-only hub; sitter/welcome → their curated scene). Cleared
// when a new ?guest= token arrives (main.tsx), so a different link can't inherit
// a stale kind. The token is opaque/server-signed — the client can't read its own
// kind without asking the server.
export type GuestKind = 'showcase' | 'sitter' | 'welcome' | 'family'
const GUEST_KIND_KEY = 'babillard-guest-kind'
const GUEST_KINDS: GuestKind[] = ['showcase', 'sitter', 'welcome', 'family']

export function getGuestKind(): GuestKind | null {
  try {
    const k = localStorage.getItem(GUEST_KIND_KEY) as GuestKind | null
    return k && GUEST_KINDS.includes(k) ? k : null
  } catch {
    return null
  }
}

export function setGuestKind(kind: GuestKind): void {
  try {
    localStorage.setItem(GUEST_KIND_KEY, kind)
  } catch {
    /* noop */
  }
}

export function clearGuestKind(): void {
  try {
    localStorage.removeItem(GUEST_KIND_KEY)
  } catch {
    /* noop */
  }
}

// Guest mode is read-only and comes two ways:
//   • by LINK — `?guest=<token>` (the babysitter): a real guest credential. Also
//     LOCKED out of Réglages (no in-app escape; relaunch without the token to exit).
//   • by SETTINGS — the operator flips the Parent|Toddler|Guest switch to preview
//     the read-only board. NOT locked: settings stay reachable so the operator can
//     switch back to Parent (the same way you leave toddler mode).
// Both make the session read-only: the UI hides every mutating control and
// `writeWith` refuses to fire one (so a row can't even appear to delete). The
// server independently 403s every token-guest write. Reads ride whatever token
// api.ts sends. Entering guest mode is authoritative even on a paired device — a
// family tablet handed to a sitter must not keep kiosk delete rights.
const GUEST_PREVIEW_KEY = 'babillard-guest-preview'

export function isGuestPreview(): boolean {
  try {
    return localStorage.getItem(GUEST_PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

export function setGuestPreview(on: boolean): void {
  try {
    if (on) localStorage.setItem(GUEST_PREVIEW_KEY, '1')
    else localStorage.removeItem(GUEST_PREVIEW_KEY)
  } catch {
    /* noop */
  }
}

/** Read-only session — link guest OR the operator's settings preview. */
export const isGuest = () => !!getGuestToken() || isGuestPreview()

/** Link guest only: locked out of Réglages (a settings-preview guest keeps it). */
export const isGuestLocked = () => !!getGuestToken()
