// A small sealed box for a secret we must HOLD (a third-party access token — see
// migration 0124, « Lier Flipp »), keyed from SESSION_SECRET so a database read
// alone yields nothing usable. AES-256-GCM through WebCrypto (the Worker has no
// Node crypto); the key is SHA-256 of the secret, derived per call — a few µs, and
// no key object to keep around. Format: `v1.<iv>.<ciphertext+tag>`, both base64url.
//
// SESSION_SECRET is validated ≥ 32 chars where it is used for signing (auth.ts);
// the same guard applies here, for the same reason — sealing with a known key is
// no seal at all.

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function keyFrom(secret: string | undefined): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error('secretBox: SESSION_SECRET must be set (≥ 32 chars)')
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function seal(plain: string, secret: string | undefined): Promise<string> {
  const key = await keyFrom(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)))
  return `v1.${b64url(iv)}.${b64url(ct)}`
}

/** Null on a tampered / foreign / malformed box — never throws on bad input. */
export async function open(box: string, secret: string | undefined): Promise<string | null> {
  const [v, ivB, ctB] = box.split('.')
  if (v !== 'v1' || !ivB || !ctB) return null
  try {
    const key = await keyFrom(secret)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(ivB) }, key, unb64url(ctB))
    return dec.decode(plain)
  } catch {
    return null
  }
}
