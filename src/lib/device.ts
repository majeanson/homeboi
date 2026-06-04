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
