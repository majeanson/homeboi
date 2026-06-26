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
  recur_json?: string | null
  lead_seconds?: number | null
  last_done_at?: number | null
  carnet_id?: string | null // « Les carnets » link (migration 0082); null = household-level
}

interface RoutineCard {
  icon: string
  label: string
  narration?: string
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
  passengers?: string | null // « L'auto »: member ids riding along (JSON array)
}
