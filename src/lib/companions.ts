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

// ── What the companion SAYS (tap-initiated only) ────────────────────────────
//
// The pose above stays daypart-only — that's the structural wall against a creature
// that grades. Its SPEECH may know a little more, but only ever about the STORY, never
// about the child's performance:
//
//   • which creature it is  — a turtle and an owl shouldn't say the same thing;
//   • where the story is    — first card / in the middle / last card. That's a POSITION,
//                             not a score: it says "last picture!", never "you were fast";
//   • what time it is       — a 7 a.m. routine and a bedtime one deserve a different voice.
//
// Nothing here is fed doneIdx as a tally, a duration, a streak, or a comparison with
// yesterday, and there is deliberately no `finished` tone: a finish-cheer is a reward,
// and rewards are the one thing this creature must never hand out (see the header).
export type CompanionMoment = 'start' | 'mid' | 'last'

// Eight dayparts collapse to three voices — a companion doesn't need to distinguish
// twilight from deep-twilight, it just needs to know whether to sound bright or hushed.
export type CompanionTone = 'early' | 'day' | 'evening'
export function companionTone(part: DayPart): CompanionTone {
  if (part === 'dawn' || part === 'morning') return 'early'
  if (part === 'noon' || part === 'afternoon') return 'day'
  return 'evening'
}

// Every line this creature could say right now, pooled: its own personality lines, the
// lines for where the story is, the lines for the time of day, and the plain warm ones
// that always fit. The caller picks one at random — variety without a rule the child has
// to learn, which is the point: a companion that says the same six things becomes
// furniture, and nobody taps furniture twice.
//
// `moment` is omitted once the routine is complete, so the pool holds no story-position
// line at the finish — the creature stays company, it doesn't congratulate.
export function companionPool(
  lines: {
    says: readonly string[]
    voices: Record<Companion, readonly string[]>
    moments: Record<CompanionMoment, readonly string[]>
    tones: Record<CompanionTone, readonly string[]>
  },
  at: { companion: Companion; moment: CompanionMoment | null; tone: CompanionTone },
): string[] {
  return [
    ...lines.says,
    ...lines.voices[at.companion],
    ...(at.moment ? lines.moments[at.moment] : []),
    ...lines.tones[at.tone],
  ]
}
