import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { CERCLE_KEY, HOUSEHOLD_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { Loading, LoadError, PairPrompt } from '../components/Fallback'
import { CercleConstellation } from '../components/cercle/CercleConstellation'
import { useAudience } from '../lib/audience'
import {
  type Contact,
  type Member,
  type ContactLink,
  type ContactGroupRaw,
  type Pet,
  unifyCircle,
  buildGroups,
  friendLinksFromGroups,
  closedLinks,
  personKey,
  petOwners,
  isHouseholdPet,
  worldClustersFrom,
  buildWorld,
} from '../lib/cercle'

const ACCENT = '#2A8F85' // the cercle teal — the Maisonnée island at the centre

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups: ContactGroupRaw[]
  pets: Pet[]
}

// /cercle/monde — « Notre monde », the big-picture overview scene. A standalone
// full-screen scene (like Cook mode) so the whole map of families + groups + the
// bridges between them gets room to breathe. Follows the audience profile: a parent
// reads the analytical map, a toddler the same map bigger + speak-first. Read-only —
// it's for UNDERSTANDING the structure; editing stays in the normal cercle.
export function CercleWorldPage() {
  const t = useT()
  const { audience } = useAudience()
  const close = useSceneClose('/cercle')
  useEscapeKey(close)

  const { data, error } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })
  const { data: household } = useQuery({ queryKey: HOUSEHOLD_KEY, queryFn: () => api<{ name: string }>('household') })

  const contacts = useMemo(() => data?.contacts ?? [], [data])
  const members = useMemo(() => data?.members ?? [], [data])
  const rawLinks = useMemo(() => data?.links ?? [], [data])
  const rawGroups = useMemo(() => data?.groups ?? [], [data])
  const pets = useMemo(() => data?.pets ?? [], [data])

  const unified = useMemo(() => unifyCircle(contacts, members, rawLinks, rawGroups, pets), [contacts, members, rawLinks, rawGroups, pets])
  const people = unified.people
  // Same closed + group-implied-friend link set the directory uses, so bridges read
  // the full family (derived ties) and the friend-group ties too.
  const links = useMemo(() => {
    const groupFriends = friendLinksFromGroups(buildGroups(unified.groups), unified.links)
    return closedLinks(unified.people, [...unified.links, ...groupFriends])
  }, [unified])
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])

  // The household island = members + our animals (the same Maisonnée-card rule).
  const owners = useMemo(() => petOwners(unified.links), [unified.links])
  const householdKeys = useMemo(() => {
    const memberKeys = new Set(members.map((m) => personKey('member', m.id)))
    const s = new Set<string>(memberKeys)
    for (const p of people) if (p.kind === 'pet' && isHouseholdPet(p.key, owners, memberKeys)) s.add(p.key)
    return s
  }, [members, people, owners])

  // Named groups, minus a family group that's just the household (redundant with the
  // Maisonnée island) — matches the directory's rule.
  const namedGroups = useMemo(() => {
    const all = buildGroups(unified.groups)
    return all.filter((g) => g.memberKeys.size === 0 || g.kind !== 'family' || ![...g.memberKeys].every((k) => householdKeys.has(k)))
  }, [unified.groups, householdKeys])

  const householdName = household?.name?.trim() || t.cercle.memberBadge

  const world = useMemo(() => {
    const clusters = worldClustersFrom(
      people,
      links,
      namedGroups,
      householdKeys,
      householdName,
      ACCENT,
      (name) => (name ? t.cercle.familyOf(name) : t.cercle.familyGeneric),
    )
    return buildWorld(people, links, clusters, t.cercle.others)
  }, [people, links, namedGroups, householdKeys, householdName, t])

  if (isUnauthorized(error)) return <PairPrompt />
  // A non-401 failure with no cached frame surfaces as an error, not a blank world map.
  if (error && !data) return <LoadError />
  if (!data) return <Loading />

  return (
    <div className="scene scene--world" aria-label={t.cercle.world.title}>
      <SceneHead title={t.cercle.world.title} icon="sparkle-bold" card="cercle" onClose={close} />
      <div className="scene__body scene__body--flush">
        <CercleConstellation world={world} byKey={byKey} toddler={audience === 'toddler'} />
      </div>
    </div>
  )
}
