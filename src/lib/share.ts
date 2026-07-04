// « Partager » — the client seam for the generic snapshot-share rail (migration 0102).
// Types mirror functions/_lib/shareSnapshots.ts (the wire contract); the helpers wrap
// /api/share (operator CRUD + the « Mes partages » ledger) and /api/share-public (the
// UNauthenticated /partage read). A share is a one-time COPY under an unguessable id —
// never a live link. See src/components/ShareModal.tsx for the shared sheet UI.
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { SHARES_KEY } from './queryKeys'

export type ShareKind = 'family' | 'recipe' | 'event' | 'routine'

export interface RecipeSharePayload {
  title: string
  ingredients: string[] // '## Section' headings ride along — renderers/import skip them
  steps: string[]
  servings: number | null
  servingsUnit: string | null
  prepMin: number | null
  cookMin: number | null
  totalMin: number | null
  notes: string | null
  source: string | null
  image: string | null // share-owned R2 key OR a remote https URL
  stepImages: string[] // parallel to steps; '' = none
  tags: string[]
  lang: string | null
}

export interface EventSharePayload {
  title: string
  startAt: number
  allDay: boolean
  whoLabel: string | null // display name only, never an id
}

export interface RoutineShareCard {
  icon: string
  label: string
  seconds?: number
  photoKey: string // share-owned R2 key, or '' (uses the emoji)
}
export interface RoutineSharePayload {
  name: string
  timeOfDay: string | null
  cards: RoutineShareCard[]
}

// What /api/share-public returns per kind — content kinds carry the full snapshot; a
// family carries a TEASER only (its PII stays signed-in-only, read via /cercle/import).
export type PublicShare =
  | { kind: 'recipe'; label: string; sourceName: string | null; payload: RecipeSharePayload; expiresAt: number | null }
  | { kind: 'event'; label: string; sourceName: string | null; payload: EventSharePayload; expiresAt: number | null }
  | { kind: 'routine'; label: string; sourceName: string | null; payload: RoutineSharePayload; expiresAt: number | null }
  | { kind: 'family'; label: string; sourceName: string | null; peopleCount: number; petCount: number }

export interface ShareLedgerEntry {
  id: string
  kind: ShareKind
  label: string
  createdAt: number
  expiresAt: number | null
}

// Mint a share for one of the content kinds (the server snapshots it from the row).
export type CreateShareBody =
  | { kind: 'recipe'; recipeId: string; label?: string }
  | { kind: 'event'; eventId: string; label?: string }
  | { kind: 'routine'; routineId: string; label?: string }

export async function createShare(body: CreateShareBody): Promise<{ id: string; url: string; expiresAt: number }> {
  return api('share', { method: 'POST', body })
}

export async function revokeShare(id: string): Promise<void> {
  await api('share', { method: 'DELETE', body: { id } })
}

// The sender's live shares (all kinds) — « Mes partages » in Réglages ▸ Partage.
export function useShares(enabled = true) {
  return useQuery({
    queryKey: SHARES_KEY,
    queryFn: () => api<{ shares: ShareLedgerEntry[] }>('share'),
    enabled,
  })
}

// The public read for a /partage/<id> page (no auth needed — the id is the capability).
export async function fetchPublicShare(id: string): Promise<PublicShare> {
  return api<PublicShare>(`share-public?s=${encodeURIComponent(id)}`)
}
