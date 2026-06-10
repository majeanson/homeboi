// Row shapes shared by the Réglages shell (src/pages/Operator.tsx, which owns
// the queries) and the section components in this folder.
export interface Member {
  id: string
  display_name: string
  is_child: number
  avatar_ref: string
  avatar_kind: string
  colour: string
}
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
}
export interface Routine {
  id: string
  name: string
  memberName: string | null
}
export interface EventRow {
  id: string
  title: string
  start_at: number
  all_day: number
  member_id: string | null
  recur_json?: string | null
}
