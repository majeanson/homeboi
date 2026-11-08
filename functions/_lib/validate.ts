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

// A hex colour that may be ABSENT on purpose: null = « comme le sujet » (0148, a todo's
// `colour`). Anything that is not a 6-digit hex reads as that same null.
export function hexColorOrNull(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null
}

// A task's or a subject's icon (0148): one emoji picked in EmojiPicker, or null for « comme
// le sujet ». Bounded in code points, not checked against a list: the picker is the door,
// and a family or a flag emoji is several code points. ASCII letters and digits are refused
// so a title cannot ride in as an « icon » (a keycap emoji is the price, and the picker has
// none).
const ICON_MAX = 16
export function emojiIcon(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v || [...v].length > ICON_MAX || /[A-Za-z0-9<>]/.test(v)) return null
  return v
}

// A safe R2 object-key segment: 1–64 chars, [A-Za-z0-9_-] only. Used to validate
// client-supplied media keys before they touch the bucket.
export function isValidR2Key(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(key)
}
