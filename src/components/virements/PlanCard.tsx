import { useNavigate } from 'react-router-dom'
import { useT, useLang } from '../../i18n'
import { formatMoneyExact } from '../../lib/money'
import { formatDay } from '../../lib/format'
import { recurLabel } from '../../lib/recurLabel'
import { Avatar } from '../Avatar'
import { Chip } from '../Chip'
import { Cluster, Rail } from '../Layout'
import { RowActions } from '../RowActions'
import { CatchupMath } from './CatchupMath'
import type { TransferPlan, Transfer } from '../../lib/transfers'
import { coveredDueDates } from '../../lib/transfers'
import type { Member } from '../../lib/cercle'

// One standing agreement: what it is, who sends what, and which dates are coming.
//
// Attribution is FACES + the amount each one sends — never a ranking, never a
// running total per person (the chore-ledger rule, NFR-CALM-1). Two people who split
// a payment unevenly read as two faces with two numbers, which is what they agreed
// to, not as a comparison.
export function PlanCard({
  plan,
  transfers,
  members,
  face,
  today,
  readOnly,
}: {
  plan: TransferPlan
  transfers: Transfer[]
  members: Member[]
  /** The acting face — decides which due dates read as already sent. */
  face: string | null
  today: number
  readOnly?: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const v = t.virements

  const covered = coveredDueDates(transfers, plan.id, face)
  // What is coming: the next few due dates from today on. Past ones live in the
  // composer (« which have I not sent for yet »), not on the card — a card that
  // listed everything overdue would be a nag, and the « À régler » signal already
  // carries that job once.
  const upcoming = plan.due.filter((at) => at >= today).slice(0, 4)

  const shareEntries = Object.entries(plan.shares)

  return (
    <article className="virements__plan card" style={plan.colour ? { borderLeftColor: plan.colour } : undefined}>
      <header className="virements__plan-head">
        <div className="virements__plan-title">
          <h3>{plan.title}</h3>
          <p className="mono">
            {v.planSummary(
              plan.amountCents != null ? formatMoneyExact(plan.amountCents, lang) : '',
              recurLabel(plan.recur ? JSON.stringify(plan.recur) : null, t),
            )}
          </p>
        </div>
        <RowActions
          readOnly={readOnly}
          onEdit={() => nav(`/virement/plan/${plan.id}/edit`)}
          editLabel={v.editPlan}
        />
      </header>

      {/* Who sends what — a face and its amount, side by side. */}
      {shareEntries.length > 0 && (
        <Cluster className="virements__shares">
          {shareEntries.map(([memberId, cents]) => {
            const m = members.find((x) => x.id === memberId)
            return (
              <span className="virements__share" key={memberId}>
                {/* The RAW avatar ref — Avatar resolves it through imgUrl itself, so a
                    pre-resolved MemberFace.photoUrl would be wrapped twice. */}
                <Avatar kind={m?.avatarKind} photo={m?.avatarRef} colour={m?.colour ?? null} name={m?.displayName ?? '?'} size={28} />
                <span className="virements__share-text">
                  <span>{m?.displayName ?? '?'}</span>
                  <span className="mono">{formatMoneyExact(cents, lang)}</span>
                </span>
              </span>
            )
          })}
        </Cluster>
      )}

      {/* The dates coming up. A Rail (never a hand-rolled flex row) so a long series
          scrolls on one line on a phone instead of bleeding off the right edge. */}
      {upcoming.length > 0 && (
        <Rail className="virements__dates" role="group" aria-label={v.nextDates}>
          {upcoming.map((at) => (
            <Chip key={at} icon={covered.has(at) ? 'check-bold' : undefined}>
              {formatDay(at, lang)}
            </Chip>
          ))}
        </Rail>
      )}

      {plan.projection && <CatchupMath projection={plan.projection} members={members} today={today} />}
    </article>
  )
}
