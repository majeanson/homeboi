// « Joindre » (A-6, bmad/10) — the quick-dial rail at the foot of Le cercle's people
// tabs + Business, on mobile. Pure ranking here; the rail itself is
// `components/cercle/JoindreRail.tsx`.
//
// Eligibility: has a `phone` (a `tel:` link) or an `email` (a `mailto:` link) —
// nothing else qualifies for the rail (a birthday-only contact never shows up).
//
// Order: per-device pick frequency (`frequentScores('joindre')`, bumped via
// `bumpFrequent('joindre', key)` whenever the rail — or an existing tel:/mailto:
// quick-link in Le cercle — is actually used) wins once it exists. Before any
// picks (cold start, a brand-new household) the tiers below decide instead:
//   0. an `urgence`-tagged contact (same tag `functions/api/guest/window.ts`
//      reads for the gardienne's emergency-contacts card)
//   1. a household member with a phone
//   2. a business (vet, plumber…)
//   3. everyone else eligible
// — alphabetical by first name within a tier. Capped to 8: a rail, not a directory.
export type JoindreKind = 'member' | 'contact' | 'pet' | 'business'

export interface JoindreCandidate {
  key: string // person `${kind}:${id}` (lib/cercle personKey) or `business:<id>`
  kind: JoindreKind
  name: string
  firstName: string
  phone: string | null
  email: string | null
  avatarKind: string | null
  avatarRef: string | null
  colour: string | null
  // Contacts only — drives the `urgence` cold-start boost. Members/pets/businesses
  // carry no tags today, so omit or leave undefined.
  tags?: string[]
}

// The subset of `lib/businesses` `Business` the ranking needs — matches the wire
// shape exactly, so callers can pass Businesses straight through.
export interface JoindreBusinessInput {
  id: string
  name: string
  phone: string | null
  email: string | null
  colour: string | null
}

const CAP = 8
export const JOINDRE_SCOPE = 'joindre'

function isEligible(c: JoindreCandidate): boolean {
  return !!(c.phone || c.email)
}

function isUrgence(c: JoindreCandidate): boolean {
  return c.kind !== 'business' && !!c.tags?.some((tag) => tag.trim().toLowerCase() === 'urgence')
}

// Cold-start tier — lower sorts first. Only the RELATIVE order matters (ties break
// on name), so exact numbers are arbitrary as long as they're ordered right.
function tier(c: JoindreCandidate): number {
  if (isUrgence(c)) return 0
  if (c.kind === 'member' && c.phone) return 1
  if (c.kind === 'business') return 2
  return 3
}

function businessToCandidate(b: JoindreBusinessInput): JoindreCandidate {
  return {
    key: `business:${b.id}`,
    kind: 'business',
    name: b.name,
    firstName: b.name,
    phone: b.phone,
    email: b.email,
    avatarKind: null,
    avatarRef: null,
    colour: b.colour,
  }
}

/**
 * Rank people + businesses for the « Joindre » rail: eligible (phone or email)
 * entries only, frequency-first (via `scores`, e.g. `frequentScores('joindre')`),
 * falling back to the urgence → members-with-phone → businesses → others cold-start
 * order, alphabetical within a tier. Capped to 8.
 */
export function rankJoindre(
  people: JoindreCandidate[],
  businesses: JoindreBusinessInput[],
  scores: Record<string, number>,
): JoindreCandidate[] {
  const all = [...people, ...businesses.map(businessToCandidate)].filter(isEligible)
  return all
    .sort((a, b) => {
      const scoreDiff = (scores[b.key] ?? 0) - (scores[a.key] ?? 0)
      if (scoreDiff !== 0) return scoreDiff
      const tierDiff = tier(a) - tier(b)
      if (tierDiff !== 0) return tierDiff
      return a.firstName.localeCompare(b.firstName)
    })
    .slice(0, CAP)
}
