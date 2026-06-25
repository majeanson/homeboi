import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { CARNETS_KEY, CARE_LOG_KEY, HOME_PINS_KEY } from './queryKeys'

// « Les carnets » — the household's cared-for things as a TREE (a house, a car, and
// the water heater INSIDE a house). Mirrors the camelCase shape /api/carnets returns.
// A top-level carnet (parentId null) is a member of Le cercle; a child is a thing or
// a room ('zone'). Each keeps an identity here + a service history (care_log) + a
// recurring cadence (home_projects.carnet_id) + a « long jeu » lifecycle.

export type CarnetKind = 'home' | 'auto' | 'appliance' | 'system' | 'zone' | 'thing'

export const CARNET_KINDS: CarnetKind[] = ['home', 'auto', 'appliance', 'system', 'zone', 'thing']

// A kind-specific facts bag (kept loose so the schema doesn't grow a column per kind).
export interface CarnetFacts {
  emoji?: string
  model?: string // model / serial number
  warrantyUntil?: number | null // unix sec (local midnight)
  [k: string]: unknown
}

export interface Carnet {
  id: string
  parentId: string | null
  kind: CarnetKind
  name: string
  mediaKey: string | null
  color: string
  facts: CarnetFacts | null
  installedAt: number | null // unix sec (local midnight) — install/acquire day
  lifespanMonths: number | null // expected service life → « le long jeu »
  linkId: string | null // bridge to an operational row (cars.id for kind 'auto')
  notes: string | null
  sort: number
}

// A « long jeu » nudge for the board glance — a thing entering (or past) its window.
export interface CarnetSoon {
  carnetId: string
  name: string
  kind: string
  color: string | null
  at: number // projected replacement day (unix sec)
  monthsLeft: number // negative once overdue
}

export interface CareLog {
  id: string
  carnetId: string
  at: number // unix sec (local midnight) — when it happened
  kind: 'service' | 'install' | 'purchase' | 'note'
  title: string
  note: string | null
  costCents: number | null
  businessId: string | null
  mediaKeys: string[] // R2 keys: invoice / manual / photo
}

// « En cas de pépin » — one map reference on a home carnet (a location or a how-to).
export type HomePinKind = 'where' | 'howto' | 'doc'
export interface HomePin {
  id: string
  carnetId: string
  kind: HomePinKind
  label: string
  detail: string | null
  mediaKey: string | null
  sort: number
}

export const PIN_EMOJI: Record<HomePinKind, string> = { where: '📍', howto: '💡', doc: '📄' }

export const CARNET_COLOUR = '#88a36f'

// Warm per-thing identity (content emoji is allowed; control glyphs stay Phosphor).
// A carnet may override via facts.emoji; otherwise it defaults by kind.
export const KIND_EMOJI: Record<CarnetKind, string> = {
  home: '🏠',
  auto: '🚗',
  appliance: '🔌',
  system: '⚙️',
  zone: '🚪',
  thing: '📦',
}

export function carnetEmoji(c: Pick<Carnet, 'kind' | 'facts'>): string {
  const e = c.facts?.emoji
  return typeof e === 'string' && e.trim() ? e : KIND_EMOJI[c.kind] ?? '📦'
}

// A stored doc key is a PDF when its key carries the `.pdf` suffix (care-log uploads
// with extFromType on). Older keys (pre-suffix) have no extension, so the doc viewer
// also falls back to PDF when an `<img>` load fails — this is just the fast path.
export function isPdfKey(key: string): boolean {
  return /\.pdf$/i.test(key)
}

// The projected replacement day (mirrors functions/_lib/carnetLife.replacementAt):
// add whole months to the install date. Noon-UTC keeps us inside the civil date.
export function replacementDate(installedAt: number, lifespanMonths: number): Date {
  const d = new Date(installedAt * 1000)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + lifespanMonths, d.getUTCDate(), 12))
}

// The whole tree + the lifecycle "soon" glance. Read by the cercle SubTab, the carnet
// scene, AND the board card — one shared key (CARNETS_KEY) so an edit refreshes all.
// `live: false` opts OUT of the poll (the board reads it this way): the tree + the
// long-jeu "soon" change on the scale of days, not seconds, and a carnet write still
// invalidates CARNETS_KEY — so a carnet-less household never adds /api/carnets to the
// board poll (the free-tier cost lever). The SubTab + scene keep the live poll.
export function useCarnets(opts?: { live?: boolean }) {
  return useQuery({
    queryKey: CARNETS_KEY,
    queryFn: () => api<{ carnets: Carnet[]; soon: CarnetSoon[] }>('carnets'),
    ...(opts?.live === false ? { staleTime: 5 * 60_000 } : live),
  })
}

// One carnet's service history. Keyed [...CARE_LOG_KEY, carnetId] so a write to any
// carnet (which invalidates CARE_LOG_KEY) refreshes the open history.
export function useCareLog(carnetId: string | undefined) {
  return useQuery({
    queryKey: [...CARE_LOG_KEY, carnetId],
    queryFn: () => api<{ entries: CareLog[] }>(`care-log?carnet=${carnetId}`),
    enabled: !!carnetId,
    ...live,
  })
}

// « En cas de pépin » — a home carnet's map pins.
export function useHomePins(carnetId: string | undefined) {
  return useQuery({
    queryKey: [...HOME_PINS_KEY, carnetId],
    queryFn: () => api<{ pins: HomePin[] }>(`home-pins?carnet=${carnetId}`),
    enabled: !!carnetId,
    ...live,
  })
}
