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

// A 'display' is a PERMANENT read-only TV (a living-room screen showing /cast). It rides
// the DEVICE-token path above (revocable, never expires) but — unlike a wall-tablet
// kiosk — must always show the shared Maisonnée view, so we flag it here for CastPage to
// clear any picked face. Set when a `?display=` link boots the screen (see main.tsx).
const DISPLAY_KEY = 'babillard-display'

export function setDisplay(on: boolean): void {
  try {
    if (on) localStorage.setItem(DISPLAY_KEY, '1')
    else localStorage.removeItem(DISPLAY_KEY)
  } catch {
    /* noop */
  }
}

export const isDisplay = () => {
  try {
    return localStorage.getItem(DISPLAY_KEY) === '1'
  } catch {
    return false
  }
}

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
// Two WRITABLE share kinds: 'intake' (the family-info form a relative fills → /intake)
// and 'postbox' (« La boîte aux lettres » — a relative drops a message → /courrier).
// Each is scoped server-side to its own submit endpoints. See functions/_lib/auth.ts.
export type GuestKind = 'showcase' | 'sitter' | 'welcome' | 'family' | 'intake' | 'postbox'
const GUEST_KIND_KEY = 'babillard-guest-kind'
const GUEST_KINDS: GuestKind[] = ['showcase', 'sitter', 'welcome', 'family', 'intake', 'postbox']

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

/**
 * Read-only session — link guest OR the operator's settings preview.
 *
 * `isGuest()` guards HOUSEHOLD WRITES, and nothing else. Gate an `/api/*` mutation
 * with it (`writeWith` already does, structurally) and hide the control that fires
 * one. That is its entire job.
 *
 * Do NOT gate a DEVICE-LOCAL preference with it. Theme, language, contrast, text
 * size, the audience lens, read-aloud voice, calm mode, the screensaver, and the
 * board's card layout (lib/boardCards) all live in THIS browser's localStorage.
 * They never reach the server, never touch the household, and reveal nothing a
 * read-only viewer can't already see — so a guest may use them freely, whether
 * that's a babysitter or a visitor kicking the tires on the public demo
 * (functions/api/demo.ts, which is just a `showcase` guest token).
 *
 * Conflating the two is a live failure mode here: it once hid card reordering, the
 * language switch, the toddler lens and the entire in-app guide from the demo — all
 * of which cost the household exactly nothing. If you're reaching for `isGuest()`,
 * first ask whether the thing you're hiding writes to the server. If it doesn't,
 * don't hide it.
 */
export const isGuest = () => !!getGuestToken() || isGuestPreview()

/**
 * Link guest only (a settings-preview guest is a full operator underneath).
 *
 * Réglages stays REACHABLE for a link guest — the guide is the best thing we have
 * to explain the app — but Operator narrows it to Comprendre + the device-local
 * subs (see GUEST_SUBS in pages/Operator.tsx). Everything that reads or writes the
 * household is dropped there, not here.
 */
export const isGuestLocked = () => !!getGuestToken()
