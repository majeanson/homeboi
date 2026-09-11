import { useNavigate, useParams } from 'react-router-dom'
import '../styles/virements.css'
import { FormScene } from '../components/FormScene'
import { Loading } from '../components/Fallback'
import { TransferForm } from '../components/forms/TransferForm'
import { PlanForm } from '../components/forms/PlanForm'
import { useT } from '../i18n'
import { useTransfers } from '../lib/transfers'

// /virement/new · /virement/:id/edit — logging a transfer as a full-screen scene.
//
// A scene, not a sheet: this is a tall multi-field form (sender, date, a row of
// date chips per plan, a top-up, free lines, the memo, the reference), and a
// height-capped sheet strands its inputs under the phone keyboard. That is the
// FORM_ROUTES convention every other operator form already follows.
//
// FormScene bounces a device with no session, which is also the guest guard: the
// transfer endpoints are operator-scoped, so a kiosk or a link guest that deep-linked
// here would otherwise meet a form whose save could only ever 403.
const FALLBACK = '/notes?section=virements'

export function TransferFormPage() {
  const t = useT()
  const nav = useNavigate()
  const { id } = useParams()
  const { data } = useTransfers()
  const transfer = id ? (data?.transfers.find((x) => x.id === id) ?? null) : null

  return (
    <FormScene card="notes" title={id ? t.virements.edit : t.virements.add} icon="receipt-bold" fallback={FALLBACK}>
      {(members, close) =>
        // WAIT for the read model. The composer seeds its ticked dates ONCE, from the
        // plans — rendering it against an empty list seeds nothing, and the form does
        // not remount when the data lands, so every date arrived unticked and the memo
        // came out with no mortgage line at all. Caught by e2e/virements.spec.ts, which
        // is the whole reason that spec asserts the ticks rather than just the fields.
        // `Loading`, not `Skeleton`: a form scene is one record, not a known shape.
        !data ? (
          <Loading />
        ) : (
        <TransferForm
          // Re-init the fields once the edited row arrives from the cache/poll.
          key={transfer?.id ?? 'new'}
          value={transfer}
          plans={data?.plans ?? []}
          transfers={data?.transfers ?? []}
          today={data?.today ?? 0}
          members={members}
          onSaved={close}
          onDeleted={() => nav(FALLBACK, { replace: true })}
          onCancel={close}
        />
        )
      }
    </FormScene>
  )
}

// /virement/plan/new · /virement/plan/:id/edit — the standing agreement.
export function TransferPlanFormPage() {
  const t = useT()
  const nav = useNavigate()
  const { id } = useParams()
  const { data } = useTransfers()
  const plan = id ? (data?.plans.find((x) => x.id === id) ?? null) : null

  return (
    <FormScene card="notes" title={id ? t.virements.editPlan : t.virements.addPlan} icon="receipt-bold" fallback={FALLBACK}>
      {(members, close) =>
        id && !data ? (
          <Loading />
        ) : (
        <PlanForm
          key={plan?.id ?? 'new'}
          value={plan}
          members={members}
          onSaved={close}
          onDeleted={() => nav(FALLBACK, { replace: true })}
          onCancel={close}
        />
        )
      }
    </FormScene>
  )
}
