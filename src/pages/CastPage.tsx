// B-11 (bmad/10) — cast.css moved out of the eager shell (uniquely-scoped .cast
// classes); load it whenever this page renders instead.
import '../styles/cast.css'
import { useEffect, useRef } from 'react'
import { Board } from './Board'
import { AmbientScreen } from '../components/AmbientScreen'
import { DetailProvider } from '../components/detail/DetailProvider'
import { useProfile } from '../lib/profile'
import { isGuest, isDisplay } from '../lib/device'

const noop = () => {}

// « Diffuser au salon » — the living-room TV surface. It reuses the REAL <Board/>
// (rather than a forked read-only layout that would drift) rendered passive and
// scaled-up for 10-foot viewing, to be shown on a TV via Chromecast. See DEPLOY.md
// (cast) for how it reaches the screen: Stage 1 is Chrome's "Cast tab" off a Mac;
// Stage 2 a registered Cast receiver renders this page on the Chromecast itself.
//
// The page boots with a read-only guest token (?guest=… — main.tsx stashes it on the
// X-Device-Token header and strips it from the URL), so every write is already blocked
// server-side. The `.cast` scope adds pointer-events:none so the board is genuinely
// passive (no peeks, no checks). DetailProvider is normally supplied by HubLayout —
// this standalone scene mounts its own so the board's useEntityDetail() resolves (the
// peek can never actually open under pointer-events:none).
export function CastPage() {
  const guest = isGuest()
  const { setMemberId } = useProfile()
  const fitRef = useRef<HTMLDivElement>(null)
  // Which TV scene to render. `?scene=ambient` is the calm screensaver face — a
  // permanent photo-frame / clock "second screen" for the living room; anything else
  // (default) is the full board. main.tsx strips `?guest` but keeps the remaining
  // query, so this param survives the guest-token scrub before we read it.
  const scene = new URLSearchParams(window.location.search).get('scene') ?? 'board'

  // A TV is shared: clear any picked face so the board shows everyone (Maisonnée) —
  // but only when actually launched as a cast (a guest link OR a permanent display
  // device), so an operator previewing /cast in their own signed-in browser doesn't
  // lose their picked face.
  useEffect(() => {
    if (guest || isDisplay()) setMemberId(null)
  }, [guest, setMemberId])

  // Shrink-to-fit: a TV can't scroll, so the whole board must fit one screen. Measure
  // the board's NATURAL layout size (scrollWidth/Height — unaffected by the transform)
  // and set --cast-scale so it fills the viewport without overflowing. Never scales
  // PAST 1× (we shrink to fit, never zoom in). Recomputes as the board polls in fresh
  // data (height changes), on resize, and on a slow interval as a backstop.
  useEffect(() => {
    // Only the Board scene shrinks to fit — AmbientScreen is a full-viewport fixed
    // overlay that already sizes itself to any wall, so it needs no measurement.
    if (scene !== 'board') return
    const fit = fitRef.current
    if (!fit) return
    const apply = () => {
      const cw = fit.scrollWidth
      const ch = fit.scrollHeight
      if (!cw || !ch) return
      const s = Math.min(1, window.innerWidth / cw, window.innerHeight / ch)
      fit.style.setProperty('--cast-scale', String(s > 0 ? s : 1))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(fit)
    window.addEventListener('resize', apply)
    const id = window.setInterval(apply, 4000)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
      window.clearInterval(id)
    }
  }, [scene])

  // The calm screensaver face on the TV — a permanent photo-frame + clock "second
  // screen". It's a full-screen fixed overlay, so it sits directly inside `.cast`
  // (no shrink-to-fit wrapper); pointer-events:none keeps it passive and the TV can't
  // wake it, so onWake is a no-op. Boots on the showcase token like the board scene.
  if (scene === 'ambient') {
    return (
      <div className="cast" data-cast="ambient">
        <AmbientScreen show onWake={noop} />
      </div>
    )
  }

  return (
    <div className="cast" data-cast="board">
      {/* DetailProvider stays OUTSIDE .cast__fit: its always-mounted (closed) detail
          Sheet is position:fixed, and a transformed ancestor would re-anchor its
          off-screen position so it peeks in. Outside the transform it sits off-screen
          as intended (the peek never opens here — the board is pointer-events:none). */}
      <DetailProvider>
        <div className="cast__fit" ref={fitRef}>
          <Board />
        </div>
      </DetailProvider>
    </div>
  )
}
