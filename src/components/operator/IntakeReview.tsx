// B-11 (bmad/10) — intake.css moved out of the eager shell (uniquely-named
// .intake-review__ classes); load it whenever this operator section renders.
import '../../styles/intake.css'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api } from '../../lib/api'
import { useConfirm } from '../../lib/confirm'
import { INTAKE_KEY } from '../../lib/queryKeys'
import { type PendingIntake } from '../../lib/intake'
import { displayName } from '../../lib/ficheMerge'
import { Icon } from '../Icon'

// Family-info forms relatives sent back (the 'intake' share kind), waiting in
// quarantine. Lives in Réglages ▸ Système ▸ Appareils & accès. Calm: a passive
// "N fiches à réviser" count, never a push.
//
// Only the QUEUE lives here since 2026-09-29. « Réviser » opens the one review screen
// for a family coming in — /cercle/import?intake=<id>, the same scene a shared family
// opens — and the merge is lib/ficheMerge's, the one merge. This card used to carry its
// own ~150-line copy of both, which had already drifted from the other one.

export function IntakeReview({ help }: { help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  const confirm = useConfirm()

  const { data } = useQuery({
    queryKey: INTAKE_KEY,
    queryFn: () => api<{ submissions: PendingIntake[] }>('intake'),
  })
  const submissions = data?.submissions ?? []

  async function dismiss(sub: PendingIntake) {
    const okay = await confirm({ message: t.intake.dismissConfirm, confirmLabel: t.intake.dismiss, tone: 'danger' })
    if (!okay) return
    await api('intake', { method: 'PATCH', body: { id: sub.id, status: 'dismissed' } })
    qc.invalidateQueries({ queryKey: INTAKE_KEY })
  }

  if (submissions.length === 0) return null

  return (
    <OperatorSection title={`${t.intake.reviewTitle} · ${t.intake.reviewPending(submissions.length)}`} help={help} helpKey="guest">
      <p className="operator__hint mono">{t.intake.reviewHint}</p>
      <div className="intake-review">
        {submissions.map((sub) => (
          <div key={sub.id} className="intake-review__row">
            <span className="intake-review__name">{displayName(sub.self)}</span>
            <div className="row-actions">
              <Link className="btn btn--sm btn--primary" to={`/cercle/import?intake=${encodeURIComponent(sub.id)}`}>
                <Icon name="check-bold" size={15} /> {t.intake.reviewOne}
              </Link>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => void dismiss(sub)}>
                <Icon name="trash-bold" size={15} /> {t.intake.dismiss}
              </button>
            </div>
          </div>
        ))}
      </div>
    </OperatorSection>
  )
}
