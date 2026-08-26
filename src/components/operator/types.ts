// Row shapes shared by the Réglages shell (src/pages/Operator.tsx, which owns
// the queries) and the section components in this folder.

// The full member row is the canonical OperatorMember (lib/members) — the
// Réglages sections keep importing it as `Member` for continuity.
import type { OperatorMember } from '../../lib/members'
export type Member = OperatorMember
export interface Device {
  id: string
  label: string
  created_at: number
  last_seen_at: number | null
  revoked_at: number | null
}
export interface Chore {
  id: string
  title: string
  color?: string
  rotation_json?: string | null
  recur_json?: string | null
  recur_start?: number | null
  lead_seconds?: number | null
  // D-21 (bmad/10) « Sortir le bac »: opt-in "evening before" board announce.
  announce_evening?: number | null
}
// "Projets & Entretien" (home_projects) — the longer-horizon home work under
// Corvées. ONE row shape; `kind` discriminates the two sub-tabs. A row may carry
// both a budget and a recurrence. Mirrors the raw GET payload (snake_case).
export interface HomeProject {
  id: string
  kind: 'plan' | 'upkeep'
  title: string
  notes?: string | null
  budget_cents?: number | null
  color?: string
  at?: number | null // target/occurrence date OR recurrence anchor (unix sec); null = undated
  nextAt?: number | null // server-derived NEXT occurrence from today (recurring → expanded); drives « cette saison »
  dueToday?: boolean // server-derived (_lib/upkeep): an occurrence lands today, not yet checked
  overdueSince?: number | null // server-derived: most recent missed due date, carried until checked (calm)
  snoozedUntil?: number | null // server-derived: « Reporté » in effect — the day it wakes back up
  snoozed_until?: number | null // the raw column (0120); status suppression reads it server-side
  recur_json?: string | null
  recur_from?: 'anchor' | 'done' | null // 0119: 'done' = « à partir de la dernière fois » re-anchors the cycle
  lead_seconds?: number | null
  last_done_at?: number | null
  carnet_id?: string | null // « Les carnets » link (migration 0082); null = household-level
}

interface RoutineCard {
  icon: string
  label: string
  narration?: string
  // Per-step aids stored inline in cards_json (no migration): the tap-to-start
  // countdown, and the « truc » the companion speaks for this step. Both must survive
  // a round-trip through the edit form — a field the prefill type doesn't know about
  // is a field the next save silently drops.
  seconds?: number
  tip?: string
}
export interface Routine {
  id: string
  name: string
  memberName: string | null
  timeOfDay: string | null
  // Present in the routines GET payload; needed so the edit form can prefill the
  // existing card deck (the Settings list still only renders name/member/tod).
  cards?: RoutineCard[]
  // Parallel parent-voice clip keys, one R2 key per card ('' = none → TTS).
  // Same length as cards; lets the edit form prefill recorded clips (feature #17 A).
  cardsNarration?: string[]
  // Parallel card photo keys, one R2 key per card ('' = none → emoji). Same
  // length as cards; lets the edit form prefill attached photos (feature #17 C).
  cardsPhoto?: string[]
}
export interface EventRow {
  id: string
  title: string
  start_at: number
  all_day: number
  member_id: string | null
  contact_id?: string | null // #21: a « Le cercle » contact instead of a member
  contact_name?: string | null // joined server-side, for the "who" label
  business_id?: string | null // a « Le cercle » Business (vet, plumber…) — a rendez-vous
  business_name?: string | null // joined server-side, for the "who" label
  business_colour?: string | null // the business's own tint — colours the rendez-vous
  recur_json?: string | null
  lead_seconds?: number | null
  car_id?: string | null // « L'auto »: which household car this ride takes (null = carpool/none)
  passengers?: string | null // « Qui »: the household people this concerns (JSON id array); member_id = passengers[0]
}
