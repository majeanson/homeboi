// Pip iconography: Phosphor (bold/fill) paths, recoloured via currentColor. The
// art + the IconName type both come from lib/pipIcons (one typed source of
// truth) — no window global, no load-order dependency, and an unknown name is a
// compile error rather than a silent blank (NFR-KID-2: icon + audio carry
// meaning, never required reading, so a missing glyph must never ship unnoticed).
import { PIP_ICONS, type IconName } from '../lib/pipIcons'

export type { IconName }

export function Icon({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconName
  size?: number
  color?: string
  style?: React.CSSProperties
}) {
  const inner = PIP_ICONS[name] || ''
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', color, flex: 'none', ...style }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}

// An icon sized to sit inline with text (baseline-aligned), for mid-sentence use
// or beside a label in a button/chip. One place for the repeated inline style so
// every inline glyph lines up the same way.
export function InlineIcon({ name, size = 15, color }: { name: IconName; size?: number; color?: string }) {
  return <Icon name={name} size={size} color={color} style={{ display: 'inline-block', verticalAlign: '-0.15em' }} />
}
