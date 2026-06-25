import { useEffect } from 'react'
import { Board } from './Board'
import { DetailProvider } from '../components/detail/DetailProvider'
import { useProfile } from '../lib/profile'
import { isGuest } from '../lib/device'

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
  // A TV is shared: clear any picked face so the board shows everyone (Maisonnée) —
  // but only when actually launched as a cast/guest, so an operator previewing /cast
  // in their own signed-in browser doesn't lose their picked face.
  useEffect(() => {
    if (guest) setMemberId(null)
  }, [guest, setMemberId])

  return (
    <div className="cast" data-cast="1">
      <DetailProvider>
        <Board />
      </DetailProvider>
    </div>
  )
}
