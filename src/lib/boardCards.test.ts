import { describe, it, expect } from 'vitest'
import {
  BOARD_CARDS,
  DEFAULT_CARD_PREFS,
  cardMode,
  cardSize,
  cardZone,
  clampSize,
  isCardVisible,
  moveCard,
  nextSize,
  reconcile,
  visibleCards,
  type BoardCardId,
  type BoardCardPrefs,
} from './boardCards'

const ALL = BOARD_CARDS.map((c) => c.id)
const fresh = (): BoardCardPrefs => reconcile({})

describe('reconcile — canonical shape', () => {
  it('an unset device gets every card, in canonical zones and order', () => {
    const p = fresh()
    expect(p.band).toEqual(['notes', 'heroes', 'mots', 'aRegler', 'moments'])
    expect(p.grid[0]).toBe('autoCard')
    expect([...p.band, ...p.grid].sort()).toEqual([...ALL].sort())
  })

  it('never lets a card appear twice, even if it is saved in both zones', () => {
    const p = reconcile({ band: ['today', 'notes'], grid: ['today', 'autoCard'] })
    const all = [...p.band, ...p.grid]
    expect(all.filter((id) => id === 'today')).toHaveLength(1)
    // First occurrence wins: it was listed in `band` first.
    expect(p.band).toContain('today')
    expect(p.grid).not.toContain('today')
  })

  it('drops ids that no longer exist', () => {
    const p = reconcile({ grid: ['today', 'ghostCard' as BoardCardId, 'upcoming'] })
    expect(p.grid).not.toContain('ghostCard')
    expect(p.grid).toContain('today')
  })

  it('splices a missing card in at its canonical position, not at the end', () => {
    // A device that predates `habitudes`: it sits after `routineNext` canonically.
    const saved = ALL.filter((id) => id !== 'habitudes')
    const p = reconcile({ band: [], grid: saved })
    expect(p.grid.indexOf('habitudes')).toBe(p.grid.indexOf('routineNext') + 1)
    expect(p.grid.at(-1)).not.toBe('habitudes')
  })

  it('preserves the RELATIVE order of saved cards (re-added ones interleave canonically)', () => {
    const p = reconcile({ band: [], grid: ['photos', 'today', 'autoCard'] })
    // Cards the device never saw are spliced in at their canonical spots, so the three
    // saved ids need not stay adjacent — but they must stay in the order it chose.
    expect(p.grid.indexOf('photos')).toBeLessThan(p.grid.indexOf('today'))
    expect(p.grid.indexOf('today')).toBeLessThan(p.grid.indexOf('autoCard'))
  })
})

describe('reconcile — v1 → v2 migration', () => {
  // The shape every already-shipped device has in localStorage['babillard-card-prefs'].
  const V1 = { order: ['today', 'upcoming'], hidden: ['todos', 'moments'] }

  it('turns the v1 hidden set into mode: never', () => {
    const p = reconcile(V1)
    expect(cardMode(p, 'todos')).toBe('never')
    expect(cardMode(p, 'moments')).toBe('never')
    expect(isCardVisible(p, 'todos')).toBe(false)
    // A band card could be hidden in v1 too — that must survive.
    expect(cardZone(p, 'moments')).toBe('band')
  })

  it('keeps the v1 grid order and re-adds every card it never knew about', () => {
    const p = reconcile(V1)
    expect(p.grid.indexOf('today')).toBeLessThan(p.grid.indexOf('upcoming'))
    expect([...p.band, ...p.grid].sort()).toEqual([...ALL].sort())
  })

  it('gives a v1 device the canonical band, which it never stored', () => {
    expect(reconcile(V1).band).toEqual(DEFAULT_CARD_PREFS.band)
  })

  it('leaves cards the v1 device did not hide at their default mode', () => {
    const p = reconcile(V1)
    expect(cardMode(p, 'upcoming')).toBe('auto')
    expect(cardMode(p, 'today')).toBe('always')
  })

  it('a v1 device that hid `today` keeps it hidden, overriding the `always` default', () => {
    expect(cardMode(reconcile({ order: [], hidden: ['today'] }), 'today')).toBe('never')
  })

  it('is idempotent — migrating an already-migrated value changes nothing', () => {
    const once = reconcile(V1)
    expect(reconcile(once)).toEqual(once)
  })

  it('does not mistake a v2 value for v1 (v2 has no `order`)', () => {
    const v2 = reconcile({ band: ['heroes'], grid: ['today'], size: {}, mode: { photos: 'never' } })
    expect(cardMode(v2, 'photos')).toBe('never')
    expect(v2.band[0]).toBe('heroes')
  })
})

