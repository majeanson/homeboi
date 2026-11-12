// B-11 (bmad/10) — cercle.css moved out of the eager shell (position-immaterial
// .cercle-*/.cf-* classes); load it whenever this page renders instead.
import '../styles/cercle.css'
import '../styles/voyage.css'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { needsOperator } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { SceneHead } from '../components/SceneHead'
import { loadStateOf } from '../components/Fallback'
import { EmptyState } from '../components/EmptyState'
import { StatusMessage } from '../components/StatusMessage'
import { EditField } from '../components/EditField'
import { Cluster } from '../components/Layout'
import { Icon } from '../components/Icon'
import { SharedTripTabs } from '../components/voyage/SharedTripTabs'
import {
  VoyageApiContext,
  VOYAGE_ICON,
  sharedNoteToTripNote,
  tripDateLabel,
  type SharedPackingItem,
  type SharedTripClaim,
  type SharedTripNote,
  type Trip,
  type VoyageApi,
} from '../components/voyage/voyage'

// « Rejoindre le voyage » — the RECIPIENT side of « Partager en direct », and since
// 2026-11-12 also its SHOP WINDOW. The invite link (/voyage/rejoindre?j=<token>) reads a
// PUBLIC preview (GET /api/shared-trip-join, the token is the capability) and renders the
// whole trip — the SAME SharedTripTabs a member sees, inside a read-only VoyageApi — so a
// friend who has no Babillard yet sees what the camping weekend looks like before making
// an account (Marc: « so they can see what it would look like too if you get the share
// link »). Before, a signed-out visitor was bounced to /login having seen nothing.
//
// Three faces, one page:
//   - signed out          → the preview + « Créer mon compte et rejoindre » / « J'ai déjà
//                           un compte », both with ?next= back HERE, where joining is one tap
//   - an operator         → the preview + « Rejoindre le voyage » (POST, then the live trip)
//   - a guest or a kiosk  → the preview + a line saying to open it on your own phone (the
//                           join is operator-only; a babysitter's link can't sign a household up)

interface JoinPreview {
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  colour: string
  media_key: string | null
  members: number
  households: { id: string; label: string; colour: string; role: string }[]
  notes: SharedTripNote[]
  packing: SharedPackingItem[]
  claims: SharedTripClaim[]
}

// The preview's context: the shared endpoints (nothing here writes — readOnly hides every
// door — but a stray read still names the shared store), plus `readOnly`.
const PREVIEW_API: VoyageApi = {
  notesEndpoint: 'shared-trip-notes',
  packingEndpoint: 'shared-trip-packing',
  mediaEndpoint: 'shared-trip-media',
  notesKey: (tid) => ['shared-trip-preview', 'notes', tid],
  packingKey: (tid) => ['shared-trip-preview', 'packing', tid],
  shared: true,
  readOnly: true,
}

export function SharedVoyageJoinPage() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const { signedIn, loading: authLoading } = useAuth()
  const close = useSceneClose(signedIn ? '/board' : '/')
  useEscapeKey(close)

  const [params] = useSearchParams()
  const token = params.get('j')
  const [codeInput, setCodeInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const previewQ = useQuery({
    queryKey: ['shared-trip-join', token],
    queryFn: () => api<JoinPreview>(`shared-trip-join?j=${encodeURIComponent(token!)}`),
    enabled: !!token,
    retry: false,
  })
  const { data: preview, error } = previewQ

  useEffect(() => {
    if (preview) document.title = `${preview.title} · Babillard`
  }, [preview])

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
  // Where signup / login send the visitor back to: THIS link, so joining is one tap away.
  const here = `/voyage/rejoindre?j=${encodeURIComponent(token)}`

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

  if (invalid || !preview) {
    return (
      <div className="scene" aria-label={t.sharedVoyage.joinTitle}>
        <SceneHead title={t.sharedVoyage.joinTitle} icon="users-three-bold" card="voyage" onClose={close} />
        <div className="scene__body">
          {invalid ? (
            <EmptyState>{t.sharedVoyage.linkInvalid}</EmptyState>
          ) : (
            // A 404/400 is « lien invalide » above; any OTHER failure is LoadError +
            // « Réessayer », never a false « invalide » (the token is still fine).
            (loadStateOf(previewQ) ?? <EmptyState>{t.sharedVoyage.linkInvalid}</EmptyState>)
          )}
        </div>
      </div>
    )
  }

  // A Trip-shaped view for the shared children (they read id / dates / media / title).
  const trip: Trip = {
    id: 'preview',
    title: preview.title,
    destination: preview.destination,
    start_at: preview.start_at,
    end_at: preview.end_at,
    members: [],
    media_kind: preview.media_key ? 'image' : null,
    media_key: preview.media_key,
    colour: preview.colour,
    notes: null,
    position: 0,
    created_at: 0,
    updated_at: null,
  }
  const roster = preview.households.map((h) => ({ household_id: h.id, label: h.label, colour: h.colour }))

  // The door, by who is looking. Rendered ABOVE the trip: it is the one thing this page
  // asks, and the trip below is the reason to say yes.
  const door = authLoading ? null : !signedIn ? (
    <>
      <p className="voyage-docs__hint mono">{t.sharedVoyage.noAccountLead}</p>
      <Cluster>
        <Link className="btn btn--primary" to={`/signup?next=${encodeURIComponent(here)}`}>
          <Icon name="users-three-bold" size={16} /> {t.sharedVoyage.createAndJoin}
        </Link>
        <Link className="btn btn--ghost" to={`/login?next=${encodeURIComponent(here)}`}>
          {t.sharedVoyage.haveAccount}
        </Link>
      </Cluster>
    </>
  ) : needsOperator() ? (
    <p className="voyage-docs__hint mono">{t.sharedVoyage.cantJoinHere}</p>
  ) : (
    <>
      {err && <StatusMessage tone="error">{err}</StatusMessage>}
      <button type="button" className="btn btn--primary" onClick={() => void join()} disabled={joining}>
        <Icon name="users-three-bold" size={16} /> {joining ? t.sharedVoyage.joining : t.sharedVoyage.joinConfirm}
      </button>
    </>
  )

  return (
    <VoyageApiContext.Provider value={PREVIEW_API}>
      <div className="scene" aria-label={preview.title}>
        <SceneHead
          title={
            <>
              <Icon name={VOYAGE_ICON} size={20} style={{ display: 'inline-block', verticalAlign: '-0.2em' }} /> {preview.title}
            </>
          }
          subtitle={[preview.destination, tripDateLabel(trip, lang)].filter(Boolean).join(' · ') || undefined}
          card="voyage"
          onClose={close}
          closeLabel={t.common.close}
        />
        <div className="scene__body">
          <div className="sharesheet-preview voyage-join__door">
            <p className="sharesheet-preview__from mono">
              {t.sharedVoyage.joinInvited} · {t.sharedVoyage.householdsN(preview.members)}
            </p>
            <p>{t.sharedVoyage.previewLead}</p>
            {door}
          </div>
          <p className="voyage-join__ro mono">
            <Icon name="eye-bold" size={14} /> {t.sharedVoyage.previewReadOnly}
          </p>
          <SharedTripTabs
            trip={trip}
            roster={roster}
            notes={preview.notes.map(sharedNoteToTripNote)}
            packing={preview.packing}
            claims={preview.claims}
            myHouseholdId=""
          />
        </div>
      </div>
    </VoyageApiContext.Provider>
  )
}
