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
  } catch {
    /* noop */
  }
}

export const isGuest = () => !getDeviceToken() && !!getGuestToken()
