import type { FR } from '../i18n'

// « Depuis ce matin » (A-3, bmad/10) — the pull-only "what changed today" peek off
// the board greeting. Pure row -> {face, text, at} composer: the wire shape from
// GET /api/today-changes in, one flat sorted+capped entry list out. Kept pure and
// unit-tested here (sinceMorning.test.ts) rather than folded into the sheet
// component, same split as boardModel — this decides WHAT the sentence says and
// WHICH rows survive the cap; the sheet only renders it.
//
// ⚠ calm edge (decided, bmad/10): this is a COLD peek, never a feed. No count, no
// badge, no persistent state — see TodayChangesSheet.tsx (gcTime:0, fetch-on-open).

export type SinceMorningKind = 'list_item' | 'meal' | 'note' | 'day_note' | 'drawing' | 'event'

// The wire shape of one row from /api/today-changes.
export interface ChangeRow {
  id: string
  kind: SinceMorningKind
  at: number // unix seconds
  text: string
  memberId: string | null
  name: string | null
  avatarKind: string | null
  avatarRef: string | null
  colour: string | null
  // Postbox sender name (« Papi ») — notes only. Takes precedence over `name`
  // when set, even if the sender's name happened to match (and tint) a member.
  authorLabel: string | null
}

export interface SinceMorningFace {
  name: string
  kind: string | null
  photo: string | null
  colour: string | null
}

export interface SinceMorningEntry {
  key: string
  at: number // unix seconds
  // null ONLY for a face-less event line (decided, A-3) — the row renders with
  // no avatar at all, just the fact.
  face: SinceMorningFace | null
  text: string
}

const DEFAULT_CAP = 20
// A left-in-a-note quote is a glance, not the full memo — keep it short.
const NOTE_EXCERPT_LEN = 40

function excerpt(text: string, len = NOTE_EXCERPT_LEN): string {
  const trimmed = text.trim()
  return trimmed.length > len ? `${trimmed.slice(0, len).trimEnd()}…` : trimmed
}

// The display name: postbox author_label wins (a relative's typed name), then the
// attributed member, then the calm "Quelqu'un" fallback — Maisonnée (no picked
// face) resolves the same way as no member at all.
function faceFor(row: ChangeRow, t: typeof FR): SinceMorningFace {
  const name = row.authorLabel || row.name || t.sinceMorning.someone
  return { name, kind: row.avatarKind, photo: row.avatarRef, colour: row.colour }
}

function sentenceFor(row: ChangeRow, t: typeof FR): string {
  const s = t.sinceMorning
  switch (row.kind) {
    case 'list_item':
      return s.addedItem(row.authorLabel || row.name || s.someone, row.text)
    case 'meal':
      return s.suggestedMeal(row.authorLabel || row.name || s.someone, row.text)
    case 'note': {
      const name = row.authorLabel || row.name || s.someone
      return row.text ? s.leftNoteWithText(name, excerpt(row.text)) : s.leftNote(name)
    }
    case 'day_note':
      return s.dayNote(row.authorLabel || row.name || s.someone)
    case 'drawing':
      return s.drawing(row.authorLabel || row.name || s.someone)
    case 'event':
      return s.newEvent(row.text)
  }
}

// Compose the raw wire rows into display entries: newest first, capped. Pure —
// no Date.now(), no locale formatting (the sheet formats `at` for display).
export function composeSinceMorning(rows: ChangeRow[], t: typeof FR, cap = DEFAULT_CAP): SinceMorningEntry[] {
  return [...rows]
    .sort((a, b) => b.at - a.at)
    .slice(0, cap)
    .map((row) => ({
      key: `${row.kind}-${row.id}`,
      at: row.at,
      // Events are face-less on purpose — the line is the fact, never a name.
      face: row.kind === 'event' ? null : faceFor(row, t),
      text: sentenceFor(row, t),
    }))
}
