import { Fragment, useMemo } from 'react'
import { useLang, useT } from '../i18n'
import { useSpeak } from '../lib/speak'
import { readableInk } from '../lib/colors'
import { findMeasures, spokenMeasure } from '../lib/measure'
import { measureColor } from '../lib/measureColors'

// Render one ingredient line with its measuring-tool amounts turned into tappable,
// colour-coded pills. The pill is tinted to match the real spoon/cup (see
// measureColors.ts) and, on tap, reads the amount aloud on-device ("un quart de
// cuillère à thé") — so a pre-reader in Cook mode can hear it and grab the
// right-coloured tool, and a parent gets the same as a small inline pill.
//
// `size` scales the pill: 'lg' for the kid-facing Cook mode, 'sm' for the parent
// recipe sheet. `kid` drops the 🔊 glyph (Cook mode narrates the whole step, so a
// speaker on every pill is noise there) while keeping the colour + tap-to-hear.
// A line with no scoopable measurement just renders its text — the feature is
// additive, never a rewrite (the calm/degrade tenet).
export function IngredientLine({
  line,
  size = 'sm',
  kid = false,
}: {
  line: string
  size?: 'sm' | 'lg'
  kid?: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  const measures = useMemo(() => findMeasures(line), [line])

  if (measures.length === 0) return <>{line}</>

  // Stitch the line back together: the text between matches, with each match
  // replaced by its pill. `cursor` walks the original string so untouched text
  // (the ingredient name, "de", parentheses) is preserved byte-for-byte.
  const parts: React.ReactNode[] = []
  let cursor = 0
  measures.forEach((m, i) => {
    if (m.start > cursor) parts.push(<Fragment key={`t${i}`}>{line.slice(cursor, m.start)}</Fragment>)
    const color = measureColor(m)
    parts.push(
      <button
        key={`p${i}`}
        type="button"
        className={`meas-pill meas-pill--${size}${color ? '' : ' meas-pill--plain'}${kid ? ' meas-pill--noicon' : ''}`}
        style={color ? { background: color, color: readableInk(color), borderColor: color } : undefined}
        onClick={() => speak(spokenMeasure(m, lang))}
        aria-label={t.recipes.hearMeasure(m.text)}
      >
        {m.text}
      </button>,
    )
    cursor = m.end
  })
  if (cursor < line.length) parts.push(<Fragment key="tend">{line.slice(cursor)}</Fragment>)

  return <>{parts}</>
}
