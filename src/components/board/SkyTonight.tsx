import { useT } from '../../i18n'
import { useAudience } from '../../lib/audience'
import { useSpeak } from '../../lib/speak'
import { moonPhase } from '../../lib/moonPhase'

// « Ce soir dans le ciel » — tonight's moon phase, computed locally by the pure
// `lib/moonPhase` (no network, offline-safe, no key). One calm tap-to-hear line.
// Audience-aware: a parent gets a quiet row (emoji + phase name); a pre-reader gets a
// big centered emoji tile that speaks a full sentence, matching the board's hear-first
// toddler pattern. No counts, no data — additive and calm (NFR-CALM).
//
// It used to live inside the retired « Moments » scene, on its tonight/tomorrow scopes.
// Its home is now « Dehors aujourd'hui » (`SkySheet`), the sheet the board's weather /
// wonder hero opens — the one surface that already tells the sky's story, so the moon
// reads right after "en ce moment / les heures qui viennent / demain".
export function SkyTonight() {
  const t = useT()
  const speak = useSpeak()
  const { audience } = useAudience()
  const moon = moonPhase(Date.now())
  const phase = t.board.sky.tonight.phase[moon.name]
  const heard = t.board.sky.tonight.heard[moon.name]
  const kid = audience === 'toddler'
  const inner = (
    <>
      <span className="sky-tonight__emoji" aria-hidden="true">
        {moon.emoji}
      </span>
      <span className="sky-tonight__text">
        <span className="sky-tonight__kicker mono">{t.board.sky.tonight.title}</span>
        <span className="sky-tonight__phase">{phase}</span>
      </span>
    </>
  )
  // Read-aloud is a toddler-only affordance: a pre-reader gets a big tap-to-hear
  // tile; a parent gets the same calm line as plain, non-speaking info.
  if (!kid)
    return (
      <div className="sky-tonight" aria-label={`${t.board.sky.tonight.title}: ${phase}`}>
        {inner}
      </div>
    )
  return (
    <button
      type="button"
      className="sky-tonight sky-tonight--kid"
      onClick={() => speak(heard)}
      aria-label={`${t.board.sky.tonight.title}: ${phase}`}
    >
      {inner}
    </button>
  )
}
