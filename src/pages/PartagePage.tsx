// B-11 (bmad/10) — partage.css moved out of the eager shell (standalone public
// page, no hub chrome); load it whenever this page renders instead.
import '../styles/partage.css'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { fetchPublicShare, type PublicShare } from '../lib/share'
import { importRecipeShare, importEventShare, importRoutineShare } from '../lib/shareImport'
import { RECIPES_KEY } from '../lib/recipes'
import { api } from '../lib/api'
import { EVENTS_KEY, BOARD_KEY, MONTH_KEY, ROUTINES_KEY, MEMBERS_KEY } from '../lib/queryKeys'
import { useAuth } from '../lib/auth'
import { EmptyState } from '../components/EmptyState'
import { StatusMessage } from '../components/StatusMessage'
import { Icon } from '../components/Icon'
import { SharedRecipeView } from '../components/share/SharedRecipeView'
import { SharedEventCard } from '../components/share/SharedEventCard'
import { SharedRoutineView } from '../components/share/SharedRoutineView'

// The PUBLIC /partage/<id> page — the real home for a shared thing, viewable with NO
// account (the id is the capability; the read hits /api/share-public, unauthed). A
// signed-out visitor sees the content + a « Rejoindre Babillard » CTA (the acquisition
// funnel); a signed-in Babillard visitor sees the same render plus an import action
// (add to book / agenda / routines, or open a family in-app). Every query here hits ONLY
// public endpoints while signed out, so an anonymous session never trips onAuthLost.
export function PartagePage() {
  const { id = '' } = useParams()
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { signedIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['share-public', id],
    queryFn: () => fetchPublicShare(id),
    enabled: !!id,
    retry: false,
  })

  useEffect(() => {
    if (data) document.title = `${data.label || t.shareLink.joinTitle} · Babillard`
  }, [data, t])

  // The signup funnel (signed-out) — echoes Home.tsx's .home__cta. Kept out of print.
  const joinFoot = (
    <div className="partage__foot no-print">
      <p className="partage__lead">{t.shareLink.joinLead}</p>
      <div className="home__cta">
        <Link to="/signup" className="btn btn--primary">
          {t.shareLink.joinCta}
        </Link>
        <Link to={`/login?next=${encodeURIComponent(`/partage/${id}`)}`} className="btn btn--ghost">
          {t.shareLink.alreadyAccount}
        </Link>
      </div>
    </div>
  )

  // Run an import (add to my account) with busy/err handling; the fn returns where to go
  // on success (a recipe → its new page, an event → the board, …).
  async function runImport(fn: () => Promise<string>) {
    setBusy(true)
    setErr(null)
    try {
      nav(await fn())
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="partage">
      <header className="partage__top no-print">
        <Link to="/" className="partage__brand">
          <Icon name="sun-bold" size={20} /> Babillard
        </Link>
      </header>
      <main className="partage__body">
        {isLoading ? (
          <StatusMessage tone="info">…</StatusMessage>
        ) : isError || !data ? (
          <>
            <EmptyState tone="calm">{t.shareLink.notFound}</EmptyState>
            {joinFoot}
          </>
        ) : (
          <>
            {'sourceName' in data && data.sourceName && (
              <p className="partage__from mono">{t.shareLink.sharedBy(data.sourceName)}</p>
            )}
            <ShareBody data={data} />
            {err && <StatusMessage tone="error">{err}</StatusMessage>}
            {signedIn ? (
              <ImportFoot data={data} id={id} busy={busy} onImport={(fn) => void runImport(fn)} qc={qc} />
            ) : (
              joinFoot
            )}
          </>
        )}
      </main>
    </div>
  )
}

// The read-only render for a share, by kind. Family shows a teaser only (its PII payload
// is never in the public read — full view stays signed-in, via /cercle/import).
function ShareBody({ data }: { data: PublicShare }) {
  const t = useT()
  if (data.kind === 'recipe') return <SharedRecipeView payload={data.payload} />
  if (data.kind === 'event') return <SharedEventCard payload={data.payload} />
  if (data.kind === 'routine') return <SharedRoutineView payload={data.payload} />
  return (
    <div className="partage__teaser card">
      <h1 className="partage__title">{data.label || t.shareLink.kinds.family}</h1>
      <p className="mono">{t.shareLink.familyTeaser(data.peopleCount, data.petCount)}</p>
    </div>
  )
}

// The signed-in import CTA, per kind. Recipe/event are one tap; routine needs a member to
// assign to (a routine is per-child), so it shows a small picker first.
function ImportFoot({
  data,
  id,
  busy,
  onImport,
  qc,
}: {
  data: PublicShare
  id: string
  busy: boolean
  onImport: (fn: () => Promise<string>) => void
  qc: ReturnType<typeof useQueryClient>
}) {
  const t = useT()

  if (data.kind === 'recipe')
    return (
      <div className="partage__foot no-print">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() =>
            onImport(async () => {
              const newId = await importRecipeShare(data.payload)
              await qc.invalidateQueries({ queryKey: RECIPES_KEY })
              return `/kitchen/recipe/${newId}`
            })
          }
        >
          <Icon name="book-open-bold" size={16} /> {busy ? t.shareLink.adding : t.shareLink.addToBook}
        </button>
      </div>
    )

  if (data.kind === 'event')
    return (
      <div className="partage__foot no-print">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() =>
            onImport(async () => {
              await importEventShare(data.payload)
              await qc.invalidateQueries({ queryKey: EVENTS_KEY })
              await qc.invalidateQueries({ queryKey: BOARD_KEY })
              await qc.invalidateQueries({ queryKey: MONTH_KEY })
              return '/board'
            })
          }
        >
          <Icon name="calendar-blank-bold" size={16} /> {busy ? t.shareLink.adding : t.shareLink.addToAgenda}
        </button>
      </div>
    )

  if (data.kind === 'routine') return <RoutineImportFoot payload={data.payload} busy={busy} onImport={onImport} qc={qc} />

  // family → open the signed-in merge flow (its PII stays behind sign-in).
  return (
    <div className="partage__foot no-print">
      <Link to={`/cercle/import?s=${id}`} className="btn btn--primary">
        {t.shareLink.openInApp}
      </Link>
    </div>
  )
}

// A routine is per-child, so importing one asks WHO to assign it to before creating.
function RoutineImportFoot({
  payload,
  busy,
  onImport,
  qc,
}: {
  payload: Extract<PublicShare, { kind: 'routine' }>['payload']
  busy: boolean
  onImport: (fn: () => Promise<string>) => void
  qc: ReturnType<typeof useQueryClient>
}) {
  const t = useT()
  const [memberId, setMemberId] = useState('')
  const { data: members } = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<{ members: { id: string; display_name: string }[] }>('members'),
  })
  const list = members?.members ?? []

  return (
    <div className="partage__foot no-print">
      <label className="field">
        <span className="field__label">{t.shareLink.pickChild}</span>
        <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">—</option>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy || !memberId}
        onClick={() =>
          onImport(async () => {
            await importRoutineShare(payload, [memberId])
            await qc.invalidateQueries({ queryKey: ROUTINES_KEY })
            await qc.invalidateQueries({ queryKey: BOARD_KEY })
            return '/maison'
          })
        }
      >
        <Icon name="baby-bold" size={16} /> {busy ? t.shareLink.adding : t.shareLink.addRoutine}
      </button>
    </div>
  )
}
