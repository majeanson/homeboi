// B-11 (bmad/10) — cercle.css moved out of the eager shell (position-immaterial
// .cercle-*/.cf-* classes); load it whenever this page renders instead.
import '../styles/cercle.css'
// intake.css — reuses .intake-review__merge for its own merge-decision chip.
import '../styles/intake.css'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, ApiError, isUnauthorized } from '../lib/api'
import { isGuest } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { CERCLE_KEY, BOARD_KEY, INTAKE_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { ReviewChecklist } from '../components/ReviewChecklist'
import { StatusMessage } from '../components/StatusMessage'
import { EmptyState } from '../components/EmptyState'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Chip } from '../components/Chip'
import { EditField } from '../components/EditField'
import { THING_DEFAULTS } from '../lib/things'
import { fullName, genderedRelLabel, type Contact, type Member } from '../lib/cercle'
import type { IntakeMatch, IntakeSubmission, PendingIntake } from '../lib/intake'
import {
  buildReview,
  copyPhotoToOwn,
  displayName,
  matchKey,
  mergeIntoCercle,
  mergeSteps,
  ownPhoto,
  type Decisions,
  type ReviewItem,
} from '../lib/ficheMerge'

// « Ajouter une famille » — THE review screen for a family record coming in, from
// either door (2026-09-29, « fiche famille »):
//   · `?s=<id>`      — a family another household shared (« Partager une famille »).
//                      We read the snapshot by its capability id; photos are re-copied
//                      into OUR R2 ownership so nothing stays shared live.
//   · `?intake=<id>` — a family-info form a relative filled from our own link, waiting
//                      in quarantine. Its photos were staged for us already; the sender
//                      always comes in (they are who the link was for), and a link aimed
//                      at one person merges into that person.
// Either way the ticked people, relationships and pets merge through lib/ficheMerge —
// the one merge; this page only decides where the family comes FROM.

interface ShareResponse {
  label: string
  payload: IntakeSubmission
  sourceName: string | null
}

// What the page needs to know about where the family comes from.
interface Source {
  payload: IntakeSubmission
  title: string
  from: string | null
  groupLabel: string | null
  alwaysSelf: boolean
  selfCandidate: IntakeMatch | null
  photo: (key: string | null) => Promise<string | null>
  finish: () => Promise<void>
}

// An intake link aimed at one person carries `contact:<id>` / `member:<id>`.
function targetMatch(targetKey: string | null, contacts: Contact[], members: Member[]): IntakeMatch | null {
  if (!targetKey) return null
  const sep = targetKey.indexOf(':')
  const kind = targetKey.slice(0, sep) as 'contact' | 'member'
  const id = targetKey.slice(sep + 1)
  if (kind === 'contact') {
    const c = contacts.find((x) => x.id === id)
    return c ? { kind, id, name: fullName(c) } : null
  }
  const m = members.find((x) => x.id === id)
  return m ? { kind, id, name: m.displayName } : null
}

