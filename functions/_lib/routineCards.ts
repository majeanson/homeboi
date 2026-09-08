import { parseJsonArray } from './json'
import { isValidR2Key } from './validate'

// A kid routine's deck, with its media ON each card (PARITY Wave D, 2026-09-08).
//
// Until now a card's parent-voice clip and photo lived in two SIDE columns kept
// positional to cards_json — `cards_narration_json[i]` (migration 0040) and
// `cards_photo_json[i]` (0042) — the one genuine parallel-array anti-pattern the
// schema still had: insert or reorder a card and every side array had to be
// re-indexed in lockstep, or a parent's voice played on the wrong step. Cards are
// JSON objects, so the keys simply belong ON the card: `clipKey` / `photoKey`
// ('' or absent = none). No DDL: cards_json already holds the shape.
//
// The two side columns are filename-locked (forward-only migrations) and stay.
// They are read ONLY as a fallback for a deck saved before this change — a card
// that carries no `clipKey`/`photoKey` field at all takes the side column's
// value at its index — and every write blanks them ('[]'), so a key a parent
// deliberately cleared can never be resurrected from the old column. Once a deck
// has been written once, the columns are inert.
export interface RoutineCard {
  icon: string
  label: string
  narration?: string
  seconds?: number
  tip?: string
  /** R2 key of the parent-voice clip (`rn_…`); '' or absent = on-device TTS. */
  clipKey?: string
  /** R2 key of the card photo (`rcp_…`); '' or absent = the card's emoji. */
  photoKey?: string
}

const keyOrEmpty = (v: unknown): string => (isValidR2Key(v) ? (v as string) : '')

/** The deck with its media folded onto each card (side columns as fallback). */
export function foldCardMedia(cardsJson: string | null | undefined, narrationJson: string | null | undefined, photoJson: string | null | undefined): RoutineCard[] {
  const cards = parseJsonArray<RoutineCard>(cardsJson)
  const clips = parseJsonArray<unknown>(narrationJson ?? '[]')
  const photos = parseJsonArray<unknown>(photoJson ?? '[]')
  return cards.map((c, i) => {
    const card = { ...(c ?? ({} as RoutineCard)) }
    const clip = 'clipKey' in card ? keyOrEmpty(card.clipKey) : keyOrEmpty(clips[i])
    const photo = 'photoKey' in card ? keyOrEmpty(card.photoKey) : keyOrEmpty(photos[i])
    if (clip) card.clipKey = clip
    else delete card.clipKey
    if (photo) card.photoKey = photo
    else delete card.photoKey
    return card
  })
}

/** Every R2 key a deck references — what a delete or a sweep must free. */
export function cardMediaKeys(cards: readonly RoutineCard[]): string[] {
  const out: string[] = []
  for (const c of cards) {
    if (c.clipKey) out.push(c.clipKey)
    if (c.photoKey) out.push(c.photoKey)
  }
  return out
}
