import { useT } from '../i18n'

// The waiting state for a surface whose SHAPE is already known — a list of rows, a
// grid of cards. Instead of one centred « Chargement… » line that pops into a full
// page, reserve the space the content is about to take, so the first paint is
// already the right size and nothing jumps under a thumb already reaching for it.
//
// Generalized from the board's own ghost tiles (`.board-skeleton`, 5c64b3e), which
// proved the idea on the one surface that most needed it and then stayed there.
//
// CALM, and that is a real constraint here: **no shimmer, no pulse, no animation of
// any kind.** A shimmering placeholder is an attention-grabber, and this app's whole
// stance is that a screen may not ask for attention it hasn't earned (NFR-CALM). A
// quiet block at 55% opacity says "something is coming" without performing.
//
// WHEN NOT TO USE IT. A skeleton is a promise about shape. If the surface has no
// predictable shape — a form scene, cook mode, a single record — that promise is a
// lie and the honest thing is the `<Loading/>` line, which is why both still exist.
// The rule: does the reader already know roughly what will appear here? Rows → yes.
// A recipe you have never opened → no.
//
// ACCESSIBILITY. The blocks are decorative and `aria-hidden`; the real message for a
// screen reader is one polite live line, so AT hears "Chargement…" once instead of
// counting eight empty divs.
export function Skeleton({
  count = 3,
  variant = 'row',
  className,
}: {
  /** How many placeholders. Match the surface's typical first screen, not its max. */
  count?: number
  /** `row` = a stacked list; `card` = a responsive grid of tiles. */
  variant?: 'row' | 'card'
  className?: string
}) {
  const t = useT()
  return (
    <>
      <p className="sr-only" role="status">
        {t.common.loading}
      </p>
      <div
        className={`skeleton skeleton--${variant}` + (className ? ` ${className}` : '')}
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="skeleton__block" />
        ))}
      </div>
    </>
  )
}
