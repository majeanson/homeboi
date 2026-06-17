import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { api, ApiError, isStatus } from '../lib/api'
import { Icon } from '../components/Icon'

// PWA share-target capture (#13). The manifest registers /share as a share target,
// so "Share → Babillard" from any app (a school email, a recipe URL) lands here
// with the shared title/text/url as query params. We compose them into one line
// and drop it into the SAME capture spine the ＋ uses — the AI router sorts it into
// an event / task / list item / meal / note. The human sees it pre-filled and taps
// Ajouter (never a silent auto-post), then we bounce to the board. Nothing shared →
// straight to the board. A standalone scene route (no hub chrome).
export function SharePage() {
  const t = useT()
  const nav = useNavigate()
  const [params] = useSearchParams()
  // Title + text + url, in that order, de-duped of blanks — one capture line.
  const initial = useMemo(() => {
    const parts = ['title', 'text', 'url'].map((k) => params.get(k)?.trim()).filter(Boolean) as string[]
    // A shared page often repeats its URL inside `text`; don't tack it on twice.
    const seen = new Set<string>()
    return parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).join(' ').trim()
  }, [params])

  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<string | null>(null)

  async function add() {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const res = await api<{ routed?: { label?: string } }>('capture', { method: 'POST', body: { text: value } })
      setAdded(res.routed?.label ?? value)
      window.setTimeout(() => nav('/board', { replace: true }), 1000)
    } catch (e) {
      // Not signed in / paired on this device → let the smart entry sort out auth.
      if (isStatus(e, 401)) {
        nav('/', { replace: true })
        return
      }
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Nothing was shared (opened /share directly) — there's nothing to capture.
  if (!initial) return <Navigate to="/board" replace />

  return (
    <main className="narrow share-page">
      <h1>{t.share.title}</h1>
      {added ? (
        <p className="share-page__done mono" role="status">
          <Icon name="check-bold" size={18} /> {t.share.added} {added}
        </p>
      ) : (
        <>
          <p className="lead">{t.share.lead}</p>
          <textarea
            className="input share-page__box"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={t.share.title}
          />
          <div className="share-page__actions">
            <button type="button" className="btn btn--ghost" onClick={() => nav('/board', { replace: true })}>
              {t.common.cancel}
            </button>
            <button type="button" className="btn btn--primary" onClick={add} disabled={!text.trim() || busy}>
              <Icon name="plus-bold" size={18} /> {t.capture.add}
            </button>
          </div>
        </>
      )}
    </main>
  )
}
