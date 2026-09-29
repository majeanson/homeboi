import { describe, it, expect, vi, beforeEach } from 'vitest'

// « Fiche famille » — the ONE merge (lib/ficheMerge). The two copies it replaced had
// drifted; these cases pin the behaviour each door relied on, now in one place.

const calls: { path: string; method: string; body: Record<string, unknown> }[] = []
let nextId = 0
vi.mock('./api', () => ({
  api: vi.fn(async (path: string, init?: { method?: string; body?: Record<string, unknown> }) => {
    calls.push({ path, method: init?.method ?? 'GET', body: init?.body ?? {} })
    return { id: `new${++nextId}` }
  }),
}))

import { buildReview, mergeIntoCercle, mergeSteps, ownPhoto, type ReviewItem } from './ficheMerge'
import type { IntakePersonInput, IntakeSubmission } from './intake'

const person = (firstName: string): IntakePersonInput => ({
  firstName,
  lastName: 'Fortier',
  nickname: '',
  birthday: null,
  gender: null,
  email: '',
  phone: '',
  address: null,
  notes: '',
  photoKey: null,
})

// Camille (self, 0) · Théo (1) · Grisou the cat, owned by Théo.
const SUB: IntakeSubmission = {
  self: person('Camille'),
  household: [person('Théo')],
  // Written the OTHER way round — Théo → Camille. The intake copy only looked for
  // `aIndex === idx && bIndex === 0`, so this row came through unlabelled.
  links: [{ aIndex: 0, bIndex: 1, type: 'parent' }],
  pets: [{ name: 'Grisou', species: 'chat', photoKey: null, ownerIndex: 1 }],
}

beforeEach(() => {
  calls.length = 0
  nextId = 0
})

describe('buildReview', () => {
  it('labels a relationship to the sender whichever way round it was written', () => {
    const { items } = buildReview(SUB, [], [])
    const theo = items.find((i) => i.kind === 'person' && i.index === 1) as Extract<ReviewItem, { kind: 'person' }>
    expect(theo.relType).toBe('parent')
  })

  it('a known person defaults to MERGING, a stranger to a new fiche, and a target wins for the sender', () => {
    const target = { kind: 'contact' as const, id: 'c7', name: 'Camille F.' }
    const { decision } = buildReview(SUB, [], [], target)
    expect(decision[0]).toBe('contact:c7')
    expect(decision[1]).toBe('new')
  })
})

describe('mergeIntoCercle', () => {
  const run = (selected: ReviewItem[], alwaysSelf: boolean, groupLabel: string | null = null) => {
    const { items, decision } = buildReview(SUB, [], [])
    return mergeIntoCercle({ sub: SUB, items, selected, decision, contacts: [], alwaysSelf, photo: ownPhoto, groupLabel })
  }
  const pick = (pred: (i: ReviewItem) => boolean) => buildReview(SUB, [], []).items.filter(pred)

  it('an intake always brings the sender in, even unticked — and the cat falls back to them', async () => {
    // Only the cat is ticked: its owner (Théo) is not coming in.
    await run(pick((i) => i.kind === 'pet'), true)
    const people = calls.filter((c) => c.path === 'cercle')
    expect(people.map((c) => c.body.firstName)).toEqual(['Camille'])
    const owner = calls.find((c) => c.path === 'cercle-links' && c.body.type === 'owner')
    expect(owner?.body.aId, 'the cat belongs to the one person who came in').toBe('new1')
  })

  it('a shared family brings in only who was ticked, and names the family as a group', async () => {
    await run(pick((i) => i.kind === 'person'), false, 'Les Fortier')
    expect(calls.filter((c) => c.path === 'cercle').map((c) => c.body.firstName)).toEqual(['Camille', 'Théo'])
    expect(calls.some((c) => c.path === 'cercle-links' && c.body.type === 'parent')).toBe(true)
    expect(calls.filter((c) => c.path === 'cercle-groups')).toHaveLength(3) // the group + two members
  })

  it('counts its own steps — the progress bar never overshoots', () => {
    const { items } = buildReview(SUB, [], [])
    expect(mergeSteps({ sub: SUB, items, selected: items, alwaysSelf: false, groupLabel: 'Les Fortier' })).toBe(
      2 /* people */ + 1 /* link */ + 1 /* pet */ + 3 /* group */,
    )
  })
})
