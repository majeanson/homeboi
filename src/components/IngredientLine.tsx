import { Fragment, useMemo } from 'react'
import { useLang, useT } from '../i18n'
import { useSpeak } from '../lib/speak'
import { readableInk } from '../lib/colors'
import { findMeasures, spokenMeasure } from '../lib/measure'
import { measureColor } from '../lib/measureColors'
import { useMeasureColors } from '../lib/measurePrefs'
import { MeasureScoops } from './MeasureScoops'

// Render one ingredient line with its measuring-tool amounts turned into tappable,
// colour-coded pills. The pill is tinted to match the real spoon/cup (see
// measureColors.ts) and, on tap, reads the amount aloud on-device ("un quart de
// cuillère à thé") — so a pre-reader in Cook mode can hear it and grab the
// right-coloured tool, and a parent gets the same as a small inline pill.
//
// `size` scales the pill: 'lg' for the kid-facing Cook mode, 'sm' for the parent
// recipe sheet. `kid` drops the 🔊 glyph (Cook mode narrates the whole step, so a
// speaker on every pill is noise there) while keeping the colour + tap-to-hear.
// `scoops` additionally draws the amount as colour-coded fill circles after the
// pill (one per whole scoop) — used in Cook mode (toddler + the split/focus views)
// where "fill this spoon twice" reads faster than a number.
// A line with no scoopable measurement just renders its text — the feature is
// additive, never a rewrite (the calm/degrade tenet).
export function IngredientLine({
  line,
  size = 'sm',
  kid = false,
  scoops = false,
}: {
  line: string
  size?: 'sm' | 'lg'
  kid?: boolean
  scoops?: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  const ov = useMeasureColors()
  // An OPTIONAL ingredient — « (facultatif) », « (optionnel) », « (optional) » on the
  // page — keeps its words but wears them as a tag at the end of the line, so the eye
  // tells it from the must-haves at a glance (Marc, 2026-10-30: « clearly indicate
  // them somehow »). The page's own word, never a new one.
  const opt = line.match(OPTIONAL)
  const text = opt ? line.slice(0, opt.index).trimEnd() : line
  const tag = opt ? <span className="ing-opt mono">{opt[1].toLowerCase()}</span> : null
  const measures = useMemo(() => findMeasures(text), [text])

  if (measures.length === 0)
    return (
      <>
        {text}
        {tag}
      </>
    )

  // Stitch the line back together: the text between matches, with each match
  // replaced by its pill. `cursor` walks the original string so untouched text
  // (the ingredient name, "de", parentheses) is preserved byte-for-byte.
  const parts: React.ReactNode[] = []
  let cursor = 0
  measures.forEach((m, i) => {
    if (m.start > cursor) parts.push(<Fragment key={`t${i}`}>{line.slice(cursor, m.start)}</Fragment>)
    const color = measureColor(m, ov)
    parts.push(
      <button
        key={`p${i}`}
        type="button"
        className={`meas-pill meas-pill--${size}${color ? '' : ' meas-pill--plain'}${kid ? ' meas-pill--noicon' : ''}`}
        style={color ? { background: color, color: readableInk(color), borderColor: color } : undefined}
        onClick={(e) => {
          // Don't let a pill tap also fire a tappable parent row (the Cook-mode
          // gather list reads the whole line) — the pill reads just its amount.
          e.stopPropagation()
          speak(spokenMeasure(m, lang))
        }}
        aria-label={t.recipes.hearMeasure(m.text)}
      >
        {m.text}
      </button>,
    )
    // The colour-coded fill circles ("scoop this twice"), right after its pill.
    if (scoops) parts.push(<MeasureScoops key={`s${i}`} measure={m} size={size} />)
    cursor = m.end
  })
  if (cursor < text.length) parts.push(<Fragment key="tend">{text.slice(cursor)}</Fragment>)

  return (
    <>
      {parts}
      {tag}
    </>
  )
}

// « 30 ml de graines de sésame (facultatif) » — the parenthesis at the END of the line.
const OPTIONAL = /\s*\(\s*(facultati(?:f|ve)s?|optionnel(?:le)?s?|optional)\s*\)\s*$/i
