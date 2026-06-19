import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { EmptyState } from '../EmptyState'
import { api, ApiError, isStatus } from '../../lib/api'
import { isGuest } from '../../lib/device'
import { Icon } from '../Icon'

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

// One model's live-check result (functions/api/ai-test → _lib/ai pingTextModel /
// pingVisionModel). The labels come from the row index (text first, vision second).
interface AiCheck {
  ok: boolean
  ms: number
  model: string
  detail: string
}

// A "does it actually work?" probe that sits ABOVE the error log: instead of
// waiting for a feature to fail and reading the journal after the fact, the
// operator presses Tester l'IA and gets a live pass/fail per model right now.
function AiStatusTest({ help }: { help?: HelpMode }) {
  const t = useT()
  const [checks, setChecks] = useState<AiCheck[] | null>(null)
  const [running, setRunning] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  async function run() {
    setRunning(true)
    setUnavailable(false)
    try {
      const res = await api<{ checks: AiCheck[] }>('ai-test', { method: 'POST' })
      setChecks(res.checks)
    } catch (e) {
      // 503 = no AI binding on this deployment; say so plainly instead of erroring.
      if (isStatus(e, 503)) {
        setUnavailable(true)
        setChecks(null)
      } else if (!(e instanceof ApiError)) {
        throw e
      }
    } finally {
      setRunning(false)
    }
  }

  // The two probes map to the two models, in the order the endpoint returns them.
  const labelFor = (i: number) => (i === 0 ? t.operator.aiTestText : t.operator.aiTestVision)

  return (
    <OperatorSection title={t.operator.aiTestTitle} help={help} helpKey="aiTest">
      {!isGuest() && (
        <button type="button" className="btn btn--primary" onClick={run} disabled={running} aria-busy={running}>
          {running ? t.operator.aiTestRunning : t.operator.aiTestBtn}
        </button>
      )}

      {unavailable && <EmptyState>{t.operator.aiTestUnavailable}</EmptyState>}

      {checks && (
        <ul className="ai-test">
          {checks.map((c, i) => (
            <li key={c.model} className={'ai-test__row' + (c.ok ? ' is-ok' : ' is-fail')}>
              <span className="ai-test__icon" aria-hidden="true">
                <Icon name={c.ok ? 'check-bold' : 'x-bold'} size={18} />
              </span>
              <span className="ai-test__body">
                <span className="ai-test__label">
                  {labelFor(i)}
                  <span className="ai-test__verdict mono">
                    {c.ok ? `${t.operator.aiTestOk} · ${c.ms} ms` : t.operator.aiTestFail}
                  </span>
                </span>
                <span className="ai-test__detail mono">{c.detail}</span>
                <span className="ai-test__model mono">{c.model}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </OperatorSection>
  )
}

export function AiErrorLogSection({ help }: { help?: HelpMode }) {
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
    <>
      <AiStatusTest help={help} />
      <OperatorSection title={t.operator.aiLogTitle} help={help} helpKey="aiLog">
        {errors.length === 0 ? (
          <EmptyState>{t.operator.aiLogEmpty}</EmptyState>
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
            {!isGuest() && (
              <button type="button" className="btn btn--ghost" onClick={clearAll}>
                {t.operator.aiLogClear}
              </button>
            )}
          </>
        )}
      </OperatorSection>
    </>
  )
}
