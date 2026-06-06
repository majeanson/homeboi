// Pip iconography: Phosphor (bold/fill) paths, inlined as SVG and recoloured via
// currentColor. The registry is loaded by /pip-icons.js in index.html (a global,
// ready before this module runs), so we read it off window. Unknown names render
// nothing rather than throwing — an icon is never load-bearing for meaning here
// (NFR-KID-2: icon + audio carry meaning, never required reading).
declare global {
  interface Window {
    PIP_ICONS?: Record<string, string>
  }
}

export type IconName =
  | 'arrow-right-bold'
  | 'bathtub-bold'
  | 'book-open-bold'
  | 'calendar-blank-bold'
  | 'carrot-bold'
  | 'check-bold'
  | 'clock-bold'
  | 'gear-six-bold'
  | 'hand-heart-bold'
  | 'heart-bold'
  | 'moon-stars-bold'
  | 'paint-brush-bold'
  | 'pencil-simple-bold'
  | 'plus-bold'
  | 'smiley-bold'
  | 'sparkle-bold'
  | 'sun-bold'
  | 'sun-fill'
  | 'tooth-bold'
  | 'tree-bold'

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
  const inner = (typeof window !== 'undefined' && window.PIP_ICONS?.[name]) || ''
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
