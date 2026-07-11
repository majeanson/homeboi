import type { Member } from './members'

// « Qui » — the household people a rendez-vous concerns. ONE source of truth: the
// event's `passengers` JSON id array. `member_id` is its denormalized primary
// (passengers[0]); we fall back to it alone for pre-multi rows that only ever set
// member_id, so old events still attribute to their one person. New rows always have
// member_id === passengers[0], so this never double-counts. Shared by the form seed,
// the detail peek, the board/agenda rows, and the focus filter.

// Parse a stored `passengers` column (a member-id JSON array) into a string[].
// Defensive: an absent/malformed value reads as no people, never throws.
export function parsePeopleIds(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// The member ids an event concerns: its passengers set, else its legacy single
// member_id, else none. (contact_id/business_id are the EXTERNAL « Avec », not people.)
export function eventMembers(e: { member_id?: string | null; passengers?: string | null }): string[] {
  const ids = parsePeopleIds(e.passengers)
  if (ids.length) return ids
  return e.member_id ? [e.member_id] : []
}

// A face, resolved from an id list against the household roster, in the shape the
// shared <Avatar>/<AvatarStack> take. Unknown ids (a deleted member) drop out — a
// soft ref renders as nobody, never a crash.
export interface Face {
  kind?: string | null
  photo?: string | null
  colour?: string | null
  name?: string | null
}
export function memberFaces(ids: string[], members: Member[]): Face[] {
  return ids
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => !!m)
    .map((m) => ({ kind: m.avatar_kind, photo: m.avatar_ref, colour: m.colour, name: m.display_name }))
}
