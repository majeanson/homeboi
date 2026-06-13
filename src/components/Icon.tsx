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
  | 'calendar-dots-bold'
  | 'caret-left-bold'
  | 'caret-right-bold'
  | 'caret-up-bold'
  | 'caret-down-bold'
  | 'carrot-bold'
  | 'check-bold'
  | 'bowl-food-bold'
  | 'cookie-bold'
  | 'egg-bold'
  | 'fork-knife-bold'
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
  // Added for the in-app Guide so every concept reuses the app's Phosphor-bold
  // icon set instead of emoji (Réglages ▸ Guide).
  | 'device-tablet-bold'
  | 'link-bold'
  | 'tag-bold'
  | 'receipt-bold'
  | 'ghost-bold'
  | 'wifi-high-bold'
  | 'newspaper-bold'
  | 'arrow-counter-clockwise-bold'
  | 'key-bold'
  | 'users-three-bold'
  | 'broom-bold'
  | 'shopping-bag-bold'
  | 'image-square-bold'
  | 'first-aid-kit-bold'
  // App-affordance icons — replacing emoji in live controls so the UI (and the
  // Guide that documents it) uses one Phosphor set: audience/theme toggles,
  // weather, time-of-day, close/camera/sound/recurring/original.
  | 'baby-bold'
  | 'user-bold'
  | 'x-bold'
  | 'camera-bold'
  | 'speaker-high-bold'
  | 'speaker-slash-bold'
  | 'scroll-bold'
  | 'repeat-bold'
  | 'sun-horizon-bold'
  | 'cloud-bold'
  | 'cloud-fog-bold'
  | 'cloud-rain-bold'
  | 'cloud-snow-bold'
  | 'cloud-lightning-bold'

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
