import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { api, ApiError, isStatus } from '../lib/api'
import { useWrite } from '../lib/write'
import { useOnline } from '../lib/online'
import { BOARD_KEY } from '../lib/queryKeys'
import { StatusMessage } from '../components/StatusMessage'
import { CaptureForm } from '../components/CaptureForm'
import { Icon } from '../components/Icon'

// PWA share-target capture (#13). The manifest registers /share as a POST share
// target; the service worker (vite.config) intercepts that POST, stashes the
// shared image + text fields in the 'babillard-share' cache, and 303-redirects
// here. We drain that cache on load (query params are a fallback) and:
//   • a shared PHOTO → an image fridge note (note-media → notes, media_kind:image),
//     so it shows on the board like a drawn note, clearable. Optional caption.
//   • shared TEXT/URL → <CaptureForm seed=…>, THE capture spine itself. This page
//     used to re-implement that form beside it — the build-beside failure mode
//     CLAUDE.md warns about — and the cost was exactly the part it didn't copy:
//     a shared link landed with no « Ajouté : rendez-vous » label and no
//     « Corriger », so an AI mis-file was silent and unrecoverable. It now mounts
//     the real one, so the routed label, the re-route tiles and the undo come for
//     free and can't drift (bmad/11 tier-1 seam #2's remaining half).
// Never a silent auto-post; nothing shared → straight to the board. Standalone scene.
const SHARE_CACHE = 'babillard-share'

// A Google Maps place link in the shared text (the Maps app shares "Name · https://
// maps.app.goo.gl/…"). When present, the page offers a THIRD path beside note/capture:
// « Ajouter un business » → the cercle BusinessForm with ?import=<link>, whose
// place-import pre-fills name + address server-side. Client-side detection only —
// the SSRF allowlist lives server-side (functions/_lib/placeImport googleMapsUrl).
const MAPS_LINK = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|(?:www\.|maps\.)?google\.[a-z.]+\/maps)\S*/i

export function SharePage() {
  const t = useT()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const write = useWrite()
  // The photo path needs R2 before it can write anything (see addImage), so it is
  // the one branch here that genuinely cannot be queued.
  const online = useOnline()

  const [ready, setReady] = useState(false)
  const [text, setText] = useState('')
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    void (async () => {
      let meta: { title?: string; text?: string; url?: string } = {}
      let blob: Blob | null = null
      try {
        if ('caches' in window) {
          const cache = await caches.open(SHARE_CACHE)
          const metaRes = await cache.match('/__share/meta')
          if (metaRes) meta = await metaRes.json()
          const fileRes = await cache.match('/__share/file')
          if (fileRes) {
            const b = await fileRes.blob()
            if (b.size > 0 && b.type.startsWith('image/')) blob = b
          }
          // One-shot: drain it so a refresh doesn't re-add the same share.
          await cache.delete('/__share/meta')
          await cache.delete('/__share/file')
        }
      } catch {
        /* no SW / no cache (dev) — fall back to query params below */
      }
      // Compose title + text + url into one capture line, de-duped of blanks/repeats.
      const parts = [meta.title || params.get('title'), meta.text || params.get('text'), meta.url || params.get('url')]
        .map((s) => s?.trim())
        .filter(Boolean) as string[]
      const seen = new Set<string>()
      setText(parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).join(' ').trim())
      if (blob) {
        setImageBlob(blob)
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
      }
      setReady(true)
    })()
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [params])

  // The PHOTO branch is done the moment the note is written — nothing to correct,
  // so it keeps its calm auto-return. The TEXT branch does NOT: a routed capture is
  // exactly when « Corriger » matters, and bouncing to the board a second later took
  // that away before it could be read. It sets `added` and stays put.
  function finish() {
    setAdded(true)
    window.setTimeout(() => nav('/board', { replace: true }), 1000)
  }
  function fail(e: unknown) {
    // Not signed in / paired on this device → let the smart entry sort out auth.
    if (isStatus(e, 401)) {
      nav('/', { replace: true })
      return
    }
    if (!(e instanceof ApiError)) throw e
  }

  // A shared PHOTO is a two-step write and the first step is a blob upload: the
  // note row can only be written once R2 has answered with a key. That upload is
  // one of the sanctioned online-only writes (OFFLINE.md « media upload »), so
  // this whole branch is gated on `online` rather than queued — the button says
  // so instead of pretending. The note row itself still rides `useWrite`: by then
  // we are demonstrably online, and it keeps the board cache honest.
  async function addImage() {
    if (!imageBlob || busy || !online) return
    setBusy(true)
    try {
      const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: imageBlob })
      await write('notes', {
        method: 'POST',
        body: { media_kind: 'image', media_key: key, text: text.trim() },
        affectedKeys: [BOARD_KEY],
      })
      finish()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const mapsLink = text.match(MAPS_LINK)?.[0] ?? null

  if (!ready) {
    return (
      <main className="narrow share-page">
        <p className="loading mono">{t.common.loading}</p>
      </main>
    )
  }
  // Nothing was shared (opened /share directly) — nothing to capture.
  if (!text && !imageBlob) return <Navigate to="/board" replace />

  return (
    <main className="narrow share-page">
      <h1>{t.share.title}</h1>
      {/* The PHOTO branch keeps its own confirmation + auto-return: the note is
          written, there is nothing to re-file. The TEXT branch shows CaptureForm's
          own routed line instead, which is the whole point of mounting it. */}
      {added && imageBlob ? (
        <p className="share-page__done mono" role="status">
          <Icon name="check-bold" size={18} /> {t.share.done}
        </p>
      ) : (
        <>
          <p className="lead">{imageBlob ? t.share.photoLead : t.share.lead}</p>
          {imageUrl && <img className="share-page__img" src={imageUrl} alt="" />}
          {imageBlob ? (
            <>
              <input
                className="input share-page__box"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.share.caption}
                aria-label={t.share.caption}
              />
              {/* The photo branch needs the upload; say so rather than offering a
                  button that can only fail. Shared TEXT has no such limit — it queues. */}
              {!online && <StatusMessage tone="info">{t.offline.unavailable}</StatusMessage>}
            </>
          ) : (
            // THE capture spine, seeded with what was shared — same field, same AI
            // routing, same « Ajouté : X » + « Corriger », same undo. Nothing about
            // the result is re-implemented here any more.
            <CaptureForm seed={text} onRouted={() => setAdded(true)} />
          )}
          <div className="share-page__actions">
            {/* Before the capture this is « Annuler »; after it, the way onward.
                Not a timed bounce: a routed capture is exactly when « Corriger »
                matters, and it has to still be on screen to be tapped. */}
            <button type="button" className="btn btn--ghost" onClick={() => nav('/board', { replace: true })}>
              {added ? t.nav.board : t.common.cancel}
            </button>
            {/* A shared Google Maps place → straight to a pre-filled business card
                (the capture spine has no business type, so without this door a
                shared vet/plumber link just became a note with a naked URL). */}
            {!imageBlob && !added && mapsLink && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => nav(`/maison?add=business&import=${encodeURIComponent(mapsLink)}`, { replace: true })}
              >
                <Icon name="storefront-bold" size={18} /> {t.cercle.business.add}
              </button>
            )}
            {imageBlob && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={addImage}
                disabled={busy || !online}
              >
                <Icon name="plus-bold" size={18} /> {t.common.add}
              </button>
            )}
          </div>
        </>
      )}
    </main>
  )
}
