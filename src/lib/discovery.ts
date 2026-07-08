// Feature discovery from DATA ABSENCE (bmad/08 B-11 « Le saviez-vous ? » + the
// A-5 discovery tour). Each probe pairs a GUIDE card with a check on data the
// household already exposes: an empty table means the feature was provably never
// touched, so its card is worth surfacing — once, dismissible forever. This is
// the anti-feed version of feature discovery: derived from what's absent, never
// from tracked engagement (calm-safe, same philosophy as the C-18 DB-frequency
// audit). The card copy/icon/route all come from the GUIDE entry — the probes
// only point INTO the one taxonomy, they never fork a parallel list.
//
// Pure module: the fetching hook lives with its only consumer
// (components/operator/discover.tsx); everything here is testable without React.
import { GUIDE, type GuideEntry } from './guideContent'
import { CAR_KEY, CARNETS_KEY, DRAWINGS_KEY, LOVES_KEY, MOTS_KEY, TODOS_KEY, TRIPS_KEY } from './queryKeys'
import type { Tour } from './tourContent'

// "Provably untouched" = the endpoint answered AND the rows are an empty array.
// An absent field / failed fetch is NOT unused — never advertise a feature on a
// hunch (a flaky read would otherwise pitch La cuisine to a family of cooks).
const noRows =
  (field: string) =>
  (data: unknown): boolean => {
    const rows = (data as Record<string, unknown> | null | undefined)?.[field]
    return Array.isArray(rows) && rows.length === 0
  }

export type DiscoveryProbe = {
  // The GUIDE card this probe can surface (copy/icon/route live there).
  card: string
  // The shared query key + api path of the data it reads (lib/queryKeys — the
  // same caches the live pages fill, so a probe is usually a cache hit).
  key: readonly string[]
  path: string
  unused: (data: unknown) => boolean
}

// One probe per discoverable feature. Only features whose absence is one cheap
// list-read; keep alphabetical-ish and SMALL — this is a whisper, not a catalog.
export const DISCOVERY_PROBES: DiscoveryProbe[] = [
  { card: 'voyage', key: TRIPS_KEY, path: 'trips', unused: noRows('trips') },
  { card: 'mots', key: MOTS_KEY, path: 'mots', unused: noRows('mots') },
  { card: 'drawings', key: DRAWINGS_KEY, path: 'drawings', unused: noRows('drawings') },
  { card: 'favorites', key: LOVES_KEY, path: 'recipe-loves', unused: noRows('loves') },
  { card: 'carnets', key: CARNETS_KEY, path: 'carnets', unused: noRows('carnets') },
  { card: 'auto', key: CAR_KEY, path: 'car', unused: noRows('cars') },
  { card: 'todos', key: TODOS_KEY, path: 'todos', unused: noRows('todos') },
]

// Deterministic daily rotation — the same day shows the same card (no flicker
// between visits), the next day rotates to the next candidate. No tracking, no
// randomness: just the day number walking the (undismissed) candidate list.
export function pickDaily<T>(candidates: readonly T[], dayIndex: number): T | null {
  if (candidates.length === 0) return null
  const i = ((dayIndex % candidates.length) + candidates.length) % candidates.length
  return candidates[i]
}

export const dayIndexNow = () => Math.floor(Date.now() / 86_400_000)

// A-5 (safe core) — the adaptive « tour des trouvailles »: a Tour assembled at
// runtime from whatever the probes found unused, one centred card per feature,
// each handing off to its Guide card via « En savoir plus ». Content adapts to
// THIS household's data; the tour engine (lib/tour startTour) renders it like
// any static tour. Returns null when there's nothing to tour.
export function buildDiscoveryTour(unusedCards: readonly string[]): Tour | null {
  const entries = unusedCards
    .map((id) => GUIDE.find((e) => e.id === id))
    .filter((e): e is GuideEntry => e != null)
    .slice(0, 6) // a whisper, not a lecture — six stops max
  if (entries.length === 0) return null
  return {
    id: 'discovery',
    steps: [
      {
        icon: 'sparkle-bold',
        title: { fr: 'Des coins que vous n’avez pas encore visités', en: 'Corners you haven’t visited yet' },
        body: {
          fr: 'Babillard remarque seulement ce qui est resté vide — rien n’est compté, rien n’est suivi. Voici ce qui dort encore; passe ce tour quand tu veux.',
          en: 'Babillard only notices what’s stayed empty — nothing is counted, nothing is tracked. Here’s what’s still sleeping; skip this tour anytime.',
        },
      },
      ...entries.map((e) => ({
        icon: e.icon,
        title: e.title,
        body: e.what,
        card: e.id,
      })),
    ],
  }
}
