// B-11 (bmad/10) — cercle.css moved out of the eager shell (position-immaterial
// .cercle-*/.cf-* classes); load it whenever this page renders instead.
import '../styles/cercle.css'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, ApiError, isUnauthorized } from '../lib/api'
import { isGuest } from '../lib/device'
import { formatDayLong, capitalize as cap } from '../lib/format'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { EmptyState } from '../components/EmptyState'
import { StatusMessage } from '../components/StatusMessage'
import { EditField } from '../components/EditField'
import { Icon } from '../components/Icon'

// « Rejoindre le voyage » — the RECIPIENT side of « Partager en direct ». Mirrors
// FamilyImportPage: an operator on their own account opens the invite link
// (/voyage/rejoindre?j=<token>), previews the trip by its capability token (title,
// destination, dates, N households), and joins it — becoming a live member of the
// shared store. Unlike family share this is SYNC, not a one-time copy: after joining,
// the trip is live-edited by every member household. A guest can't join (read-only); a
// signed-out visitor signs in first (the link still works after).

interface JoinPreview {
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  members: number
}

export function SharedVoyageJoinPage() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const close = useSceneClose('/board')
  useEscapeKey(close)

  const [params] = useSearchParams()
  const token = params.get('j')
  const [codeInput, setCodeInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { data: preview, error, isLoading } = useQuery({
    queryKey: ['shared-trip-join', token],
    queryFn: () => api<JoinPreview>(`shared-trip-join?j=${encodeURIComponent(token!)}`),
    enabled: !!token,
    retry: false,
  })

  // A read-only guest can't write into a household — bounce to the board.
  if (isGuest()) return <Navigate to="/board" replace />
  // Joining needs your OWN account. A signed-out visitor signs in first (the link
  // still works once signed in).
  if (isUnauthorized(error)) return <Navigate to="/login" replace />

  // No token → let them paste an invite code.
  if (!token) {
    return (
      <div className="scene" aria-label={t.sharedVoyage.joinTitle}>
        <SceneHead title={t.sharedVoyage.joinTitle} icon="users-three-bold" card="voyage" onClose={close} />
        <div className="scene__body">
          <p className="operator__hint mono">{t.sharedVoyage.joinIntro}</p>
          <EditField
            value={codeInput}
            onChange={setCodeInput}
            placeholder={t.sharedVoyage.pasteCode}
            onSubmit={() => {
              const code = codeInput.trim()
              if (code) nav(`/voyage/rejoindre?j=${encodeURIComponent(code)}`)
            }}
            submitLabel={t.sharedVoyage.open}
          />
        </div>
      </div>
    )
  }

  const invalid = error instanceof ApiError && (error.status === 404 || error.status === 400)

  async function join() {
    if (joining) return
    setJoining(true)
    setErr(null)
    try {
      const res = await api<{ id: string }>('shared-trip-join', { method: 'POST', body: { token } })
      // Strip the token from history so a back-nav can't re-trigger it.
      nav(`/voyage/partage/${res.id}`, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setJoining(false)
    }
  }

  return (
    <div className="scene" aria-label={t.sharedVoyage.joinTitle}>
      <SceneHead title={t.sharedVoyage.joinTitle} icon="users-three-bold" card="voyage" onClose={close} />
      <div className="scene__body">
        {isLoading ? (
          <Loading />
        ) : invalid || !preview ? (
          <EmptyState>{t.sharedVoyage.linkInvalid}</EmptyState>
        ) : (
          <div className="sharesheet-preview">
            <p className="sharesheet-preview__from mono">{t.sharedVoyage.joinInvited}</p>
            <h3 className="sharesheet-preview__label">{preview.title}</h3>
            <p className="mono">
              {[preview.destination, dateLabel(preview, lang)].filter(Boolean).join(' · ')}
            </p>
            <p className="operator__hint mono">{t.sharedVoyage.householdsN(preview.members)}</p>
            {err && <StatusMessage tone="error">{err}</StatusMessage>}
            <button type="button" className="btn btn--primary" onClick={() => void join()} disabled={joining}>
              <Icon name="users-three-bold" size={16} /> {joining ? t.sharedVoyage.joining : t.sharedVoyage.joinConfirm}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function dateLabel(p: JoinPreview, lang: 'fr' | 'en'): string {
  if (p.start_at == null) return ''
  const a = cap(formatDayLong(p.start_at, lang))
  if (p.end_at == null || p.end_at === p.start_at) return a
  return `${a} – ${cap(formatDayLong(p.end_at, lang))}`
}
