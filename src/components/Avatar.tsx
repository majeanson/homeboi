import { imgUrl } from '../lib/image'
import { initialsFor } from '../lib/initials'
import { readableInk } from '../lib/colors'
import { Img } from './Img'

// One place that knows how to draw a person: their photo if they have one, else
// a coloured disc with their initial(s). Used wherever a member's face appears so
// the colour/photo fallback logic lives once. Two people who share a first name
// read apart via first+last initials ("Francis Cardin" → "FC"); the disc colour
// is the final tiebreaker when even the initials collide.
//
// Eight surfaces used to draw their own disc beside this one (the member switcher, the
// face sheet, the recipe hearts, the kiosk's profile chip, L'auto's holder faces, the
// kid routines…) because they held a ready URL where this took an R2 key, or needed the
// host's own class for size and placement. Both are props now (solidify 2.2,
// 2026-11-05): `photoUrl` for a URL already built, `className` for the host's
// position/size class, `decorative` when the name is written right beside the face
// (alt="" + aria-hidden, so a screen reader does not say it twice), `shape` for the
// rare square. `avatar-rule.test.ts` refuses a new hand-rolled initial; `.avatar*` is owned
// (kit-class-rule.test.ts).
export function Avatar({
  kind,
  photo,
  photoUrl,
  colour,
  name,
  size = 44,
  shape = 'disc',
  className,
  decorative = false,
}: {
  kind?: string | null | undefined
  photo?: string | null | undefined // R2 key, when kind === 'photo'
  /** A photo URL already built (an `imgUrl` or an object URL) — wins over kind/photo. */
  photoUrl?: string | null | undefined
  colour?: string | null | undefined
  name?: string | null | undefined
  size?: number
  shape?: 'disc' | 'square'
  /** The host's own class (size, overlap, border) — the avatar classes stay. */
  className?: string
  /** The name is written beside the face: alt="" and hidden from the a11y tree. */
  decorative?: boolean
}) {
  const dims = { width: size, height: size }
  const extra = (shape === 'square' ? ' avatar--square' : '') + (className ? ' ' + className : '')
  const src = photoUrl ?? (kind === 'photo' && photo ? imgUrl(photo) : null)
  if (src) {
    return <Img className={'avatar avatar--photo' + extra} src={src} alt={decorative ? '' : (name ?? '')} aria-hidden={decorative || undefined} style={dims} />
  }
  const initials = initialsFor(name)
  // Two letters need a smaller glyph so "FC" doesn't crowd the disc's edges.
  const fontScale = initials.length > 1 ? 0.34 : 0.42
  return (
    // The initial takes whichever ink contrasts MORE with this member's colour — the
    // CSS default is a flat white, which on a mid-tone (sky, sage, marigold) measured
    // 3.46:1. This is the face primitive: every row, every card, every peek.
    <span className={'avatar avatar--disc' + extra} style={{ ...dims, background: colour ?? 'var(--ink-faint)' }} aria-hidden={decorative || undefined}>
      <span
        className="avatar__initial"
        style={{ fontSize: Math.round(size * fontScale), color: colour ? readableInk(colour) : undefined }}
      >
        {initials}
      </span>
    </span>
  )
}
