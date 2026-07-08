import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Cluster } from '../Layout'
import { useT } from '../../i18n'
import { useOnline } from '../../lib/online'
import { useConfirm } from '../../lib/confirm'
import { api } from '../../lib/api'
import { SAMPLE_KEY } from '../../lib/queryKeys'

// The Réglages home for the demo/sample data (onboarding Phase 1). The board banner
// is the primary keep/clear surface, but once it's dismissed (« Garder ») the
// operator still needs a way to clear the examples later — and a way to bring them
// back on an empty household. This is that persistent control, living in the Guide
// (Réglages ▸ Guide) beside the onboarding-reset affordances. Operator-only by
// virtue of Réglages; clearing removes ONLY is_sample rows (never your own).
export function SampleDataControls() {
  const t = useT()
  const online = useOnline()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  const q = useQuery({ queryKey: SAMPLE_KEY, queryFn: () => api<{ count: number }>('seed') })
  if (q.isPending) return null // don't flash present/absent before the count settles
  const count = q.data?.count ?? 0

  const load = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api('seed', { method: 'POST' })
      await qc.invalidateQueries()
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    if (busy) return
    const okay = await confirm({ message: t.sample.clearConfirm, confirmLabel: t.sample.clear, tone: 'danger' })
    if (!okay) return
    setBusy(true)
    try {
      await api('seed', { method: 'DELETE' })
      await qc.invalidateQueries()
    } finally {
      setBusy(false)
    }
  }

  // « Essaie sans peur » one-tap reset (bmad/08 A-8): put the demo family back
  // to its pristine state — clear the is_sample rows, reseed with today's dates.
  // Touches ONLY demo rows (both calls are is_sample-scoped), so no confirm-with-
  // danger ceremony: it's the fear-free "start the sandbox over" button.
  const reset = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api('seed', { method: 'DELETE' })
      await api('seed', { method: 'POST' })
      await qc.invalidateQueries()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="guide__sample">
      <h3 className="guide__group-title">{t.sample.manageTitle}</h3>
      <p className="guide__sample-line">{count > 0 ? t.sample.present : t.sample.absent}</p>
      {count > 0 ? (
        <Cluster>
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset} disabled={busy || !online}>
            {busy ? t.sample.resetting : t.sample.reset}
          </button>
          <button type="button" className="btn btn--danger btn--sm" onClick={clear} disabled={busy || !online}>
            {busy ? t.sample.clearing : t.sample.clear}
          </button>
        </Cluster>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={busy || !online}>
          {t.sample.load}
        </button>
      )}
    </div>
  )
}
