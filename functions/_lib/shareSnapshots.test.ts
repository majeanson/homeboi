import { describe, it, expect } from 'vitest'
import {
  isShareKind,
  clampSnapshotTtl,
  buildRecipeSnapshot,
  buildEventSnapshot,
  buildRoutineSnapshot,
  snapshotBlobKeys,
  remapSnapshotBlobKeys,
  type RecipeSharePayload,
  type RoutineSharePayload,
} from './shareSnapshots'

const DAY = 24 * 60 * 60

describe('isShareKind', () => {
  it('accepts the four kinds, rejects anything else', () => {
    for (const k of ['family', 'recipe', 'event', 'routine']) expect(isShareKind(k)).toBe(true)
    for (const k of ['', 'trip', 'note', 42, null, undefined]) expect(isShareKind(k)).toBe(false)
  })
})

describe('clampSnapshotTtl', () => {
  it('defaults per kind when the request is absent', () => {
    expect(clampSnapshotTtl('family', null)).toBe(30 * DAY)
    expect(clampSnapshotTtl('recipe', undefined)).toBe(365 * DAY)
    expect(clampSnapshotTtl('routine', null)).toBe(365 * DAY)
  })

  it('clamps to the kind ceiling and the 30-min floor', () => {
    expect(clampSnapshotTtl('family', 999 * DAY)).toBe(30 * DAY) // family capped at 30 d
    expect(clampSnapshotTtl('recipe', 999 * DAY)).toBe(365 * DAY) // content capped at 1 yr
    expect(clampSnapshotTtl('recipe', 10)).toBe(30 * 60) // below the floor
  })

  it('falls back to the default on non-finite input', () => {
    expect(clampSnapshotTtl('event', 'soon')).toBe(365 * DAY)
    expect(clampSnapshotTtl('event', NaN)).toBe(365 * DAY)
  })
})

describe('buildRecipeSnapshot', () => {
  const base = {
    title: 'Soupe',
    ingredients: ['## Base', 'eau', 'sel'],
    steps: ['Bouillir', 'Servir'],
    servings: 4,
    servingsUnit: 'bols',
    prepMin: 10,
    cookMin: 20,
    totalMin: 30,
    notes: 'chaud',
    source: 'Mémé',
    image: 'sh_abc123',
    stepImages: ['si_one', ''],
    tags: ['soupe', 'hiver'],
    lang: 'fr' as const,
  }

  it('shapes a full recipe, keeping ## headings and parallel step images', () => {
    const p = buildRecipeSnapshot(base)
    expect(p.ingredients).toEqual(['## Base', 'eau', 'sel'])
    expect(p.steps).toEqual(['Bouillir', 'Servir'])
    expect(p.stepImages).toEqual(['si_one', '']) // same length as steps
    expect(p.image).toBe('sh_abc123')
    expect(p.lang).toBe('fr')
  })

  it('passes a remote https image through untouched, drops a junk image', () => {
    expect(buildRecipeSnapshot({ ...base, image: 'https://x.test/a.jpg' }).image).toBe('https://x.test/a.jpg')
    expect(buildRecipeSnapshot({ ...base, image: 'not a key!!' }).image).toBeNull()
  })

  it('re-aligns stepImages to the step count (trims extras, pads short)', () => {
    expect(buildRecipeSnapshot({ ...base, stepImages: ['a', 'b', 'c'] }).stepImages).toHaveLength(2)
    expect(buildRecipeSnapshot({ ...base, stepImages: [] }).stepImages).toEqual(['', ''])
  })

  it('falls back the title and drops a non-positive servings', () => {
    expect(buildRecipeSnapshot({ ...base, title: '   ' }).title).toBe('Recette')
    expect(buildRecipeSnapshot({ ...base, servings: 0 }).servings).toBeNull()
  })
})

describe('buildEventSnapshot', () => {
  it('keeps only title/when/whoLabel and coerces allDay', () => {
    const p = buildEventSnapshot({ title: 'BBQ', startAt: 1000, allDay: 1, whoLabel: 'Les Tremblay' })
    expect(p).toEqual({ title: 'BBQ', startAt: 1000, allDay: true, whoLabel: 'Les Tremblay' })
  })

  it('nulls a blank whoLabel and falls back the title', () => {
    const p = buildEventSnapshot({ title: '', startAt: 5, allDay: false, whoLabel: '  ' })
    expect(p.title).toBe('Rendez-vous')
    expect(p.whoLabel).toBeNull()
  })
})

