import { imgUrl } from '../lib/image'

// One place that knows how to draw a person: their photo if they have one, else
// a coloured disc with their initial. Used wherever a member's face appears so
// the colour/photo fallback logic lives once.
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
  return (
    <span className="avatar avatar--disc" style={{ ...dims, background: colour ?? 'var(--ink-faint)' }}>
      <span className="avatar__initial" style={{ fontSize: Math.round(size * 0.42) }}>
        {(name ?? '?').slice(0, 1).toUpperCase()}
      </span>
    </span>
  )
}
