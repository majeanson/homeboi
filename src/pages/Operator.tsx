import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

// Operator hub (phone/laptop, logged in). The control surface that a kiosk is
// NOT allowed to reach: members, device pairing approval + revocation, chores,
// kid routines. Each section is a thin CRUD strip — no dashboards, no metrics,
// nothing to optimize-against (NFR-CALM).
interface Member { id: string; display_name: string; is_child: number; avatar_ref: string }
interface Device { id: string; label: string; created_at: number; last_seen_at: number | null; revoked_at: number | null }
interface Chore { id: string; title: string }
interface Routine { id: string; name: string; memberName: string | null }

export function Operator() {
  const t = useT()
  const nav = useNavigate()
  const { loading, signedIn, household, signOut } = useAuth()
  const [ai, setAi] = useState<boolean | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])

  const load = useCallback(async () => {
    const [m, d, c, r, h] = await Promise.all([
      api<{ members: Member[] }>('members').catch(() => ({ members: [] })),
      api<{ devices: Device[] }>('pair/devices').catch(() => ({ devices: [] })),
      api<{ chores: Chore[] }>('chores').catch(() => ({ chores: [] })),
      api<{ routines: Routine[] }>('routines').catch(() => ({ routines: [] })),
      api<{ ai: boolean }>('health').catch(() => ({ ai: false })),
    ])
    setMembers(m.members)
    setDevices(d.devices)
    setChores(c.chores)
    setRoutines(r.routines)
    setAi(h.ai)
  }, [])

  useEffect(() => {
    if (!loading && !signedIn) nav('/login')
  }, [loading, signedIn, nav])

  useEffect(() => {
    if (signedIn) load()
  }, [signedIn, load])

  if (loading || !signedIn) return <p className="loading mono">{t.common.loading}</p>

  return (
    <div className="page">
      <TopBar>
        <Link to="/board" className="btn btn--ghost mono">
          {t.nav.board}
        </Link>
        <button type="button" className="btn btn--ghost mono" onClick={() => signOut().then(() => nav('/'))}>
          {t.nav.logout}
        </button>
      </TopBar>

      <main className="operator">
        <div className="operator__head">
          <h1>{t.operator.title}</h1>
          <div className="operator__meta mono">
            <span>{household?.name}</span>
            <span className={`tag ${ai ? 'tag--on' : 'tag--off'}`}>{ai ? t.operator.aiOn : t.operator.aiOff}</span>
          </div>
        </div>

        <ClaimTablet onClaimed={load} />

        <MembersSection members={members} onChange={load} />
        <DevicesSection devices={devices} onChange={load} />
        <ChoresSection chores={chores} members={members} onChange={load} />
        <RoutinesSection routines={routines} members={members} onChange={load} />
      </main>
    </div>
  )
}

function ClaimTablet({ onClaimed }: { onClaimed: () => void }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
        <button type="submit" className="btn btn--primary" disabled={code.length !== 6}>
          {t.pair.claimSubmit}
        </button>
      </form>
      {ok && <p className="capture__routed mono">{t.pair.claimOk}</p>}
      {err && <p className="error mono">{err}</p>}
    </section>
  )
}

function MembersSection({ members, onChange }: { members: Member[]; onChange: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const [isChild, setIsChild] = useState(false)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await api('members', { method: 'POST', body: { name: name.trim(), isChild } }).catch(() => {})
    setName('')
    setIsChild(false)
    onChange()
  }
  async function remove(id: string) {
    await api('members', { method: 'DELETE', body: { id } }).catch(() => {})
    onChange()
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.members}</h2>
      <ul className="operator__list">
        {members.map((m) => (
          <li key={m.id}>
            <span className="operator__avatar" style={{ background: m.avatar_ref }} aria-hidden="true" />
            <span>{m.display_name}</span>
            {m.is_child ? <span className="tag mono">{t.operator.isChild}</span> : null}
            <button type="button" className="btn btn--ghost mono operator__del" onClick={() => remove(m.id)}>
              {t.operator.delete}
            </button>
          </li>
        ))}
      </ul>
      <form className="operator__inline-form" onSubmit={add}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.operator.name}
        />
        <label className="operator__check mono">
          <input type="checkbox" checked={isChild} onChange={(e) => setIsChild(e.target.checked)} />
          {t.operator.isChild}
        </label>
        <button type="submit" className="btn" disabled={!name.trim()}>
          {t.operator.addMember}
        </button>
      </form>
    </section>
  )
}

