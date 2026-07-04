import type { CSSProperties } from 'react'
import { useLang } from '../i18n'
import { FEATURE_MAP_TILES, SECTION_TINT } from '../lib/guideContent'
import { Icon } from './Icon'

// A calm grid of theme tiles — "everything Babillard does" at a glance, one
// source (the themed taxonomy in lib/guideContent). Reused in three places:
// the in-app Guide (tiles scroll to a theme block), the Board first-run
// WelcomeCard (tiles open the Guide at that theme), and the DevKit gallery.
// `onSelect(key)` receives the tile key ('sections' | <theme> | 'settings');
// the caller decides what that means (scroll vs navigate).
export function FeatureMap({ onSelect, label }: { onSelect: (key: string) => void; label?: string }) {
  const { lang } = useLang()
  return (
    <nav className="feature-map" aria-label={label}>
      {FEATURE_MAP_TILES.map((tile) => {
        // Each tile wears the colour of the section it opens into (SECTION_TINT):
        // the icon inks it, hover borrows the wash — so the grid reads by section.
        const tint = SECTION_TINT[tile.section]
        return (
          <button
            key={tile.key}
            type="button"
            className="feature-map__tile"
            style={{ '--tile-ink': tint.ink, '--tile-wash': tint.wash } as CSSProperties}
            onClick={() => onSelect(tile.key)}
          >
            <span className="feature-map__ic">
              <Icon name={tile.icon} size={22} />
            </span>
            <span className="feature-map__label">{tile.label[lang]}</span>
          </button>
        )
      })}
    </nav>
  )
}
