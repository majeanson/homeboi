import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { CERCLE_KEY } from './queryKeys'
import { eventMembers, faceRoster } from './eventPeople'
import type { Member } from './members'
import type { Pet } from './cercle'

// A household animal in the FACE shape a member has (review #31: « Jules can't be the
// subject of a rendez-vous »). The amber is the directory's photoless-pet tint.
export function petFace(p: Pick<Pet, 'id' | 'name' | 'colour' | 'photoKey'>): Required<Member> {
  return {
    id: p.id,
    display_name: p.name,
    is_child: 0,
    colour: p.colour ?? '#C7873F',
    avatar_kind: p.photoKey ? 'photo' : 'initial',
    avatar_ref: p.photoKey ?? '',
  }
}

// The face roster a surface draws rendez-vous with: its members, plus the animals — read
// from the cercle ONLY when an event names someone who is not a member. The board poll
// never reads pets (board-poll.test.ts: it is the free-tier lever), and most boards never
// need to: no pet rendez-vous, no extra request. Lookups by id only — never the lens.
type Concerns = { member_id?: string | null | undefined; passengers?: string | null | undefined }
export function useFaceRoster(members: readonly Member[], events: readonly Concerns[]): Member[] {
  const known = new Set(members.map((m) => m.id))
  const needed = events.some((e) => eventMembers(e).some((id) => !known.has(id)))
  const { data } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<{ pets?: Pet[] }>('cercle'),
    enabled: needed,
    staleTime: 5 * 60_000,
  })
  return faceRoster<Member>(members, needed ? data?.pets?.map(petFace) : undefined)
}
