import { useLang, useT } from '../i18n'
import { useSpeak } from '../lib/speak'
import { type Measure, spokenMeasure } from '../lib/measure'
import { measureColor, measureScoops } from '../lib/measureColors'
import { useMeasureColors } from '../lib/measurePrefs'

// "Scoops" — a measure drawn as physical fills of its colour-coded tools: one
// circle per scoop, EACH tinted to the very tool you'd grab. So "2 c. à soupe" is
// two green 1-tbsp circles ("fill this spoon twice"), "1½ tasse" is one teal 1-cup
// + one steel-blue ½-cup circle. A pre-reader can count + colour-match without
// reading a number, and a parent gets an at-a-glance amount. Colours come from the
// household's own spoons/cups (lib/measurePrefs); the decomposition lives in
// measureScoops(); tap to hear the amount on-device.
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

  const whole = Math.floor(measure.value + 1e-9)
  const overflow = whole > CIRCLE_MAX

  const dot = (key: string, color: string, fill: number) =>
    fill >= 1 ? (
      <span key={key} className="scoop" style={{ background: color }} aria-hidden="true" />
    ) : (
      <span
        key={key}
        className="scoop scoop--part"
        style={{ '--c': color, '--fill': `${Math.round(fill * 100)}%` } as React.CSSProperties}
        aria-hidden="true"
      />
    )

  const circles: React.ReactNode[] = []
  if (overflow) {
    // A "20 tasses" can't carpet the row — one base-tool circle + "×N".
    const color = measureColor(measure, ov) ?? 'var(--ink-soft)'
    circles.push(dot('one', color, 1))
    circles.push(
      <span key="x" className="scoop__count mono" style={{ color }}>
        ×{whole}
      </span>,
    )
  } else {
    measureScoops(measure, ov).forEach((s, i) => circles.push(dot(`s${i}`, s.color, s.fill)))
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
