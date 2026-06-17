import { describe, expect, it } from 'vitest'
import {
  alignSide,
  sideInsert,
  sideRemove,
  sideMove,
  sideSwap,
  sideSplice,
  sideSet,
} from './parallelArray'

// The whole point of these helpers is that a side array (media keys) NEVER drifts
// out of position relative to its source. Each test models a source mutation and
// asserts the side array stayed the same length and kept every key on its row.

describe('parallelArray sync', () => {
  it('alignSide pads short / trims long / fills holes', () => {
    expect(alignSide(['a'], 3)).toEqual(['a', '', ''])
    expect(alignSide(['a', 'b', 'c'], 2)).toEqual(['a', 'b'])
    expect(alignSide(undefined, 2)).toEqual(['', ''])
    // A non-string slot reads as empty (older payload / hand-built junk).
    expect(alignSide([undefined as unknown as string, 'b'], 2)).toEqual(['', 'b'])
  })

  it('sideInsert appends an empty slot by default and at an index', () => {
    expect(sideInsert(['a', 'b'])).toEqual(['a', 'b', ''])
    expect(sideInsert(['a', 'b'], 0)).toEqual(['', 'a', 'b'])
    expect(sideInsert(['a', 'b'], 1)).toEqual(['a', '', 'b'])
  })

  it('sideRemove drops exactly the matching slot', () => {
    expect(sideRemove(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
    expect(sideRemove(['a'], 0)).toEqual([])
    // Out of range → unchanged copy.
    expect(sideRemove(['a', 'b'], 5)).toEqual(['a', 'b'])
  })

  it('sideMove keeps a key attached to its moved row', () => {
    // Move row 0 → 2: 'clipA' rides to the new index 2.
    expect(sideMove(['clipA', '', 'clipC'], 0, 2)).toEqual(['', 'clipC', 'clipA'])
    // Move row 2 → 0.
    expect(sideMove(['clipA', '', 'clipC'], 2, 0)).toEqual(['clipC', 'clipA', ''])
    expect(sideMove(['a', 'b'], 0, 0)).toEqual(['a', 'b'])
    expect(sideMove(['a', 'b'], 0, 9)).toEqual(['a', 'b'])
  })

  it('sideSwap swaps two neighbours (the ↑/↓ path)', () => {
    expect(sideSwap(['imgA', '', 'imgC'], 0, 1)).toEqual(['', 'imgA', 'imgC'])
    expect(sideSwap(['imgA', '', 'imgC'], 1, 2)).toEqual(['imgA', 'imgC', ''])
    expect(sideSwap(['a', 'b'], 0, 0)).toEqual(['a', 'b'])
  })

  it('sideSplice models a multi-line paste spread, staying aligned', () => {
    // Row 1 (blank, consumed) becomes 3 pasted rows: remove 1, insert 3.
    expect(sideSplice(['a', '', 'd'], 1, 1, 3)).toEqual(['a', '', '', '', 'd'])
    // Insert after a kept row: remove 0, insert 2.
    expect(sideSplice(['a', 'd'], 1, 0, 2)).toEqual(['a', '', '', 'd'])
  })

  it('sideSet writes one slot and leaves the rest', () => {
    expect(sideSet(['', '', ''], 1, 'k')).toEqual(['', 'k', ''])
    expect(sideSet(['a', 'b'], 0, '')).toEqual(['', 'b'])
  })

  it('a full edit session never drifts (insert → set → move → remove)', () => {
    // Start: 3 source rows, side all empty.
    let side = alignSide([], 3) // ['', '', '']
    side = sideSet(side, 1, 'clip1') // attach a clip to row 1
    expect(side).toEqual(['', 'clip1', ''])
    side = sideInsert(side, 0) // add a row at the top
    expect(side).toEqual(['', '', 'clip1', '']) // clip1 followed its row
    side = sideMove(side, 2, 0) // drag clip1's row to the top
    expect(side).toEqual(['clip1', '', '', ''])
    side = sideRemove(side, 0) // delete that row
    expect(side).toEqual(['', '', '']) // clip1 gone with its row, length tracks source
  })
})
