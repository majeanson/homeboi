// One place that turns a display name into the 1–2 letters shown on a photo-less
// avatar disc. A multi-word name yields first+last initials ("Francis Cardin" →
// "FC", "Marie-Christine" → "MC") so two people who share a first name still read
// apart; a lone first name stays a single letter ("Francis" → "F") — the disc's
// colour is the tiebreaker when even the initials collide (two "Francis C.").
// Shared so the same rule holds wherever a face appears (Avatar, KidView, …).
export function initialsFor(name?: string | null): string {
  const parts = (name ?? '').split(/[\s-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]![0]!.toUpperCase()
  const first = parts[0]![0]!
  const last = parts[parts.length - 1]![0]!
  return (first + last).toUpperCase()
}
