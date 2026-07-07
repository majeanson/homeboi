import { useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { InlineIcon } from './Icon'

// Reads the operator's `?preview=<kind>` on a share scene (HandoffPage / WelcomePage
// / FamilyWindowPage). A real guest never has this — the scenes fetch guest/window
// from the token — so it's only ever set when the operator opened the scene from
// Réglages ▸ Partage to see exactly what a curated link shows.
export function useSharePreview(): string | null {
  const [params] = useSearchParams()
  return params.get('preview')
}

// The banner an operator sees on top of a previewed scene: a calm note + a way back
// to settings (a guest scene has no close affordance — this IS that affordance, only
// for the operator). Hidden in print (the @media print block strips it). NFR-CALM.
export function SharePreviewBar() {
  const t = useT()
  const navigate = useNavigate()
  return (
    <div className="share-preview no-print" role="status">
      <span className="share-preview__note mono">
        <InlineIcon name="magnifying-glass-bold" /> {t.shareMode.previewNote}
      </span>
      <button type="button" className="btn btn--sm" onClick={() => navigate('/settings?tab=settings&sub=guest')}>
        <InlineIcon name="x-bold" /> {t.shareMode.closePreview}
      </button>
    </div>
  )
}
