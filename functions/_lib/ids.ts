// Opaque id + token generation. crypto.getRandomValues is available in the
// Workers runtime.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

// 12-char opaque id (~71 bits). Used for row ids and the device-facing share
// surface, like the portal's session ids.
export function newId(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

// 6-digit pairing code. Human-typed once, short-lived — collision space is
// fine because pending codes expire in minutes and are scoped by lookup.
export function newPairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let out = ''
  for (let i = 0; i < 6; i++) out += String(bytes[i] % 10)
  return out
}

// SHA-256 hex. We store the hash of a device token, never the token.
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const nowSec = () => Math.floor(Date.now() / 1000)

// Unix-seconds midnight (local-ish, UTC-based) for a given Date. Meal/event
// day bucketing. Good enough for a single-household prototype.
export function dayStart(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000)
}
