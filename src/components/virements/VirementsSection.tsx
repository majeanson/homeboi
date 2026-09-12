// B-11 (bmad/10): this section's styles are NOT in the eager shell — loaded here,
// by their only consumer, so a household that never opens the tab never pays for it.
import '../../styles/virements.css'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT, useLang } from '../../i18n'
import { isUnauthorized } from '../../lib/api'
import { useProfile } from '../../lib/profile'
import { useSurface } from '../../lib/surface'
import { isGuest } from '../../lib/device'
import { facesFromCercleMembers } from '../../lib/faces'
import { formatMoneyExact } from '../../lib/money'
import { formatDayMaybeYear } from '../../lib/format'
import { TRANSFERS_KEY } from '../../lib/queryKeys'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildTransfer } from '../detail/adapters'
import { useTransfers, useDeleteTransfer, type Transfer } from '../../lib/transfers'
import type { Member } from '../../lib/cercle'
import { Avatar } from '../Avatar'
import { Cluster } from '../Layout'
import { EmptyState } from '../EmptyState'
import { LoadError } from '../LoadError'
import { ListRow } from '../ListRow'
import { Skeleton } from '../Skeleton'
import { PairPrompt } from '../Fallback'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { PlanCard } from './PlanCard'

// « Les virements » — the second face of the Notes tab (?section=virements).
//
// What it answers, top to bottom: what we agreed to (the plan cards), the arithmetic
// behind it if there is any (folded), and what has actually been sent (the history).
// Logging one happens in the ＋ composer, which is a full-screen scene: a transfer is
// a multi-field form and a height-capped sheet strands its inputs under the phone
// keyboard (the FORM_ROUTES convention).
//
// The face is the SAME device profile as the notes board and the board's
// « Aujourd'hui » row (lib/profile) — "who am I today" is answered once, app-wide.
// Here it means « whose transfers am I looking at, and whose due dates count as
// already sent ». Maisonnée shows everyone's, which is the point of a shared account.
export function VirementsSection({ members }: { members: Member[] }) {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const { surface } = useSurface()
  const { memberId: face, setMemberId: setFace } = useProfile()
  const ro = isGuest()
  const v = t.virements

  const { data, error, refetch } = useTransfers()
  const detail = useEntityDetail()
  const del = useDeleteTransfer()
  // A polled list: hide the row now, hold the write behind the undo toast, and wait
  // for a refetch before un-hiding. Optimistically patching the cache instead would
  // let the next poll resurrect the row mid-undo (the documented flash-back).
  const removal = useDeferredRemoval(TRANSFERS_KEY)

  const faces: MemberFace[] = useMemo(() => facesFromCercleMembers(members), [members])

  const plans = data?.plans ?? []
  const allTransfers = data?.transfers ?? []
  // A face narrows the history to its own sends; Maisonnée shows the whole account.
  const visible = useMemo(
    () => removal.visible(face ? allTransfers.filter((x) => x.memberId === face) : allTransfers),
    [allTransfers, face, removal],
  )

  if (isUnauthorized(error)) return <PairPrompt />
  // A failed read with nothing cached must say so. An empty list here would read as
  // « you have never sent anything », which is a lie about money.
  if (error && !data) return <LoadError onRetry={() => void refetch()} />
  if (!data) return <Skeleton count={3} />

  const nameOf = (id: string | null) => (id ? (faces.find((f) => f.id === id)?.name ?? null) : null)

  const remove = (tr: Transfer) => removal.remove([tr.id], v.deleted, () => del(tr.id))

  // THE ROW'S DOORS LIVE IN THE PEEK, because `ListRow` has exactly two shapes and they
  // are exclusive: give it `onActivate` and the whole row becomes ONE button, and the
  // `actions` you also passed are dropped on the floor. I passed both, so the transfer
  // had no ✏️, no 🗑 — and the peek had none either, because `buildTransfer`'s options
  // were never wired. There was no way to edit a transfer at all (Marc, 2026-09-12:
  // « i cant redit the transfer »). One tap opens the peek; the peek carries the doors,
  // which is the app's own convention for a compact row (ACTIONS.md, door #8).
  const openPeek = (tr: Transfer) =>
    detail.open(
      buildTransfer(
        tr,
        { t, lang, plans, members },
        ro ? undefined : { onEdit: () => nav(`/virement/${tr.id}/edit`), onDelete: () => remove(tr) },
      ),
    )

  return (
    <section className="virements">
      <Cluster className="virements__bar">
        {surface === 'kiosk' ? (
          <MemberSwitcher faces={faces} value={face} onChange={setFace} allLabel={t.cercle.familyNotes.scopeFamily} ariaLabel={v.sender} />
        ) : (
          <div className="virements__face">
            <FaceSelect faces={faces} value={face} onChange={setFace} allLabel={t.cercle.familyNotes.scopeFamily} ariaLabel={v.sender} />
          </div>
        )}
      </Cluster>

      {plans.length === 0 ? (
        // The one door worth offering here: there is nothing to compose against until
        // an agreement exists, so the empty state IS the call to write one.
        <EmptyState action={ro ? undefined : { to: '/virement/plan/new', label: v.addPlan, icon: 'plus-bold' }}>
          {v.emptyPlans}
        </EmptyState>
      ) : (
        <div className="virements__plans">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} transfers={allTransfers} members={members} face={face} today={data.today} readOnly={ro} />
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        plans.length > 0 && <EmptyState>{v.emptyTransfers}</EmptyState>
      ) : (
        <ul className="virements__list">
          {visible.map((tr) => {
            const who = nameOf(tr.memberId)
            const m = tr.memberId ? members.find((x) => x.id === tr.memberId) : undefined
            return (
              <li key={tr.id}>
                <ListRow
                  leading={
                    <Avatar
                      kind={m?.avatarKind}
                      photo={m?.avatarRef}
                      colour={m?.colour ?? null}
                      name={who ?? ''}
                      size={32}
                    />
                  }
                  title={`${formatMoneyExact(tr.totalCents, lang)} · ${formatDayMaybeYear(tr.sentAt, lang)}`}
                  // The memo is the line that makes a row recognisable months later —
                  // it is the same text the bank statement shows.
                  subtitle={tr.memo || tr.reference || undefined}
                  onActivate={() => openPeek(tr)}
                  activateLabel={v.title}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
