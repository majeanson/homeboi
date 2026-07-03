import { useState } from 'react'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useUndoableRemove } from '../../lib/undoRemove'
import { isGuest } from '../../lib/device'
import { DEVICES_KEY } from '../../lib/queryKeys'
import { InlineIcon } from '../Icon'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'
import { ListRow } from '../ListRow'
import { EmptyState } from '../EmptyState'
import { StatusMessage } from '../StatusMessage'
import { OperatorSection } from './OperatorSection'
import { type Device } from './types'

export function ClaimTablet({ onClaimed }: { onClaimed: () => void }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Read-only guest: pairing a tablet is a write — hide the whole claim section.
  if (isGuest()) return null

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
    <OperatorSection title={t.pair.claimTitle} hint={t.pair.claimLead} className="operator__claim">
      <form className="operator__inline-form" onSubmit={submit}>
        <input
          className="input"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ''))
            // Clear stale feedback as soon as a new code is typed — otherwise the
            // « pairé ✓ » success banner lingered until the next submit.
            if (ok) setOk(false)
            if (err) setErr(null)
          }}
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
      {ok && <StatusMessage tone="success">{t.pair.claimOk}</StatusMessage>}
      {err && <StatusMessage tone="error">{err}</StatusMessage>}
    </OperatorSection>
  )
}

export function DevicesSection({ devices, onChange }: { devices: Device[]; onChange: () => void }) {
  const t = useT()
  const undoableRemove = useUndoableRemove()
  const active = devices.filter((d) => !d.revoked_at)
  // A mis-tapped revoke forces someone to re-pair the wall tablet — defer it
  // behind the undo toast like the other destructive rows. (Revoke IS the
  // device's delete; the trash glyph reads the same as everywhere.)
  function revoke(d: Device) {
    undoableRemove({
      queryKey: DEVICES_KEY,
      listProp: 'devices',
      id: d.id,
      label: d.label,
      commit: () => api('pair/devices', { method: 'POST', body: { revokeId: d.id } }),
      after: onChange,
    })
  }
  return (
    <OperatorSection title={t.operator.devices}>
      {active.length === 0 ? (
        <EmptyState>{t.operator.noDevices}</EmptyState>
      ) : (
        <ul className="operator__list">
          {active.map((d) => (
            <DeviceRow key={d.id} device={d} onChange={onChange} onRevoke={() => revoke(d)} />
          ))}
        </ul>
      )}
    </OperatorSection>
  )
}

// One device row: the label, with the uniform edit (rename) / delete (revoke)
// pair. Editing swaps the label for an inline input — the rename is the device's
// only mutable field, so a full form would be overkill.
function DeviceRow({ device, onChange, onRevoke }: { device: Device; onChange: () => void; onRevoke: () => void }) {
  const t = useT()
  const write = useWrite()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(device.label)
  const [busy, setBusy] = useState(false)

  async function save() {
    const next = label.trim()
    if (!next || busy) return
    setBusy(true)
    setEditing(false)
    // Through useWrite: optimistic rename now (guest-safe, auto-revert on a server
    // reject), offline-queued instead of lost when offline, then the invalidate
    // reconciles. (The old path called api() directly, skipping the outbox.)
    await write('pair/devices', {
      method: 'PATCH',
      body: { id: device.id, label: next },
      affectedKeys: [DEVICES_KEY],
      optimistic: (qc) =>
        qc.setQueryData<{ devices: Device[] }>(DEVICES_KEY, (data) =>
          data ? { devices: data.devices.map((x) => (x.id === device.id ? { ...x, label: next } : x)) } : data,
        ),
    }).catch(() => {})
    onChange()
    setBusy(false)
  }

  if (editing)
    return (
      <li>
        <EditField
          value={label}
          onChange={setLabel}
          onSubmit={() => save()}
          submitLabel={t.common.save}
          busy={busy}
          clearable={false}
          onCancel={() => {
            setLabel(device.label)
            setEditing(false)
          }}
          ariaLabel={t.pair.label}
          autoFocus
        />
      </li>
    )

  return (
    <li>
      <ListRow
        leading={<InlineIcon name="device-mobile-bold" />}
        title={device.label}
        actions={
          <RowActions
            onEdit={() => setEditing(true)}
            onDelete={onRevoke}
            editLabel={t.operator.renameDevice}
            deleteLabel={t.operator.revoke}
          />
        }
      />
    </li>
  )
}
