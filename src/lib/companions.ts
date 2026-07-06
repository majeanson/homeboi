import type { DayPart } from './timeofday'

// The calm creature a member can pick to keep them company during a routine run
// (and nap on the idle screensaver). A CLOSED set — validated server-side, never
// free text — so a companion can never carry a number/score. Emoji-first so it
// renders everywhere with zero assets and reads for a pre-reader.
//
// A companion is PRESENCE, not reward: it never grades a routine, never frowns,
// never reacts to whether steps got done. Its only state is the time of day (see
// companionMood) — that structural choice is what keeps it out of streak/points
// territory (calm-tenets).
export const COMPANIONS = ['fox', 'owl', 'cat', 'bunny', 'bear', 'turtle', 'star', 'cloud'] as const
export type Companion = (typeof COMPANIONS)[number]

export const COMPANION_EMOJI: Record<Companion, string> = {
  fox: '🦊',
  owl: '🦉',
  cat: '🐱',
  bunny: '🐰',
  bear: '🐻',
  turtle: '🐢',
  star: '⭐',
  cloud: '☁️',
}

export const isCompanion = (v: unknown): v is Companion =>
  typeof v === 'string' && (COMPANIONS as readonly string[]).includes(v)

// The companion's pose depends ONLY on the time of day — awake through the day,
// dozing once it's night — never on progress. Taking a bare DayPart (not the
// routine, not doneIdx) is the structural guarantee it can't become a
// reward/streak signal: there is simply no way to feed it performance.
type CompanionMood = 'awake' | 'dozing'
export function companionMood(part: DayPart): CompanionMood {
  return part === 'night' || part === 'deep-twilight' ? 'dozing' : 'awake'
}
