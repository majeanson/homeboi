import { useT } from '../../i18n'
import { imgUrl } from '../../lib/image'
import { isRoutineTod } from '../../lib/routineTod'
import type { RoutineSharePayload } from '../../lib/share'

// Read-only routine render for the public /partage page — the picture-card deck (a
// parent's photo wins over the emoji, the same rule the toddler run + overview follow).
// Voice narration isn't shared (personal), so cards degrade to their emoji/photo + word.
export function SharedRoutineView({ payload }: { payload: RoutineSharePayload }) {
  const t = useT()
  return (
    <article className="shared-routine">
      <h1 className="shared-routine__title">{payload.name}</h1>
      {isRoutineTod(payload.timeOfDay) && <p className="shared-routine__tod mono">{t.routines.tod[payload.timeOfDay]}</p>}
      <div className="shared-routine__cards">
        {payload.cards.map((c, i) => (
          <div key={i} className="shared-routine__card">
            <div className="shared-routine__pic">
              {c.photoKey ? (
                <img src={imgUrl(c.photoKey)} alt="" />
              ) : (
                <span className="shared-routine__emoji">{c.icon || '○'}</span>
              )}
            </div>
            <span className="shared-routine__label">{c.label}</span>
          </div>
        ))}
      </div>
    </article>
  )
}
