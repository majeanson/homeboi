import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { api, ApiError, isStatus } from '../lib/api'
import { Icon } from '../components/Icon'

// PWA share-target capture (#13). The manifest registers /share as a POST share
// target; the service worker (vite.config) intercepts that POST, stashes the
// shared image + text fields in the 'babillard-share' cache, and 303-redirects
// here. We drain that cache on load (query params are a fallback) and:
//   • a shared PHOTO → an image fridge note (note-media → notes, media_kind:image),
//     so it shows on the board like a drawn note, clearable. Optional caption.
//   • shared TEXT/URL → the capture spine (AI routes it), pre-filled, one tap.
// Never a silent auto-post; nothing shared → straight to the board. Standalone scene.
const SHARE_CACHE = 'babillard-share'

export function SharePage() {
  const t = useT()
  const nav = useNavigate()
  const [params] = useSearchParams()

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

  async function addImage() {
    if (!imageBlob || busy) return
    setBusy(true)
    try {
      const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: imageBlob })
      await api('notes', { method: 'POST', body: { media_kind: 'image', media_key: key, text: text.trim() } })
      finish()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  async function addText() {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await api('capture', { method: 'POST', body: { text: value } })
      finish()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

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
      {added ? (
        <p className="share-page__done mono" role="status">
          <Icon name="check-bold" size={18} /> {t.share.done}
        </p>
      ) : (
        <>
          <p className="lead">{imageBlob ? t.share.photoLead : t.share.lead}</p>
          {imageUrl && <img className="share-page__img" src={imageUrl} alt="" />}
          {imageBlob ? (
            <input
              className="input share-page__box"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t.share.caption}
              aria-label={t.share.caption}
            />
          ) : (
            <textarea
              className="input share-page__box"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={t.share.title}
            />
          )}
          <div className="share-page__actions">
            <button type="button" className="btn btn--ghost" onClick={() => nav('/board', { replace: true })}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={imageBlob ? addImage : addText}
              disabled={(!imageBlob && !text.trim()) || busy}
            >
              <Icon name="plus-bold" size={18} /> {t.capture.add}
            </button>
          </div>
        </>
      )}
    </main>
  )
}
