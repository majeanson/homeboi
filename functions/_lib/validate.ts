// Input coercion helpers — turn untrusted request fields into safe, stored
// values. Each takes the raw value plus the fallback to use when it's missing or
// malformed, so a handler never has to repeat the validation regex (and can't
// drift from it). Grows as new field kinds appear.

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

// A 6-digit hex colour (e.g. a member or task colour from the palette), or the
// given fallback when the input is absent or not a valid hex string.
export function hexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback
}

// A safe R2 object-key segment: 1–64 chars, [A-Za-z0-9_-] only. Used to validate
// client-supplied media keys before they touch the bucket.
export function isValidR2Key(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(key)
}
