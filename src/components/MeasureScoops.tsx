import { useLang, useT } from '../i18n'
import { useSpeak } from '../lib/speak'
import { type Measure, spokenMeasure } from '../lib/measure'
import { measureColor } from '../lib/measureColors'
import { useMeasureColors } from '../lib/measurePrefs'

// "Scoops" — a measure drawn as physical fills of its colour-coded tool: one
// solid circle per WHOLE scoop, plus a part-filled circle for a fraction. So "2
// c. à soupe" is two green circles ("fill this spoon twice"), "1½ tasse" is one
// full + one half circle. A pre-reader can count + colour-match without reading a
// number, and a parent gets an at-a-glance amount. Tinted to the household's own
// spoons (lib/measurePrefs); tap to hear the amount on-device.
//
// Additive, like the pills: a line with no scoopable measure renders nothing here.
// Past a sane count we stop drawing dots and show "×N" so a "12 tasses" can't
// carpet the screen.
const CIRCLE_MAX = 12

export function MeasureScoops({ measure, size = 'sm' }: { measure: Measure; size?: 'sm' | 'lg' }) {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  const ov = useMeasureColors()
  const color = measureColor(measure, ov) ?? 'var(--ink-soft)'

  const whole = Math.floor(measure.value + 1e-9)
  const frac = measure.value - whole
  const hasPart = frac > 0.05
  const pct = Math.round(frac * 100)
  const overflow = whole > CIRCLE_MAX

  const dot = (key: string, part?: boolean) => (
    <span
      key={key}
      className={'scoop' + (part ? ' scoop--part' : '')}
      style={
        part
          ? ({ '--c': color, '--fill': `${pct}%` } as React.CSSProperties)
          : { background: color }
      }
      aria-hidden="true"
    />
  )

  const circles: React.ReactNode[] = []
  if (overflow) {
    circles.push(dot('one'))
    circles.push(
      <span key="x" className="scoop__count mono" style={{ color }}>
        ×{whole}
      </span>,
    )
  } else {
    for (let i = 0; i < whole; i++) circles.push(dot(`w${i}`))
    if (hasPart) circles.push(dot('part', true))
    // A bare fraction (e.g. ½ tsp) still needs at least one drawn circle.
    if (circles.length === 0) circles.push(dot('part', true))
  }

  return (
    <button
      type="button"
      className={`scoops scoops--${size}`}
      onClick={(e) => {
        // The scoops are their own tap target — don't also fire a tappable parent
        // row; speak just this amount, like the pill does.
        e.stopPropagation()
        speak(spokenMeasure(measure, lang))
      }}
      aria-label={t.recipes.hearMeasure(measure.text)}
      title={measure.text}
    >
      {circles}
    </button>
  )
}
