import { Avatar } from './Avatar'
import type { Face } from '../lib/eventPeople'

// A compact overlapping row of household faces — an event's « Qui » (the people a
// rendez-vous concerns) or a ride's passengers. Draws each face with the shared
// <Avatar> so the photo/initial-disc fallback + colour live in one place; the overlap
// is pure CSS (.avatar-stack). Renders NOTHING when empty (like a bare <Avatar> with
// no one). Calm: faces only, never a "+N" count — passengers cap at 12 server-side and
// a household is small, so the row stays short. Live in /dev/kit ▸ Personnes.
export function AvatarStack({
  faces,
  size = 22,
  className,
  ariaLabel,
}: {
  faces: Face[]
  size?: number
  className?: string
  // Announce the group as one image; defaults to the comma-joined names.
  ariaLabel?: string
}) {
  if (!faces.length) return null
  const label = ariaLabel ?? faces.map((f) => f.name).filter(Boolean).join(', ')
  return (
    <span className={'avatar-stack' + (className ? ' ' + className : '')} role="img" aria-label={label || undefined}>
      {faces.map((f, i) => (
        <Avatar key={i} kind={f.kind} photo={f.photo} colour={f.colour ?? '#888'} name={f.name} size={size} />
      ))}
    </span>
  )
}
