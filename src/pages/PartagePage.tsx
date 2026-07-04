import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { fetchPublicShare, type RecipeSharePayload } from '../lib/share'
import { importRecipeShare } from '../lib/shareImport'
import { RECIPES_KEY } from '../lib/recipes'
import { useAuth } from '../lib/auth'
import { EmptyState } from '../components/EmptyState'
import { StatusMessage } from '../components/StatusMessage'
import { Icon } from '../components/Icon'
import { SharedRecipeView } from '../components/share/SharedRecipeView'

// The PUBLIC /partage/<id> page — the real home for a shared thing, viewable with NO
// account (the id is the capability; the read hits /api/share-public, unauthed). A
// signed-out visitor sees the content + a « Rejoindre Babillard » CTA (the acquisition
// funnel); a signed-in Babillard visitor sees the same render plus an import action
// (« Ajouter à mon livre » for a recipe, « Ouvrir dans Babillard » for a family). Every
// query here hits ONLY public endpoints, so an anonymous session never trips onAuthLost.
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

  async function addRecipe(payload: RecipeSharePayload) {
    setBusy(true)
    setErr(null)
    try {
      const newId = await importRecipeShare(payload)
      await qc.invalidateQueries({ queryKey: RECIPES_KEY })
      nav(`/kitchen/recipe/${newId}`)
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
        ) : data.kind === 'recipe' ? (
          <>
            {data.sourceName && <p className="partage__from mono">{t.shareLink.sharedBy(data.sourceName)}</p>}
            <SharedRecipeView payload={data.payload} />
            {err && <StatusMessage tone="error">{err}</StatusMessage>}
            {signedIn ? (
              <div className="partage__foot no-print">
                <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void addRecipe(data.payload)}>
                  <Icon name="book-open-bold" size={16} /> {busy ? t.shareLink.adding : t.shareLink.addToBook}
                </button>
              </div>
            ) : (
              joinFoot
            )}
          </>
        ) : data.kind === 'family' ? (
          <div className="partage__teaser card">
            {data.sourceName && <p className="partage__from mono">{t.shareLink.sharedBy(data.sourceName)}</p>}
            <h1 className="partage__title">{data.label || t.shareLink.kinds.family}</h1>
            <p className="mono">{t.shareLink.familyTeaser(data.peopleCount, data.petCount)}</p>
            {signedIn ? (
              <Link to={`/cercle/import?s=${id}`} className="btn btn--primary">
                {t.shareLink.openInApp}
              </Link>
            ) : (
              joinFoot
            )}
          </div>
        ) : (
          // event / routine renderers land in wave 3 — a graceful placeholder until then
          // (no such share can be minted yet, so this is only a forward-compat safety net).
          <>
            <div className="partage__teaser card">
              <h1 className="partage__title">{data.label}</h1>
            </div>
            {!signedIn && joinFoot}
          </>
        )}
      </main>
    </div>
  )
}