describe('buildRoutineSnapshot', () => {
  const src = {
    name: 'Dodo',
    timeOfDay: 'evening',
    cards: [
      { icon: '🦷', label: 'Brosse', seconds: 120, narration: 'ic_secret' },
      { icon: '📖', label: 'Livre' },
    ],
    cardsPhoto: ['rp_one', ''],
  }

  it('shapes cards with parallel photos + clamped seconds, and never carries narration', () => {
    const p = buildRoutineSnapshot(src)
    expect(p.name).toBe('Dodo')
    expect(p.timeOfDay).toBe('evening')
    expect(p.cards[0]).toEqual({ icon: '🦷', label: 'Brosse', seconds: 120, photoKey: 'rp_one' })
    expect(p.cards[1]).toEqual({ icon: '📖', label: 'Livre', photoKey: '' })
    // Narration (a parent's voice) must not leak into the shared payload.
    expect(JSON.stringify(p)).not.toContain('narration')
    expect(JSON.stringify(p)).not.toContain('ic_secret')
  })

  it('normalizes an unknown time-of-day to null', () => {
    expect(buildRoutineSnapshot({ ...src, timeOfDay: 'midnight' }).timeOfDay).toBeNull()
  })
})

describe('snapshotBlobKeys', () => {
  it('lists a recipe image + non-empty step images, skipping https + blanks', () => {
    const p = buildRecipeSnapshot({
      title: 'x', ingredients: [], steps: ['a', 'b'], servings: null, servingsUnit: null,
      prepMin: null, cookMin: null, totalMin: null, notes: null, source: null,
      image: 'https://x.test/a.jpg', stepImages: ['si_a', ''], tags: [], lang: null,
    })
    expect(snapshotBlobKeys('recipe', p)).toEqual(['si_a']) // https image excluded
  })

  it('lists routine card photos and nothing for an event', () => {
    const r = buildRoutineSnapshot({ name: 'x', timeOfDay: null, cards: [{ icon: 'a', label: 'b' }], cardsPhoto: ['rp_x'] })
    expect(snapshotBlobKeys('routine', r)).toEqual(['rp_x'])
    expect(snapshotBlobKeys('event', { title: 'x', startAt: 0, allDay: false, whoLabel: null })).toEqual([])
  })

  it('tolerates a malformed payload', () => {
    expect(snapshotBlobKeys('recipe', null)).toEqual([])
    expect(snapshotBlobKeys('routine', 'nope')).toEqual([])
  })
})

describe('remapSnapshotBlobKeys', () => {
  it('rewrites recipe keys, drops on null, leaves https alone', () => {
    const p: RecipeSharePayload = {
      title: 'x', ingredients: [], steps: ['a', 'b'], servings: null, servingsUnit: null,
      prepMin: null, cookMin: null, totalMin: null, notes: null, source: null,
      image: 'rc_orig', stepImages: ['si_a', ''], tags: [], lang: null,
    }
    const out = remapSnapshotBlobKeys('recipe', p, (k) => (k === 'rc_orig' ? 'sh_new' : null))
    expect(out.image).toBe('sh_new')
    expect(out.stepImages).toEqual(['', '']) // si_a mapped to null → ''
    // https image is never remapped
    const withUrl = remapSnapshotBlobKeys('recipe', { ...p, image: 'https://x/y.jpg' }, () => 'sh_z')
    expect(withUrl.image).toBe('https://x/y.jpg')
  })

  it('rewrites routine card photos immutably', () => {
    const r: RoutineSharePayload = {
      name: 'x', timeOfDay: null,
      cards: [{ icon: 'a', label: 'b', photoKey: 'rp_orig' }, { icon: 'c', label: 'd', photoKey: '' }],
    }
    const out = remapSnapshotBlobKeys('routine', r, (k) => `sh_${k}`)
    expect(out.cards[0].photoKey).toBe('sh_rp_orig')
    expect(out.cards[1].photoKey).toBe('')
    expect(r.cards[0].photoKey).toBe('rp_orig') // input untouched
  })
})
