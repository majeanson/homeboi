import { imgUrl } from '../lib/image'
import { initialsFor } from '../lib/initials'

// One place that knows how to draw a person: their photo if they have one, else
// a coloured disc with their initial(s). Used wherever a member's face appears so
// the colour/photo fallback logic lives once. Two people who share a first name
// read apart via first+last initials ("Francis Cardin" → "FC"); the disc colour
// is the final tiebreaker when even the initials collide.
export function Avatar({
  kind,
  photo,
  colour,
  name,
  size = 44,
}: {
  kind?: string | null
  photo?: string | null // R2 key, when kind === 'photo'
  colour?: string | null
  name?: string | null
  size?: number
}) {
  const dims = { width: size, height: size }
  if (kind === 'photo' && photo) {
    return <img className="avatar avatar--photo" src={imgUrl(photo)} alt={name ?? ''} style={dims} />
  }
  const initials = initialsFor(name)
  // Two letters need a smaller glyph so "FC" doesn't crowd the disc's edges.
  const fontScale = initials.length > 1 ? 0.34 : 0.42
  return (
    <span className="avatar avatar--disc" style={{ ...dims, background: colour ?? 'var(--ink-faint)' }}>
      <span className="avatar__initial" style={{ fontSize: Math.round(size * fontScale) }}>
        {initials}
      </span>
    </span>
  )
}
