// Recurrence-phrase parsing for the capture spine ("chaque automne", "aux 3
// mois", "every 2 years"). whenparse.ts stays date-only on purpose — a cadence
// is not a date — so this is its sibling: a small FR-CA + EN regex table that
// backstops the AI router's `upkeep` payload (and the manual « Entretien »
// re-route, where no AI ran at all). AI proposes, code disposes: the route
// validates the model's recur through normalizeRecur and falls back to this
// parse of the raw words.
//
// Season → anchor: a season word resolves to a household-local anchor DAY the
// yearly rule counts from. Mid-season, the anchor is TODAY ("chaque automne"
// captured in October is due now, then yearly on this date — never a back-dated
// anchor that reads as instantly owed); otherwise the next start of that season
// (Mar/Jun/Sep/Dec 1). A deliberate server-side mirror of src/lib/season.ts
// nextSeasonAnchorDate — the two trees don't share code (the RecurValue rule).

import { localDayStart } from './ids'
import type { Recur } from './recur'

export interface ParsedRecurPhrase {
  recur: Recur
  seasonAnchor?: number // local-midnight unix sec, when a season word set the anchor
}

// Accent-fold + lowercase, so « été » matches "ete" and « Automne » "automne".
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter'
const SEASON_WORDS: [RegExp, SeasonName][] = [
  [/\bprintemps\b|\bspring\b/, 'spring'],
  [/\bete\b|\bsummer\b/, 'summer'],
  [/\bautomne\b|\bfall\b|\bautumn\b/, 'autumn'],
  [/\bhiver\b|\bwinter\b/, 'winter'],
]
// 0-based start months (Mar/Jun/Sep/Dec) — season() buckets in src/lib/season.ts.
const SEASON_START: Record<SeasonName, number> = { spring: 2, summer: 5, autumn: 8, winter: 11 }
const seasonOfMonth = (m: number): SeasonName =>
  m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'

// The anchor day (local-midnight unix sec) for a season word, or null if the
// word names no season. Both local Y/M reads use the recur.ts trick: a local
// midnight's getUTC* fields ARE the local calendar fields.
export function seasonAnchorFor(word: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!word) return null
  const f = fold(word)
  const hit = SEASON_WORDS.find(([re]) => re.test(f))
  if (!hit) return null
  const s = hit[1]
  const today = localDayStart(new Date(nowMs))
  const d = new Date(today * 1000)
  const m = d.getUTCMonth()
  if (seasonOfMonth(m) === s) return today
  const y = d.getUTCFullYear() + (m < SEASON_START[s] ? 0 : 1)
  // Noon keeps the instant safely inside the target civil date in any NA zone.
  return localDayStart(new Date(Date.UTC(y, SEASON_START[s], 1, 12)))
}

const clampN = (n: number): number => Math.min(52, Math.max(1, Math.round(n)))

// Parse a recurrence phrase out of free text. Returns null when no cadence is
// stated — a bare date is whenparse's job, not ours.
export function parseRecurPhrase(text: string, nowMs: number = Date.now()): ParsedRecurPhrase | null {
  const f = fold(text)

  // « chaque automne », « tous les printemps », "every fall" → yearly on the season.
  const seasonal = f.match(
    /(?:chaque|tous les|a chaque|every|each)\s+(printemps|ete|automne|hiver|spring|summer|fall|autumn|winter)s?\b/,
  )
  if (seasonal) {
    const anchor = seasonAnchorFor(seasonal[1], nowMs)
    return { recur: { freq: 'yearly', interval: 1 }, ...(anchor != null ? { seasonAnchor: anchor } : {}) }
  }

  // « chaque saison », "every season" → quarterly (monthly/3), anchored next season turn.
  if (/(?:chaque|toutes les|every|each)\s+(?:saison|season)s?\b/.test(f)) {
    const today = localDayStart(new Date(nowMs))
    const d = new Date(today * 1000)
    const m = d.getUTCMonth()
    const nextB = [2, 5, 8, 11].find((b) => m < b)
    const anchor =
      nextB != null
        ? localDayStart(new Date(Date.UTC(d.getUTCFullYear(), nextB, 1, 12)))
        : localDayStart(new Date(Date.UTC(d.getUTCFullYear() + 1, 2, 1, 12)))
    return { recur: { freq: 'monthly', interval: 3 }, seasonAnchor: anchor }
  }

  // « aux 3 mois », « tous les 2 ans », "every 6 weeks" — a numbered interval.
  const n = f.match(
    /(?:aux|tous les|toutes les|chaque|every|each)\s+(\d{1,2})\s+(jours?|days?|semaines?|weeks?|mois|months?|ans?|annees?|years?)\b/,
  )
  if (n) {
    const interval = clampN(Number(n[1]))
    const unit = n[2]
    if (/^(jour|day)/.test(unit)) return { recur: { freq: 'daily', interval } }
    if (/^(semaine|week)/.test(unit)) return { recur: { freq: 'weekly', interval } }
    if (/^(mois|month)/.test(unit)) return { recur: { freq: 'monthly', interval } }
    return { recur: { freq: 'yearly', interval } }
  }

  // Bare units: « chaque annee », « tous les mois », "every week", "yearly"…
  if (/(?:chaque|tous les|every|each)\s+(?:annee|an|year)s?\b|\b(?:annuel(?:lement)?|yearly|annually)\b/.test(f))
    return { recur: { freq: 'yearly', interval: 1 } }
  if (/(?:chaque|tous les|every|each)\s+(?:mois|month)\b|\b(?:mensuel(?:lement)?|monthly)\b/.test(f))
    return { recur: { freq: 'monthly', interval: 1 } }
  if (/(?:chaque|toutes les|every|each)\s+(?:semaine|week)s?\b|\b(?:hebdomadaire|weekly)\b/.test(f))
    return { recur: { freq: 'weekly', interval: 1 } }
  if (/(?:chaque|tous les|every|each)\s+(?:jour|day)s?\b|\b(?:quotidien(?:nement)?|daily)\b/.test(f))
    return { recur: { freq: 'daily', interval: 1 } }

  return null
}