function DevicesSection({ devices, onChange }: { devices: Device[]; onChange: () => void }) {
  const t = useT()
  const active = devices.filter((d) => !d.revoked_at)
  async function revoke(id: string) {
    await api('pair/devices', { method: 'POST', body: { revokeId: id } }).catch(() => {})
    onChange()
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
              <button type="button" className="btn btn--ghost mono operator__del" onClick={() => revoke(d.id)}>
                {t.operator.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ChoresSection({
  chores,
  members,
  onChange,
}: {
  chores: Chore[]
  members: Member[]
  onChange: () => void
}) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [rotation, setRotation] = useState<string[]>([])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await api('chores', { method: 'POST', body: { title: title.trim(), rotation } }).catch(() => {})
    setTitle('')
    setRotation([])
    onChange()
  }
  async function remove(id: string) {
    await api('chores', { method: 'DELETE', body: { id } }).catch(() => {})
    onChange()
  }
  function toggleRot(id: string) {
    setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.chores}</h2>
      <ul className="operator__list">
        {chores.map((c) => (
          <li key={c.id}>
            <span>{c.title}</span>
            <button type="button" className="btn btn--ghost mono operator__del" onClick={() => remove(c.id)}>
              {t.operator.delete}
            </button>
          </li>
        ))}
      </ul>
      <form className="operator__inline-form operator__chore-form" onSubmit={add}>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.operator.addChore}
        />
        <div className="operator__rotation mono">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`btn btn--ghost${rotation.includes(m.id) ? ' is-active' : ''}`}
              onClick={() => toggleRot(m.id)}
            >
              {rotation.includes(m.id) ? `${rotation.indexOf(m.id) + 1}. ` : ''}
              {m.display_name}
            </button>
          ))}
        </div>
        <button type="submit" className="btn" disabled={!title.trim()}>
          {t.operator.addChore}
        </button>
      </form>
    </section>
  )
}

function RoutinesSection({
  routines,
  members,
  onChange,
}: {
  routines: Routine[]
  members: Member[]
  onChange: () => void
}) {
  const t = useT()
  const children = members.filter((m) => m.is_child)
  const [memberId, setMemberId] = useState('')
  const [name, setName] = useState('')
  const [cardsRaw, setCardsRaw] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!memberId || !name.trim()) return
    // "🪥 brosse,👕 habille" -> [{icon:'🪥', label:'brosse', narration:'brosse'}]
    const cards = cardsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((chunk) => {
        const parts = chunk.split(/\s+/)
        const icon = parts[0]
        const label = parts.slice(1).join(' ') || parts[0]
        return { icon, label, narration: label }
      })
    await api('routines', { method: 'POST', body: { memberId, name: name.trim(), cards } }).catch(() => {})
    setName('')
    setCardsRaw('')
    setMemberId('')
    onChange()
  }
  async function remove(id: string) {
    await api('routines', { method: 'DELETE', body: { id } }).catch(() => {})
    onChange()
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.routines}</h2>
      <ul className="operator__list">
        {routines.map((r) => (
          <li key={r.id}>
            <span>
              {r.name}
              {r.memberName ? ` · ${r.memberName}` : ''}
            </span>
            <button type="button" className="btn btn--ghost mono operator__del" onClick={() => remove(r.id)}>
              {t.operator.delete}
            </button>
          </li>
        ))}
      </ul>
      <form className="operator__inline-form operator__routine-form" onSubmit={add}>
        <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">{t.operator.isChild}…</option>
          {children.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.operator.routineName}
        />
        <input
          className="input operator__cards"
          value={cardsRaw}
          onChange={(e) => setCardsRaw(e.target.value)}
          placeholder={t.operator.cardsHint}
        />
        <button type="submit" className="btn" disabled={!memberId || !name.trim()}>
          {t.operator.addRoutine}
        </button>
      </form>
    </section>
  )
}
