import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, ApiError, isUnauthorized } from '../lib/api'
import { isGuest } from '../lib/device'
import { uploadMedia } from '../lib/uploadMedia'
import { imgUrl } from '../lib/image'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { CERCLE_KEY, BOARD_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { ReviewChecklist } from '../components/ReviewChecklist'
import { StatusMessage } from '../components/StatusMessage'
import { EmptyState } from '../components/EmptyState'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { EditField } from '../components/EditField'
import { genderedRelLabel, type Contact, type Member, type RelationshipType } from '../lib/cercle'
import { matchIntakePerson, type IntakeSubmission, type IntakePersonInput, type IntakePetInput, type IntakeMatch } from '../lib/intake'

// « Ajouter une famille » — the RECIPIENT side of « Partager une famille ». A friend
// on their own account opened Le cercle, shared a family, and sent the /cercle/import?s=<id>
// link. Here we (signed into OUR OWN account) read the shared snapshot by its capability
// id, preview who's in it (flagging likely duplicates against our own cercle), and MERGE
// the ticked people + relationships + pets into our cercle via the existing /api/cercle*
// endpoints — the same reuse the intake review does (matchIntakePerson + ReviewChecklist).
// One-time COPY: photos are re-copied into OUR R2 ownership so nothing is shared live.

interface ShareResponse {
  label: string
  payload: IntakeSubmission
  sourceName: string | null
}

const matchKey = (m: IntakeMatch) => `${m.kind}:${m.id}`

// An incoming person → /api/cercle body. Blank fields → undefined so a merge never
// clobbers an existing value; the re-copied photo rides as photoKey.
function personBody(p: IntakePersonInput, photoKey: string | null) {
  return {
    firstName: p.firstName,
    lastName: p.lastName || undefined,
    nickname: p.nickname || undefined,
    birthday: p.birthday || undefined,
    gender: p.gender ?? undefined,
    email: p.email || undefined,
    phone: p.phone || undefined,
    address: p.address ?? undefined,
    notes: p.notes || undefined,
    photoKey: photoKey ?? undefined,
  }
}

const displayName = (p: IntakePersonInput): string => `${p.firstName} ${p.lastName}`.trim() || p.firstName

// Re-copy a shared photo (a share-owned `fs_` R2 key) into a blob WE own, by fetching
// it and re-uploading through the contact photo endpoint. Best-effort: any failure (R2
// unset on our side, blob gone) → no photo, and the person still imports.
async function copyPhotoToOwn(fsKey: string | null): Promise<string | null> {
  if (!fsKey) return null
  try {
    const res = await fetch(imgUrl(fsKey), { credentials: 'same-origin' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await uploadMedia('cercle', blob, { resize: false })
  } catch {
    return null
  }
}

type ReviewItem =
  | { kind: 'person'; index: number; person: IntakePersonInput; relType: RelationshipType | null; candidate: IntakeMatch | null }
  | { kind: 'pet'; petIndex: number; pet: IntakePetInput }

export function FamilyImportPage() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const qc = useQueryClient()
  const close = useSceneClose('/cercle')
  useEscapeKey(close)

  const [params] = useSearchParams()
  const shareId = params.get('s')
  const [codeInput, setCodeInput] = useState('')

  const { data: share, error, isLoading } = useQuery({
    queryKey: ['family-share', shareId],
    queryFn: () => api<ShareResponse>(`family-share?s=${encodeURIComponent(shareId!)}`),
    enabled: !!shareId,
    retry: false,
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
  const [decision, setDecision] = useState<Record<number, string>>({}) // person index → 'new' | 'contact:id' | 'member:id'
  // Merge runs many sequential writes (create each person + copy their photo + each
  // link + each pet); for a big family that's a while, so we drive a progress bar
  // instead of a bare spinner. null = not merging.
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // A read-only guest can't write into a household — bounce to the circle.
  if (isGuest()) return <Navigate to="/cercle" replace />
  // Reading a shared family needs your OWN account (it's how you merge into it). A
  // signed-out visitor is sent to log in first (the link still works once signed in).
  if (isUnauthorized(error)) return <Navigate to="/login" replace />

  // No id in the URL → let them paste a share code.
  if (!shareId) {
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

  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400)

  function openReview(sub: IntakeSubmission) {
    const relOf = (idx: number): RelationshipType | null =>
      sub.links.find((l) => (l.aIndex === idx && l.bIndex === 0) || (l.bIndex === idx && l.aIndex === 0))?.type ?? null
    const people: ReviewItem[] = [
      { kind: 'person', index: 0, person: sub.self, relType: null, candidate: matchIntakePerson(sub.self, contacts, members) },
      ...sub.household.map((p, i): ReviewItem => ({
        kind: 'person',
        index: i + 1,
        person: p,
        relType: relOf(i + 1),
        candidate: matchIntakePerson(p, contacts, members),
      })),
    ]
    const petItems: ReviewItem[] = sub.pets.map((p, i): ReviewItem => ({ kind: 'pet', petIndex: i, pet: p }))
    const dec: Record<number, string> = {}
    for (const it of people) if (it.kind === 'person') dec[it.index] = it.candidate ? matchKey(it.candidate) : 'new'
    setItems([...people, ...petItems])
    setDecision(dec)
    setErr(null)
    setReviewing(true)
  }

  // Create OR merge one person; returns the resulting contact id (for linking/owning).
  async function upsertPerson(index: number, person: IntakePersonInput): Promise<string> {
    const photoKey = await copyPhotoToOwn(person.photoKey)
    const choice = decision[index] ?? 'new'
    if (choice !== 'new') {
      const sep = choice.indexOf(':')
      const kind = choice.slice(0, sep)
      const id = choice.slice(sep + 1)
      if (kind === 'contact') {
        await api('cercle', { method: 'PATCH', body: { id, ...personBody(person, photoKey) } })
        return id
      }
      // Merging into one of our members: patch its linked contact if it has one, else
      // create a contact hard-linked to the member.
      const linked = contacts.find((c) => c.memberId === id)
      if (linked) {
        await api('cercle', { method: 'PATCH', body: { id: linked.id, ...personBody(person, photoKey) } })
        return linked.id
      }
      const res = await api<{ id: string }>('cercle', { method: 'POST', body: { ...personBody(person, photoKey), memberId: id } })
      return res.id
    }
    const res = await api<{ id: string }>('cercle', { method: 'POST', body: personBody(person, photoKey) })
    return res.id
  }

  async function merge(selected: ReviewItem[]) {
    if (!share) return
    const persons = selected.filter((i): i is Extract<ReviewItem, { kind: 'person' }> => i.kind === 'person')
    const petsSel = selected.filter((i): i is Extract<ReviewItem, { kind: 'pet' }> => i.kind === 'pet')
    const importedIdx = new Set(persons.map((p) => p.index))
    const linkCount = share.payload.links.filter((l) => importedIdx.has(l.aIndex) && importedIdx.has(l.bIndex)).length
    const groupSteps = share.label && persons.length > 1 ? 1 + persons.length : 0
    const total = Math.max(1, persons.length + linkCount + petsSel.length + groupSteps)
    setReviewing(false)
    setErr(null)
    setProgress({ current: 0, total })
    const bump = () => setProgress((p) => (p ? { ...p, current: Math.min(p.current + 1, p.total) } : p))
    try {
      const idByIndex = new Map<number, string>()
      for (const item of persons) {
        idByIndex.set(item.index, await upsertPerson(item.index, item.person))
        bump()
      }
      // Relationship links between two imported people (server auto-derives the inverse).
      for (const l of share.payload.links) {
        const aId = idByIndex.get(l.aIndex)
        const bId = idByIndex.get(l.bIndex)
        if (aId && bId) {
          await api('cercle-links', { method: 'POST', body: { aId, aKind: 'contact', bId, bKind: 'contact', type: l.type } })
          bump()
        }
      }
      // Pets: create each, then link it to its owner (fallback to the first imported
      // person when the owner wasn't imported), so the animal lands in the family.
      const firstId = idByIndex.values().next().value as string | undefined
      for (const item of petsSel) {
        const photoKey = await copyPhotoToOwn(item.pet.photoKey)
        const ownerId = idByIndex.get(item.pet.ownerIndex) ?? firstId
        const res = await api<{ id: string }>('pets', {
          method: 'POST',
          body: { name: item.pet.name, species: item.pet.species || undefined, photoKey: photoKey ?? undefined },
        })
        if (ownerId) {
          await api('cercle-links', { method: 'POST', body: { aId: ownerId, aKind: 'contact', bId: res.id, bKind: 'pet', type: 'owner' } })
        }
        bump()
      }
      // Carry the shared family's NAME as an explicit family group, so people land
      // grouped even if the relationship edges alone wouldn't cluster them. Best-effort.
      const importedIds = [...idByIndex.values()]
      if (share.label && importedIds.length > 1) {
        try {
          const g = await api<{ id: string }>('cercle-groups', { method: 'POST', body: { name: share.label, kind: 'family' } })
          bump()
          for (const pid of importedIds) {
            await api('cercle-groups', { method: 'POST', body: { groupId: g.id, personId: pid, personKind: 'contact' } })
            bump()
          }
        } catch {
          /* the people + links already merged; the group label is a nicety */
        }
      }

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
        ) : notFound || !share ? (
          <EmptyState>{t.familyShare.notFound}</EmptyState>
        ) : progress ? (
          <div className="cercle-share-preview">
            <p className="mono">{t.familyShare.adding}</p>
            <progress className="cercle-import__bar" value={progress.current} max={progress.total} />
            <p className="mono">{progress.current} / {progress.total}</p>
          </div>
        ) : done ? (
          <StatusMessage tone="success">{t.familyShare.added}</StatusMessage>
        ) : (
          <>
            <div className="cercle-share-preview">
              <p className="cercle-share-preview__from mono">{t.familyShare.from(share.sourceName || t.cercle.memberBadge)}</p>
              {share.label && <h3 className="cercle-share-preview__label">{share.label}</h3>}
              <p className="operator__hint mono">{t.familyShare.importIntro}</p>
              <p className="mono">
                {t.familyShare.peopleN(1 + share.payload.household.length)}
                {share.payload.pets.length > 0 ? ` · ${share.payload.pets.length} 🐾` : ''}
              </p>
              {err && <StatusMessage tone="error">{err}</StatusMessage>}
              <button type="button" className="btn btn--primary" onClick={() => openReview(share.payload)}>
                <Icon name="check-bold" size={16} /> {t.familyShare.reviewAdd}
              </button>
            </div>

            <ReviewChecklist<ReviewItem>
              open={reviewing}
              onClose={() => setReviewing(false)}
              title={share.label || t.familyShare.importTitle}
              items={items}
              renderItem={(item) =>
                item.kind === 'pet' ? (
                  <>
                    <Avatar kind={item.pet.photoKey ? 'photo' : null} photo={item.pet.photoKey} colour="#C7873F" name={item.pet.name} size={28} />
                    <span className="review__name">{item.pet.name}</span>
                    <span className="review__sub mono">{item.pet.species || t.familyShare.petFallback}</span>
                  </>
                ) : (
                  <>
                    <Avatar kind={item.person.photoKey ? 'photo' : null} photo={item.person.photoKey} colour="#2A8F85" name={item.person.firstName} size={28} />
                    <span className="review__name">{displayName(item.person)}</span>
                    <span className="review__sub mono">
                      {item.relType ? genderedRelLabel(item.relType, item.person.gender, lang) : ''}
                    </span>
                    {item.candidate && (
                      <button
                        type="button"
                        className={'chip intake-review__merge' + (decision[item.index] !== 'new' ? ' is-on' : '')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDecision((d) => ({ ...d, [item.index]: d[item.index] === 'new' ? matchKey(item.candidate!) : 'new' }))
                        }}
                      >
                        <Icon name={decision[item.index] !== 'new' ? 'check-bold' : 'plus-bold'} size={12} />
                        {decision[item.index] !== 'new' ? t.familyShare.mergeInto(item.candidate.name) : t.familyShare.createNew}
                      </button>
                    )}
                  </>
                )
              }
              onApply={(sel) => void merge(sel)}
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
