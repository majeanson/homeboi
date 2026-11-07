// « Chacun son tour » — THE rotation, in one place. It used to be spelled by hand in
// board.ts, chores.ts and month.ts, each with its own malformed-JSON answer. The whole model
// is an ordered list of member ids and an index into it: no points, no ledger of who did
// more, whose turn and nothing else (NFR-CALM-1).

export function parseRotation(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return [] // malformed rotation → nobody's turn, an ordinary shared task
  }
}

// What a write stores: the ids, in the order they were tapped, and nothing that is not one.
export const rotationJson = (v: unknown): string => JSON.stringify(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

// Whose turn at `idx`. Modulo on read, so a rotation shortened by an edit can never index out
// of range and needs no reset. Safe for the negative offset a past calendar cell projects.
export function turnOf(rotation: readonly string[], idx: number): string | null {
  if (rotation.length === 0) return null
  return rotation[((idx % rotation.length) + rotation.length) % rotation.length] ?? null
}

export const nextTurnIdx = (rotation: readonly string[], idx: number): number => (rotation.length ? (idx + 1) % rotation.length : 0)

// A tick taken back gives the turn back. Same modulo as the two above, so an edited rotation
// cannot land out of range.
export const prevTurnIdx = (rotation: readonly string[], idx: number): number => (rotation.length ? (idx - 1 + rotation.length) % rotation.length : 0)