describe('reconcile — validation', () => {
  it('ignores a bogus size or mode rather than persisting it', () => {
    const p = reconcile({
      size: { today: 7 as unknown as 1, upcoming: 2 },
      mode: { today: 'sometimes' as unknown as 'auto', upcoming: 'never' },
    })
    expect(cardSize(p, 'today')).toBe(1) // fell back to the card's default
    expect(cardSize(p, 'upcoming')).toBe(2)
    expect(cardMode(p, 'today')).toBe('always') // its default, not 'sometimes'
    expect(cardMode(p, 'upcoming')).toBe('never')
  })

  it('survives a non-array zone', () => {
    const p = reconcile({ band: 'nope' as unknown as BoardCardId[] })
    expect(p.band).toEqual(DEFAULT_CARD_PREFS.band)
  })
})

describe('defaults reproduce the board we already ship', () => {
  it('the three cards that never self-hid are `always`, the rest `auto`', () => {
    const p = fresh()
    const always = ALL.filter((id) => cardMode(p, id) === 'always')
    expect(always.sort()).toEqual(['drawings', 'moments', 'today'])
  })

  it('« À faire » is auto — it hides on a clear day, not on an empty list', () => {
    expect(cardMode(fresh(), 'todos')).toBe('auto')
  })

  it('the three former `column-span: all` cards, plus the band heroes, are full-width', () => {
    const p = fresh()
    const full = ALL.filter((id) => cardSize(p, id) === 'full')
    expect(full.sort()).toEqual(['autoCard', 'drawings', 'heroes', 'notes', 'photos'])
  })
})

describe('visibleCards', () => {
  it('mounts auto + always, and only drops never', () => {
    const p = reconcile({ mode: { today: 'never', upcoming: 'auto', fil: 'always' } })
    const grid = visibleCards(p, 'grid')
    expect(grid).not.toContain('today')
    expect(grid).toContain('upcoming')
    expect(grid).toContain('fil')
  })

  it('returns each zone in its own order', () => {
    const p = reconcile({ band: ['moments', 'notes'], grid: ['today'] })
    expect(visibleCards(p, 'band').slice(0, 2)).toEqual(['moments', 'notes'])
  })
})

describe('clampSize', () => {
  it('full spans every column', () => {
    expect(clampSize('full', 4)).toBe(4)
    expect(clampSize('full', 1)).toBe(1)
  })

  it('clamps a wide card down to the columns actually available (the phone case)', () => {
    expect(clampSize(3, 1)).toBe(1)
    expect(clampSize(2, 1)).toBe(1)
    expect(clampSize(3, 2)).toBe(2)
  })

  it('never returns less than one column, even for a nonsense count', () => {
    expect(clampSize(1, 0)).toBe(1)
    expect(clampSize('full', 0)).toBe(1)
  })

  it('leaves a card narrower than the grid alone', () => {
    expect(clampSize(2, 4)).toBe(2)
  })
})

describe('nextSize', () => {
  it('cycles 1 → 2 → 3 → full → 1 on a wide grid', () => {
    expect(nextSize(1)).toBe(2)
    expect(nextSize(2)).toBe(3)
    expect(nextSize(3)).toBe('full')
    expect(nextSize('full')).toBe(1)
    expect(nextSize(1, 4)).toBe(2)
  })

  it('toggles half ↔ full on a two-column phone', () => {
    // 2 / 3 / full all clamp to the same width there, so cycling through them would
    // leave the chip looking dead for two taps out of four.
    expect(nextSize('full', 2)).toBe(1)
    expect(nextSize(1, 2)).toBe('full')
    expect(nextSize(3, 2)).toBe(1)
    expect(nextSize(1, 1)).toBe('full')
  })
})

