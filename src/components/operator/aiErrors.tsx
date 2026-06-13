import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'

// The AI error journal (migration 0029 / functions/api/ai-errors). Failures the
// family acknowledged on-screen land here so the operator can read what broke and
// when — then clear it. A maintenance log, not a metric: no counts to chase, it
// just empties when you press Effacer (NFR-CALM).
interface AiErrorRow {
  id: string
  feature: string
  message: string
  created_at: number
}

export function AiErrorLogSection() {
  const t = useT()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['ai-errors'],
    queryFn: () => api<{ errors: AiErrorRow[] }>('ai-errors'),
  })
  const errors = data?.errors ?? []

  async function clearAll() {
    await api('ai-errors', { method: 'DELETE' }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['ai-errors'] })
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.aiLogTitle}</h2>
      <p className="mono">{t.operator.aiLogHint}</p>
      {errors.length === 0 ? (
        <p className="board__empty mono">{t.operator.aiLogEmpty}</p>
      ) : (
        <>
          <ul className="ai-log">
            {errors.map((e) => (
              <li key={e.id} className="ai-log__row">
                <div className="ai-log__head mono">
                  <span className="ai-log__feature">{e.feature}</span>
                  <span className="ai-log__when">{new Date(e.created_at * 1000).toLocaleString()}</span>
                </div>
                <div className="ai-log__msg">{e.message}</div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--ghost" onClick={clearAll}>
            {t.operator.aiLogClear}
          </button>
        </>
      )}
    </section>
  )
}
