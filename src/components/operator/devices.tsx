import { useState } from 'react'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useUndoableRemove } from '../../lib/undoRemove'
import { type Device } from './types'

export function ClaimTablet({ onClaimed }: { onClaimed: () => void }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr(null)
    setOk(false)
    try {
      await api('pair/claim', { method: 'POST', body: { code: code.trim(), label: label.trim() || undefined } })
      setOk(true)
      setCode('')
      setLabel('')
      onClaimed()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="surface operator__section operator__claim">
      <h2>{t.pair.claimTitle}</h2>
      <p className="lead">{t.pair.claimLead}</p>
      <form className="operator__inline-form" onSubmit={submit}>
        <input
          className="input"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          aria-label={t.pair.claimTitle}
        />
        <input
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t.pair.label}
          aria-label={t.pair.label}
        />
        <button type="submit" className="btn btn--primary" disabled={code.length !== 6 || busy}>
          {t.pair.claimSubmit}
        </button>
      </form>
      {ok && <p className="capture__routed mono">{t.pair.claimOk}</p>}
      {err && <p className="error mono">{err}</p>}
    </section>
  )
}

export function DevicesSection({ devices, onChange }: { devices: Device[]; onChange: () => void }) {
  const t = useT()
  const undoableRemove = useUndoableRemove()
  const active = devices.filter((d) => !d.revoked_at)
  // A mis-tapped revoke forces someone to re-pair the wall tablet — defer it
  // behind the undo toast like the other destructive rows.
  function revoke(d: Device) {
    undoableRemove({
      queryKey: ['devices'],
      listProp: 'devices',
      id: d.id,
      label: d.label,
      commit: () => api('pair/devices', { method: 'POST', body: { revokeId: d.id } }),
      after: onChange,
    })
  }
  return (
    <section className="surface operator__section">
      <h2>{t.operator.devices}</h2>
      {active.length === 0 ? (
        <p className="board__empty mono">{t.operator.noDevices}</p>
      ) : (
        <ul className="operator__list">
          {active.map((d) => (
            <li key={d.id}>
              <span>📱 {d.label}</span>
              <button type="button" className="btn btn--ghost mono operator__del" onClick={() => revoke(d)}>
                {t.operator.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
