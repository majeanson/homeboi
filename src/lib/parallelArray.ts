// Keep a SIDE array (per-item media keys) rigorously in lockstep with the SOURCE
// array it annotates, across every mutation a list editor performs. A drifted
// index silently mis-attaches media — a parent's voice clip would play on the
// wrong routine card, a photo would land on the wrong recipe step — so the sync
// rules live here, pure and unit-tested, and both editors call the same ops.
//
// The side array is positional: side[i] belongs to source[i]. We hold '' (never
// undefined/null) for "no media at this slot", so the array is always the same
// length as its source and a heading row simply carries an empty slot.
//
// Used by: routine card deck (cards ↔ cardsNarration) and the recipe steps editor
// (steps ↔ stepImages). See feature #17 (A + B).

const EMPTY = ''

// Pad/trim a side array to exactly `len`, defaulting any missing slot to ''. The
// single normalizer every other op funnels through, so a desynced input (an
// older payload, a hand-built array) is realigned before we touch it.
export function alignSide(side: readonly string[] | undefined, len: number): string[] {
  const out: string[] = []
  for (let i = 0; i < len; i++) out.push(typeof side?.[i] === 'string' ? side![i] : EMPTY)
  return out
}

// Source gained a row at `at` (default: appended at the end) → the side array
// gains an empty slot at the SAME index, so everything after it stays aligned.
export function sideInsert(side: readonly string[], at?: number): string[] {
  const i = at === undefined ? side.length : clamp(at, 0, side.length)
  const out = side.slice()
  out.splice(i, 0, EMPTY)
  return out
}

// Source dropped the row at `at` → the side array drops the SAME slot.
export function sideRemove(side: readonly string[], at: number): string[] {
  if (at < 0 || at >= side.length) return side.slice()
  const out = side.slice()
  out.splice(at, 1)
  return out
}

// Source moved a row from → to (splice-move, matching the deck's pointer DnD) →
// the side slot rides along so it stays attached to its row.
export function sideMove(side: readonly string[], from: number, to: number): string[] {
  if (from < 0 || from >= side.length || to < 0 || to >= side.length || from === to) return side.slice()
  const out = side.slice()
  const [m] = out.splice(from, 1)
  out.splice(to, 0, m)
  return out
}

// Source swapped two neighbours (the recipe ↑/↓ buttons swap, they don't splice)
// → swap the matching side slots. Distinct from sideMove: a swap and a splice-move
// only agree for adjacent indices, and the editors differ, so each gets its own.
export function sideSwap(side: readonly string[], i: number, j: number): string[] {
  if (i < 0 || i >= side.length || j < 0 || j >= side.length || i === j) return side.slice()
  const out = side.slice()
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

// Source was REPLACED wholesale at `at` — `removeCount` rows out, `insertCount`
// rows in (a multi-line paste spread). The replaced span carries no media; the
// new rows start empty, and the tail keeps its slots, so everything after the
// span stays aligned.
export function sideSplice(side: readonly string[], at: number, removeCount: number, insertCount: number): string[] {
  const out = side.slice()
  const fill = new Array(Math.max(0, insertCount)).fill(EMPTY) as string[]
  out.splice(at, Math.max(0, removeCount), ...fill)
  return out
}

// Set (or clear, with '') the media key at one slot, leaving the rest untouched.
export function sideSet(side: readonly string[], at: number, key: string): string[] {
  return side.map((v, i) => (i === at ? key : v))
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n
}
