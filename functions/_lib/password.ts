// Password hashing for self-serve operator accounts — PBKDF2-SHA-256 via
// WebCrypto (no native bcrypt/argon2 in Workers; PBKDF2 at this iteration count
// is the standard, OWASP-sanctioned choice there). Stored self-describing:
//
//   v1$<iterations>$<salt b64url>$<hash b64url>
//
// so the cost can be raised later (new rows get the new count; old rows keep
// verifying with theirs).

const ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BYTES = 32

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BYTES * 8,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, ITERATIONS)
  return `v1$${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`
}

// False on a malformed/foreign stored value — never throws, so a corrupt row
// reads as "wrong password", not a 500.
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'v1') return false
  const iterations = Number(parts[1])
  const salt = fromB64url(parts[2])
  const expected = fromB64url(parts[3])
  if (!Number.isInteger(iterations) || iterations < 1 || !salt || !expected) return false
  const actual = await derive(password, salt, iterations)
  return timingSafeBytes(actual, expected)
}

function timingSafeBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// Length-aware constant-time string compare for the shared LOGIN_PASSWORD /
// invite code (the length difference can leak; the bytes don't).
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}
