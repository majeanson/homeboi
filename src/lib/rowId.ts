// THE id of a row this device creates and paints before the server answers (review #39): the
// list, todos and tasks. The create sends it (`{ id }`), the server keeps it (functions/_lib/ids
// `rowIdFrom`, which takes a UUID and nothing else), so the optimistic row is the real row from
// the first frame. A tick, a delete or a « Vider » made before the create lands already names
// the right row, online or queued behind it in the outbox.
//
// It replaces the `tmp-…` stand-in ids and everything that existed to translate them: the
// session registry (lib/tmpIds), the outbox's id rewriting, and the server's « healing »
// deletes that guessed a same-named row when a stand-in id missed.
export function newRowId(): string {
  // randomUUID needs a secure context (https or localhost — the app always is); the fallback
  // spells the same v4 shape from getRandomValues, so the server's check holds either way.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
