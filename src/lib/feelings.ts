// The end-of-routine feeling — a CLOSED set of three, so it can never carry a
// number/score (calm). A child taps one when they finish; a parent glances it
// ("Maya a fini avec un ☀️"). Emoji-first so it reads for a pre-reader and renders
// with zero assets. Mirrors the server whitelist in functions/api/routines.ts.
//
// It's a moment of TODAY, kept ~7 days as a soft "week of moments" ribbon — never a
// mood trend / graph / streak (calm-tenets). Shared so the player, the parent card,
// and the week ribbon all show the same glyphs.
export const FEELINGS = ['sun', 'cloud', 'rain'] as const
export type Feeling = (typeof FEELINGS)[number]

export const FEELING_EMOJI: Record<Feeling, string> = {
  sun: '☀️',
  cloud: '☁️',
  rain: '🌧️',
}

export const isFeeling = (v: unknown): v is Feeling =>
  typeof v === 'string' && (FEELINGS as readonly string[]).includes(v)