describe('cardSize fallback', () => {
  it('an un-sized card takes the fallback (a phone renders it full width)', () => {
    expect(cardSize(fresh(), 'today')).toBe(1) // canonical default
    expect(cardSize(fresh(), 'today', 'full')).toBe('full')
  })

  it('but an EXPLICIT choice always wins over the fallback', () => {
    const p = reconcile({ size: { today: 1 } })
    expect(cardSize(p, 'today', 'full')).toBe(1)
  })

  it('the fallback never overrides a card already full by default', () => {
    expect(cardSize(fresh(), 'autoCard', 'full')).toBe('full')
  })
})

describe('moveCard', () => {
  // moveCard is pure and takes prefs as given — build them by hand so these assertions
  // test the move, not reconcile's canonical splicing.
  const literal = (grid: BoardCardId[], band: BoardCardId[] = []): BoardCardPrefs => ({
    band,
    grid,
    size: {},
    mode: {},
  })

  it('drags a card UP, landing before the card it was dropped on', () => {
    const next = moveCard(literal(['today', 'upcoming', 'photos']), 'photos', 'grid', 'today')
    expect(next.grid).toEqual(['photos', 'today', 'upcoming'])
  })

  it('drags a card DOWN, landing before the card it was dropped on', () => {
    // The bug this contract kills: with an INDEX, removing the dragged card first shifts
    // every later index left by one, so a downward drop overshot by a slot — dropping
    // « Aujourd'hui » on « Photo du jour » sent it past, to the end.
    const next = moveCard(literal(['today', 'upcoming', 'photos']), 'today', 'grid', 'photos')
    expect(next.grid).toEqual(['upcoming', 'today', 'photos'])
    expect(next.grid.filter((x) => x === 'today')).toHaveLength(1)
  })

  it('is symmetric: up then down returns the original order', () => {
    const start = literal(['today', 'upcoming', 'photos'])
    const up = moveCard(start, 'photos', 'grid', 'upcoming')
    expect(up.grid).toEqual(['today', 'photos', 'upcoming'])
    const back = moveCard(up, 'photos', 'grid', 'end')
    expect(back.grid).toEqual(start.grid)
  })

  it('a hidden card between source and target cannot skew the drop', () => {
    // `visibleCards` drops `never` cards, so a rendered index would disagree with the
    // stored array. Naming the target card makes that impossible.
    const p: BoardCardPrefs = { ...literal(['today', 'upcoming', 'photos']), mode: { upcoming: 'never' } }
    expect(moveCard(p, 'today', 'grid', 'photos').grid).toEqual(['upcoming', 'today', 'photos'])
  })

  it('moves a card across zones — the band/grid split is now just placement', () => {
    const p = fresh()
    expect(cardZone(p, 'moments')).toBe('band')
    const next = moveCard(p, 'moments', 'grid', p.grid[0]!)
    expect(cardZone(next, 'moments')).toBe('grid')
    expect(next.band).not.toContain('moments')
    expect(next.grid[0]).toBe('moments')
  })

  it('drags a grid card up into the band', () => {
    const p = fresh()
    const next = moveCard(p, 'todos', 'band', 'heroes')
    expect(next.band[next.band.indexOf('heroes') - 1]).toBe('todos')
    expect(next.grid).not.toContain('todos')
  })

  it('appends on `end` — the only way back into a group you emptied', () => {
    const next = moveCard(fresh(), 'photos', 'band', 'end')
    expect(next.band.at(-1)).toBe('photos')
    expect(next.grid).not.toContain('photos')
  })

  it('appends when the target card is not in that zone', () => {
    const next = moveCard(literal(['today', 'photos']), 'today', 'grid', 'carnets')
    expect(next.grid).toEqual(['photos', 'today'])
  })

  it('never duplicates or loses a card', () => {
    const next = moveCard(fresh(), 'heroes', 'grid', 'today')
    expect([...next.band, ...next.grid].sort()).toEqual([...ALL].sort())
  })

  it('ignores an unknown id, and a card dropped on itself', () => {
    const p = fresh()
    expect(moveCard(p, 'nope' as BoardCardId, 'band', 'notes')).toBe(p)
    expect(moveCard(p, 'notes', 'band', 'notes')).toBe(p)
  })
})
