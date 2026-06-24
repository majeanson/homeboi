import { useCanvasEnabled } from '../../lib/canvas'
import { season } from '../../lib/season'

// « Living canvas » — an ambient backdrop for Aujourd'hui that drifts with the SEASON +
// WEATHER + (via the existing :root[data-daypart]) the time of day: a faint seasonal wash,
// and gentle drifting snow when it's actually snowing. Decorative + behind everything
// (pointer-events:none, low opacity) so it never touches readability. Per-device opt-out
// (Réglages ▸ Affichage); reduced-motion disables the snow. Calm: no numbers, no flashing,
// nothing to interact with — the wall just feels a little alive.
//
// Deterministic flake layout (no Math.random — varied by index) so it's stable per render.
const FLAKES = [
  { left: '6%', delay: '0s', dur: '17s', size: 5 },
  { left: '16%', delay: '5s', dur: '22s', size: 3 },
  { left: '27%', delay: '11s', dur: '19s', size: 6 },
  { left: '38%', delay: '2s', dur: '24s', size: 4 },
  { left: '49%', delay: '8s', dur: '16s', size: 5 },
  { left: '58%', delay: '14s', dur: '21s', size: 3 },
  { left: '67%', delay: '4s', dur: '18s', size: 6 },
  { left: '76%', delay: '10s', dur: '23s', size: 4 },
  { left: '85%', delay: '1s', dur: '20s', size: 5 },
  { left: '93%', delay: '7s', dur: '17s', size: 3 },
]

export function BoardCanvas({ weatherBucket }: { weatherBucket?: string | null }) {
  const enabled = useCanvasEnabled()
  if (!enabled) return null
  const s = season(Date.now())
  const snowing = weatherBucket === 'snow'
  return (
    <div className="board-canvas" data-season={s} data-weather={weatherBucket ?? undefined} aria-hidden="true">
      {snowing && (
        <div className="board-canvas__snow">
          {FLAKES.map((f, i) => (
            <span
              key={i}
              className="board-canvas__flake"
              style={{ left: f.left, animationDelay: f.delay, animationDuration: f.dur, width: f.size, height: f.size }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
