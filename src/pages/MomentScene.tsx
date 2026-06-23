import { useT } from '../i18n'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { SceneHead } from '../components/SceneHead'
import { MomentsView } from '../components/board/MomentsView'
import { DetailProvider } from '../components/detail/DetailProvider'

// /moment — « Moments » as a standalone, deep-linkable scene. The actual recap +
// scope selector + handoff checklist is the shared MomentsView (also the board's
// fifth view); this only wraps it in scene chrome. The board's evening « Demain en
// bref » card and any ?scope= deep-link land here; `urlSync` keeps the scope in
// the URL so those presets work. Default preset is « Demain » (the dusk nudge).
export function MomentScene() {
  const t = useT()
  const close = useSceneClose('/board')
  useEscapeKey(close)
  return (
    // Own DetailProvider: this scene lives OUTSIDE HubLayout (which provides one for
    // the in-board view), so MomentsView's tap-to-peek rows have a host here too.
    <DetailProvider>
      <div className="scene" aria-label={t.moment.title}>
        <SceneHead title={t.moment.title} icon="sun-bold" card="moment" onClose={close} closeLabel={t.common.close} />
        <div className="scene__body">
          <MomentsView urlSync defaultScope="tomorrow" />
        </div>
      </div>
    </DetailProvider>
  )
}
