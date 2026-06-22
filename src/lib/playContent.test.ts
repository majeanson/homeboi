import { describe, it, expect } from 'vitest'
import { buildSeekDecks, pickSeekRound, bucketDay, MIN_DECK, type SeekPerson, type DeckNames } from './playContent'

const NAMES: DeckNames = { faces: 'Visages', animals: 'Animaux', colors: 'Couleurs', foods: 'Aliments', weather: 'Météo', mix: 'Mélange' }
const people = (n: number): SeekPerson[] =>
  Array.from({ length: n }, (_, i) => ({ key: `member:m${i}`, firstName: `P${i}`, photo: null, color: '#abc' }))

describe('buildSeekDecks', () => {
  it('always offers the fixed decks + a mix, each with enough items', () => {
    const decks = buildSeekDecks([], 'fr', NAMES)
    const ids = decks.map((d) => d.id)
    expect(ids).toEqual(expect.arrayContaining(['animals', 'colors', 'foods', 'weather', 'mix']))
    for (const d of decks) expect(d.items.length).toBeGreaterThanOrEqual(MIN_DECK)
  })
  it('adds « Les visages » only when there are enough faces', () => {
    expect(buildSeekDecks(people(2), 'fr', NAMES).some((d) => d.id === 'faces')).toBe(false)
    const withFaces = buildSeekDecks(people(4), 'fr', NAMES)
    const faces = withFaces.find((d) => d.id === 'faces')
    expect(faces).toBeTruthy()
    expect(faces!.items).toHaveLength(4)
  })
  it('resolves item + deck labels by language', () => {
    const fr = buildSeekDecks([], 'fr', NAMES).find((d) => d.id === 'animals')!
    const en = buildSeekDecks([], 'en', { ...NAMES, animals: 'Animals' }).find((d) => d.id === 'animals')!
    expect(fr.items.find((i) => i.id === 'dog')!.label).toBe('Chien')
    expect(en.items.find((i) => i.id === 'dog')!.label).toBe('Dog')
    expect(en.label).toBe('Animals')
  })
})

describe('pickSeekRound', () => {
  const deck = buildSeekDecks([], 'fr', NAMES).find((d) => d.id === 'animals')!
  it('builds a board of the requested size that contains the target', () => {
    const { board, target } = pickSeekRound(deck, 5, null, () => 0)
    expect(board).toHaveLength(5)
    expect(board.some((i) => i.id === target.id)).toBe(true)
  })
  it('never repeats the previous target when the board allows', () => {
    const first = pickSeekRound(deck, 4, null)
    const second = pickSeekRound(deck, 4, first.target.id)
    // the new target differs (a 4-tile board always has another option)
    expect(second.target.id).not.toBe(first.target.id)
  })
  it('caps the board at the deck size and never throws', () => {
    const tiny = { id: 'x', label: 'X', emoji: '•', items: deck.items.slice(0, 2) }
    const { board, target } = pickSeekRound(tiny, 6, null, () => 0)
    expect(board.length).toBeLessThanOrEqual(2)
    expect(board.some((i) => i.id === target.id)).toBe(true)
  })
})

describe('bucketDay', () => {
  const at = (h: number) => Math.floor(new Date(2026, 5, 22, h, 0, 0).getTime() / 1000)
  const meals = [
    { slot: 'breakfast', title: 'Œufs' },
    { slot: 'lunch', title: 'Soupe' },
    { slot: 'snack', title: 'Biscuit' },
    { slot: 'supper', title: 'Pâtes' },
  ]
  const events = [
    { title: 'Fête', start_at: at(0), all_day: 1 },
    { title: 'Parc', start_at: at(9), all_day: 0 },
    { title: 'Souper-fête', start_at: at(18), all_day: 0 },
    { title: 'Histoire', start_at: at(22), all_day: 0 },
  ]
  const [matin, midi, soir, dodo] = bucketDay(meals, events)

  it('buckets meals by slot (breakfast→matin, lunch+snack→midi, supper→soir)', () => {
    expect(matin.mealTitles).toEqual(['Œufs'])
    expect(midi.mealTitles).toEqual(['Soupe', 'Biscuit'])
    expect(soir.mealTitles).toEqual(['Pâtes'])
    expect(dodo.mealTitles).toEqual([])
  })
  it('buckets events by local hour, with all-day events in the morning', () => {
    expect(matin.eventTitles).toEqual(expect.arrayContaining(['Fête', 'Parc']))
    expect(soir.eventTitles).toContain('Souper-fête')
    expect(dodo.eventTitles).toContain('Histoire')
  })
  it('always returns the four parts in order', () => {
    expect(bucketDay([], []).map((p) => p.key)).toEqual(['matin', 'midi', 'soir', 'dodo'])
  })
})