export function FamilyImportPage() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const qc = useQueryClient()
  const close = useSceneClose('/maison?section=family')
  useEscapeKey(close)

  const [params] = useSearchParams()
  const shareId = params.get('s')
  const intakeId = params.get('intake')
  const [codeInput, setCodeInput] = useState('')

  const { data: share, error, isLoading: shareLoading } = useQuery({
    queryKey: ['family-share', shareId],
    queryFn: () => api<ShareResponse>(`family-share?s=${encodeURIComponent(shareId!)}`),
    enabled: !!shareId,
    retry: false,
  })
  const { data: intake, isLoading: intakeLoading } = useQuery({
    queryKey: INTAKE_KEY,
    queryFn: () => api<{ submissions: PendingIntake[] }>('intake'),
    enabled: !!intakeId,
  })

  // Our OWN circle, for dedupe suggestions at review.
  const { data: cercle } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<{ contacts: Contact[]; members: Member[] }>('cercle'),
  })
  const contacts = cercle?.contacts ?? []
  const members = cercle?.members ?? []

  const [reviewing, setReviewing] = useState(false)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [decision, setDecision] = useState<Decisions>({})
  // Merge runs many sequential writes (create each person + copy their photo + each
  // link + each pet); for a big family that's a while, so we drive a progress bar
  // instead of a bare spinner. null = not merging.
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // A read-only guest can't write into a household — bounce to the circle.
  if (isGuest()) return <Navigate to="/maison?section=family" replace />
  // Reading a shared family needs your OWN account (it's how you merge into it). A
  // signed-out visitor is sent to log in first (the link still works once signed in).
  if (isUnauthorized(error)) return <Navigate to="/login" replace />

  // No id in the URL → let them paste a share code.
  if (!shareId && !intakeId) {
    return (
      <div className="scene" aria-label={t.familyShare.importTitle}>
        <SceneHead title={t.familyShare.importTitle} icon="users-three-bold" card="cercle" onClose={close} />
        <div className="scene__body">
          <p className="operator__hint mono">{t.familyShare.importIntro}</p>
          <EditField
            value={codeInput}
            onChange={setCodeInput}
            placeholder={t.familyShare.pasteCode}
            onSubmit={() => {
              const code = codeInput.trim()
              if (code) nav(`/cercle/import?s=${encodeURIComponent(code)}`)
            }}
            submitLabel={t.familyShare.open}
          />
        </div>
      </div>
    )
  }

  const pending = intakeId ? intake?.submissions.find((x) => x.id === intakeId) : undefined
  const source: Source | null = share
    ? {
        payload: share.payload,
        title: share.label || t.familyShare.importTitle,
        from: t.familyShare.from(share.sourceName || t.cercle.memberBadge),
        groupLabel: share.label || null,
        alwaysSelf: false,
        selfCandidate: null,
        photo: copyPhotoToOwn,
        finish: async () => {},
      }
    : pending
      ? {
          payload: pending,
          title: t.intake.reviewItemTitle(displayName(pending.self)),
          from: null,
          groupLabel: null,
          alwaysSelf: true,
          selfCandidate: targetMatch(pending.targetKey, contacts, members),
          photo: ownPhoto,
          finish: async () => {
            await api('intake', { method: 'PATCH', body: { id: pending.id, status: 'merged' } })
            qc.invalidateQueries({ queryKey: INTAKE_KEY })
          },
        }
      : null
  const isLoading = shareLoading || intakeLoading
  const notFound =
    (error instanceof ApiError && (error.status === 404 || error.status === 400)) || (!!intakeId && !intakeLoading && !pending)

  function openReview(src: Source) {
    const r = buildReview(src.payload, contacts, members, src.selfCandidate)
    setItems(r.items)
    setDecision(r.decision)
    setErr(null)
    setReviewing(true)
  }

  async function merge(src: Source, selected: ReviewItem[]) {
    const plan = { sub: src.payload, items, selected, alwaysSelf: src.alwaysSelf, groupLabel: src.groupLabel }
    setReviewing(false)
    setErr(null)
    setProgress({ current: 0, total: mergeSteps(plan) })
    try {
      await mergeIntoCercle({
        ...plan,
        decision,
        contacts,
        photo: src.photo,
        onStep: () => setProgress((p) => (p ? { ...p, current: Math.min(p.current + 1, p.total) } : p)),
      })
      await src.finish()
      qc.invalidateQueries({ queryKey: CERCLE_KEY })
      qc.invalidateQueries({ queryKey: BOARD_KEY })
      setProgress(null)
      setDone(true)
    } catch (e) {
      setErr((e as Error).message)
      setProgress(null)
    }
  }

  return (
    <div className="scene" aria-label={t.familyShare.importTitle}>
      <SceneHead title={t.familyShare.importTitle} icon="users-three-bold" card="cercle" onClose={close} />
      <div className="scene__body">
        {isLoading ? (
          <Loading />
        ) : notFound || !source ? (
          <EmptyState>{t.familyShare.notFound}</EmptyState>
        ) : progress ? (
          <div className="sharesheet-preview">
            <p className="mono">{t.familyShare.adding}</p>
            <progress className="cercle-import__bar" value={progress.current} max={progress.total} />
            <p className="mono">{progress.current} / {progress.total}</p>
          </div>
        ) : done ? (
          <StatusMessage tone="success">{t.familyShare.added}</StatusMessage>
        ) : (
          <>
            <div className="sharesheet-preview">
              {source.from && <p className="sharesheet-preview__from mono">{source.from}</p>}
              <h3 className="sharesheet-preview__label">{source.title}</h3>
              <p className="operator__hint mono">{share ? t.familyShare.importIntro : t.intake.reviewHint}</p>
              <p className="mono">
                {t.familyShare.peopleN(1 + source.payload.household.length)}
                {source.payload.pets.length > 0 ? ` · ${source.payload.pets.length} 🐾` : ''}
              </p>
              {err && <StatusMessage tone="error">{err}</StatusMessage>}
              <button type="button" className="btn btn--primary" onClick={() => openReview(source)}>
                <Icon name="check-bold" size={16} /> {t.familyShare.reviewAdd}
              </button>
            </div>

            <ReviewChecklist<ReviewItem>
              open={reviewing}
              onClose={() => setReviewing(false)}
              title={source.title}
              items={items}
              renderItem={(item) =>
                item.kind === 'pet' ? (
                  <>
                    <Avatar kind={item.pet.photoKey ? 'photo' : null} photo={item.pet.photoKey} colour={THING_DEFAULTS.pet.colour} name={item.pet.name} size={28} />
                    <span className="review__name">{item.pet.name}</span>
                    <span className="review__sub mono">{item.pet.species || t.familyShare.petFallback}</span>
                  </>
                ) : (
                  <>
                    <Avatar kind={item.person.photoKey ? 'photo' : null} photo={item.person.photoKey} colour="#2A8F85" name={item.person.firstName} size={28} />
                    <span className="review__name">{displayName(item.person)}</span>
                    <span className="review__sub mono">
                      {source.alwaysSelf && item.index === 0
                        ? t.intake.thePerson
                        : item.relType
                          ? genderedRelLabel(item.relType, item.person.gender, lang)
                          : ''}
                    </span>
                    {item.candidate && (
                      <Chip
                        className="intake-review__merge"
                        selected={decision[item.index] !== 'new'}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDecision((d) => ({ ...d, [item.index]: d[item.index] === 'new' ? matchKey(item.candidate!) : 'new' }))
                        }}
                      >
                        <Icon name={decision[item.index] !== 'new' ? 'check-bold' : 'plus-bold'} size={12} />
                        {decision[item.index] !== 'new' ? t.familyShare.mergeInto(item.candidate.name) : t.familyShare.createNew}
                      </Chip>
                    )}
                  </>
                )
              }
              onApply={(sel) => void merge(source, sel)}
              applyAllLabel={(n) => t.familyShare.addAll(n)}
              applySelectedLabel={(n) => t.familyShare.addSelected(n)}
              busy={!!progress}
            />
          </>
        )}
      </div>
    </div>
  )
}
