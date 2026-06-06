import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, isStatus } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCalm } from '../lib/calm'
import { useAudience } from '../lib/audience'
import { getTheme, toggleTheme, type Theme } from '../lib/theme'
import { ColorPicker } from '../components/ColorPicker'
import { PALETTE } from '../lib/colors'
import { fetchGhostManage, patchGhost, deleteGhost, type GhostManageItem } from '../lib/ghost'
import { formatDay, formatTime } from '../lib/format'
import { Avatar } from '../components/Avatar'
import { EventForm } from '../components/forms/EventForm'
import { ChoreForm } from '../components/forms/ChoreForm'
import { RoutineForm } from '../components/forms/RoutineForm'
import { resizeImage, imgUrl, AVATAR_MAX, PHOTO_MAX } from '../lib/image'

// Settings is one scrollable page split into anchored sections. Each hub page's
// corner gear deep-links here with a #hash (see HubLayout), and this list also
// renders the in-page section nav. Order matches the render order below.
const SECTIONS = [
  { id: 'household', key: 'members' as const },
  { id: 'agenda', key: 'events' as const },
  { id: 'chores', key: 'chores' as const },
  { id: 'routines', key: 'routines' as const },
  { id: 'shopping', key: 'shopping' as const },
  { id: 'ghost', key: 'ghost' as const },
  { id: 'devices', key: 'devices' as const },
  { id: 'photos', key: 'photos' as const },
  { id: 'recap', key: 'recapTitle' as const },
  { id: 'display', key: 'display' as const },
  { id: 'calm', key: 'calmTitle' as const },
]

// Operator hub (phone/laptop, logged in). The control surface that a kiosk is
// NOT allowed to reach: members, device pairing approval + revocation, chores,
// kid routines. Each section is a thin CRUD strip — no dashboards, no metrics,
// nothing to optimize-against (NFR-CALM).
interface Member { id: string; display_name: string; is_child: number; avatar_ref: string; avatar_kind: string; colour: string }
interface Device { id: string; label: string; created_at: number; last_seen_at: number | null; revoked_at: number | null }
interface Chore { id: string; title: string; color?: string }
interface Routine { id: string; name: string; memberName: string | null }
interface EventRow { id: string; title: string; start_at: number; all_day: number; member_id: string | null; recur_json?: string | null }

export function Operator() {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const { loading, signedIn, household, signOut } = useAuth()
  const qc = useQueryClient()

  // Only fetch once signed in — a kiosk/anon visitor would 401. Each strip is
  // independent so one failing read never blanks the rest (data?? [] default).
  const membersQ = useQuery({ queryKey: ['members'], queryFn: () => api<{ members: Member[] }>('members'), enabled: signedIn })
  const devicesQ = useQuery({ queryKey: ['devices'], queryFn: () => api<{ devices: Device[] }>('pair/devices'), enabled: signedIn })
  const choresQ = useQuery({ queryKey: ['chores'], queryFn: () => api<{ chores: Chore[] }>('chores'), enabled: signedIn })
  const routinesQ = useQuery({ queryKey: ['routines'], queryFn: () => api<{ routines: Routine[] }>('routines'), enabled: signedIn })
  const eventsQ = useQuery({ queryKey: ['events'], queryFn: () => api<{ events: EventRow[] }>('events'), enabled: signedIn })
  const healthQ = useQuery({ queryKey: ['health'], queryFn: () => api<{ ai: boolean }>('health'), enabled: signedIn })

  const members = membersQ.data?.members ?? []
  const devices = devicesQ.data?.devices ?? []
  const chores = choresQ.data?.chores ?? []
  const routines = routinesQ.data?.routines ?? []
  const events = eventsQ.data?.events ?? []
  const ai = healthQ.data?.ai ?? null

  // Child sections call this after a write. Invalidate the settings reads plus
  // ['board'] so member/chore/routine/event edits surface on the wall at once
  // (the ['routines'] key is shared with the Routines/KidView pages too).
  const load = useCallback(() => {
    for (const key of [['members'], ['devices'], ['chores'], ['routines'], ['events'], ['health'], ['board']]) {
      qc.invalidateQueries({ queryKey: key })
    }
  }, [qc])

  useEffect(() => {
    if (!loading && !signedIn) nav('/login')
  }, [loading, signedIn, nav])

  // Which settings tab is open. A hub page's corner gear deep-links to
  // /settings#<id>, which selects the matching tab (init + on hash change).
  const [tab, setTab] = useState<string>(() => {
    const h = loc.hash.slice(1)
    return SECTIONS.some((s) => s.id === h) ? h : SECTIONS[0].id
  })
  useEffect(() => {
    const h = loc.hash.slice(1)
    if (h && SECTIONS.some((s) => s.id === h)) setTab(h)
  }, [loc.hash])

  if (loading || !signedIn) return <p className="loading mono">{t.common.loading}</p>

  return (
    <main className="operator">
      <div className="operator__head">
        <div>
          <div className="hand-tag">{t.appName}</div>
          <h1>{t.operator.title}</h1>
        </div>
        <div className="operator__meta mono">
          <span>{household?.name}</span>
          <span className={`tag ${ai ? 'tag--on' : 'tag--off'}`}>{ai ? t.operator.aiOn : t.operator.aiOff}</span>
          <button type="button" className="btn btn--ghost mono" onClick={() => signOut().then(() => nav('/'))}>
            {t.nav.logout}
          </button>
        </div>
      </div>

      <nav className="operator__tabs mono" role="tablist" aria-label={t.operator.sections}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={tab === s.id}
            className={`operator__tab${tab === s.id ? ' is-active' : ''}`}
            onClick={() => setTab(s.id)}
          >
            {t.operator[s.key]}
          </button>
        ))}
      </nav>

      <div className="operator__panel" role="tabpanel">
        {tab === 'household' && <MembersSection members={members} onChange={load} />}
        {tab === 'agenda' && <EventsSection events={events} members={members} onChange={load} />}
        {tab === 'chores' && <ChoresSection chores={chores} members={members} onChange={load} />}
        {tab === 'routines' && <RoutinesSection routines={routines} members={members} onChange={load} />}
        {tab === 'shopping' && <ShopSection />}
        {tab === 'ghost' && <GhostSection />}
        {tab === 'devices' && (
          <>
            <ClaimTablet onClaimed={load} />
            <DevicesSection devices={devices} onChange={load} />
          </>
        )}
        {tab === 'photos' && <PhotosSection />}
        {tab === 'recap' && <RecapSection />}
        {tab === 'display' && <DisplaySection />}
        {tab === 'calm' && <CalmSection />}
      </div>
    </main>
  )
}

// Display: theme, language, and the Parent/Toddler view — the chrome that used
// to live in the top header. Moved here so the hub pages stay calm and headerless.
function DisplaySection() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { audience, setAudience } = useAudience()
  const [theme, setThemeState] = useState<Theme>(() => getTheme())

  return (
    <section className="surface operator__section">
      <h2>{t.operator.display}</h2>
      <p className="lead">{t.operator.displayHint}</p>
      <div className="operator__display">
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.themeLabel}</span>
          <button type="button" className="btn" onClick={() => setThemeState(toggleTheme())}>
            {theme === 'night' ? `🌙 ${t.operator.themeNight}` : `☀️ ${t.operator.themeDay}`}
          </button>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.langLabel}</span>
          <button type="button" className="btn" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
            {lang === 'fr' ? 'Français' : 'English'}
          </button>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.viewLabel}</span>
          <div className="audience-switch mono" role="group" aria-label={t.audience.parent + ' / ' + t.audience.kid}>
            <button
              type="button"
              className={`audience-switch__opt${audience === 'parent' ? ' is-active' : ''}`}
              onClick={() => setAudience('parent')}
              aria-pressed={audience === 'parent'}
            >
              🧑 {t.audience.parent}
            </button>
            <button
              type="button"
              className={`audience-switch__opt${audience === 'toddler' ? ' is-active' : ''}`}
              onClick={() => setAudience('toddler')}
              aria-pressed={audience === 'toddler'}
            >
              👶 {t.audience.kid}
            </button>
          </div>
        </div>
      </div>
    </section>
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

// The "anti-addiction" opt-out. Default ON (the calm tenet holds); a parent can
// switch it off to stop the kid routine from dead-ending. Only governs that
// interaction friction — the structural guarantees aren't toggleable. Stored in
// localStorage for now (see bmad/04, OD-1).
function CalmSection() {
  const t = useT()
  const { calm, setCalm } = useCalm()
  return (
    <section className="surface operator__section">
      <h2>{t.operator.calmTitle}</h2>
      <p className="lead">{t.operator.calmHint}</p>
      <button
        type="button"
        className={`btn${calm ? ' btn--primary' : ''}`}
        onClick={() => setCalm(!calm)}
        aria-pressed={calm}
      >
        {t.operator.calmTitle} : {calm ? t.operator.calmOn : t.operator.calmOff}
      </button>
    </section>
  )
}

// Shopping: the household's postal code, used by the flyer/deal lookups so the
// price-match proof on the list knows where to search. Set once, used every trip.
function ShopSection() {
  const t = useT()
  const [postal, setPostal] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')

  useEffect(() => {
    api<{ postal: string | null }>('household')
      .then((r) => setPostal(r.postal ?? ''))
      .catch(() => {})
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')
    try {
      const r = await api<{ postal: string | null }>('household', {
        method: 'PATCH',
        body: { postal: postal.trim() },
      })
      setPostal(r.postal ?? '')
      setStatus('saved')
    } catch {
      setStatus('bad')
    }
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.shopping}</h2>
      <p className="lead">{t.operator.shopHint}</p>
      <form className="operator__inline-form" onSubmit={save}>
        <input
          className="input"
          value={postal}
          onChange={(e) => {
            setPostal(e.target.value.toUpperCase())
            setStatus('idle')
          }}
          placeholder={t.operator.postalPlaceholder}
          aria-label={t.operator.postalLabel}
          maxLength={7}
        />
        <button type="submit" className="btn btn--primary">
          {t.common.save}
        </button>
      </form>
      {status === 'saved' && <p className="capture__routed mono">{t.operator.postalSaved}</p>}
      {status === 'bad' && <p className="error mono">{t.operator.postalBad}</p>}
    </section>
  )
}

// Ghost list management — the manual handle on the predictive grocery layer.
// Lists every staple, learned item, and added one with its effective renewal
// cadence; the operator retunes the days, hides one, or adds a custom staple.
// This is the "10% specific, handled manually" half of the feature.
function GhostSection() {
  const t = useT()
  const [items, setItems] = useState<GhostManageItem[]>([])
  const [label, setLabel] = useState('')
  const [days, setDays] = useState('7')

  const load = useCallback(async () => {
    setItems(await fetchGhostManage().catch(() => []))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function save(item: GhostManageItem, patch: { cadenceDays?: number; muted?: boolean }) {
    await patchGhost({
      key: item.key,
      label: item.label,
      cadenceDays: patch.cadenceDays ?? item.cadenceDays ?? undefined,
      muted: patch.muted ?? item.muted,
    }).catch(() => {})
    load()
  }
  async function remove(item: GhostManageItem) {
    await deleteGhost(item.key).catch(() => {})
    load()
  }
  async function add(e: React.FormEvent) {
    e.preventDefault()
    const name = label.trim()
    if (!name) return
    const n = Math.max(1, Math.min(365, Math.round(Number(days) || 7)))
    await patchGhost({ label: name, cadenceDays: n }).catch(() => {})
    setLabel('')
    setDays('7')
    load()
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.ghost}</h2>
      <p className="lead">{t.ghost.manageHint}</p>
      {items.length === 0 ? (
        <p className="board__empty mono">{t.ghost.emptyManage}</p>
      ) : (
        <ul className="operator__list ghost-admin">
          {items.map((it) => (
            <GhostRow key={it.key} item={it} onSave={save} onRemove={remove} />
          ))}
        </ul>
      )}
      <form className="operator__inline-form" onSubmit={add}>
        <input
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t.ghost.staplePlaceholder}
          aria-label={t.ghost.addStaple}
        />
        <label className="ghost-admin__cadence mono">
          {t.ghost.every}
          <input
            className="input ghost-admin__days"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label={t.ghost.every}
          />
          {t.ghost.days}
        </label>
        <button type="submit" className="btn" disabled={!label.trim()}>
          {t.ghost.addStaple}
        </button>
      </form>
    </section>
  )
}

// One manageable item. The days input is locally controlled and only persists on
// blur, so typing doesn't fire a write per keystroke.
function GhostRow({
  item,
  onSave,
  onRemove,
}: {
  item: GhostManageItem
  onSave: (item: GhostManageItem, patch: { cadenceDays?: number; muted?: boolean }) => void
  onRemove: (item: GhostManageItem) => void
}) {
  const t = useT()
  const [days, setDays] = useState(String(item.cadenceDays ?? ''))
  const sourceLabel =
    item.source === 'staple'
      ? t.ghost.sourceStaple
      : item.source === 'manual'
        ? t.ghost.sourceManual
        : t.ghost.sourceLearned

  function commit() {
    const n = Math.max(1, Math.min(365, Math.round(Number(days) || item.cadenceDays || 7)))
    setDays(String(n))
    if (n !== item.cadenceDays) onSave(item, { cadenceDays: n })
  }

  return (
    <li className={'ghost-admin__row' + (item.muted ? ' is-muted' : '')}>
      <span className="ghost-admin__name">{item.label}</span>
      <span className="ghost-admin__meta mono">
        {sourceLabel}
        {item.count > 0 ? ` · ${item.count}×` : ''}
      </span>
      <label className="ghost-admin__cadence mono">
        {t.ghost.every}
        <input
          className="input ghost-admin__days"
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          onBlur={commit}
          aria-label={`${item.label} — ${t.ghost.every}`}
        />
        {t.ghost.days}
      </label>
      <button type="button" className="btn btn--ghost mono" onClick={() => onSave(item, { muted: !item.muted })}>
        {item.muted ? t.ghost.unmute : t.ghost.mute}
      </button>
      {item.source === 'manual' && (
        <button type="button" className="btn btn--ghost mono operator__del" onClick={() => onRemove(item)}>
          {t.ghost.remove}
        </button>
      )}
    </li>
  )
}

function MembersSection({ members, onChange }: { members: Member[]; onChange: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const [isChild, setIsChild] = useState(false)
  // Default each new person to the next unused palette colour, so a household
  // fills out colour-distinct without anyone having to think about it.
  const [color, setColor] = useState(PALETTE[members.length % PALETTE.length])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await api('members', { method: 'POST', body: { name: name.trim(), isChild, color } }).catch(() => {})
    setName('')
    setIsChild(false)
    setColor(PALETTE[(members.length + 1) % PALETTE.length])
    onChange()
  }
  async function remove(id: string) {
    await api('members', { method: 'DELETE', body: { id } }).catch(() => {})
    onChange()
  }
  // Set a face from the phone (camera or gallery): resize small, upload, refresh.
  async function setPhoto(id: string, file: File) {
    const blob = await resizeImage(file, AVATAR_MAX)
    await api(`members/avatar?id=${id}`, { method: 'POST', body: blob }).catch(() => {})
    onChange()
  }
  async function clearPhoto(id: string) {
    await api('members', { method: 'PATCH', body: { id, clearPhoto: true } }).catch(() => {})
    onChange()
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.members}</h2>
      <ul className="member-cards">
        {members.map((m) => (
          <li key={m.id} className="member-card surface">
            <Avatar kind={m.avatar_kind} photo={m.avatar_ref} colour={m.colour} name={m.display_name} size={64} />
            <span className="member-card__name">{m.display_name}</span>
            {m.is_child ? <span className="tag mono">{t.operator.isChild}</span> : null}
            <div className="member-card__actions">
              <label className="btn btn--ghost mono operator__photo" title={t.operator.photo}>
                📷
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label={t.operator.photo}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setPhoto(m.id, f)
                    e.target.value = ''
                  }}
                />
              </label>
              {m.avatar_kind === 'photo' && (
                <button
                  type="button"
                  className="btn btn--ghost mono"
                  onClick={() => clearPhoto(m.id)}
                  aria-label={t.operator.removePhoto}
                >
                  ✕
                </button>
              )}
              <button type="button" className="btn btn--ghost mono" onClick={() => remove(m.id)}>
                {t.operator.delete}
              </button>
            </div>
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
        <ColorPicker value={color} onChange={setColor} label={t.operator.colorLabel} />
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
  async function remove(id: string) {
    await api('chores', { method: 'DELETE', body: { id } }).catch(() => {})
    onChange()
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.chores}</h2>
      <ul className="operator__list">
        {chores.map((c) => (
          <li key={c.id}>
            <span className="operator__avatar" style={{ background: c.color ?? '#88A36F' }} aria-hidden="true" />
            <span>{c.title}</span>
            <button type="button" className="btn btn--ghost mono operator__del" onClick={() => remove(c.id)}>
              {t.operator.delete}
            </button>
          </li>
        ))}
      </ul>
      <ChoreForm members={members} onSaved={onChange} />
    </section>
  )
}

// Events: the operator's direct CRUD over the agenda. The form itself is the
// shared <EventForm> (also used by the Add sheet); this section just adds the
// list + edit/delete around it. 🔁 marks a recurring series.
function EventsSection({
  events,
  members,
  onChange,
}: {
  events: EventRow[]
  members: Member[]
  onChange: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const [editing, setEditing] = useState<EventRow | null>(null)

  async function remove(id: string) {
    await api('events', { method: 'DELETE', body: { id } }).catch(() => {})
    if (editing?.id === id) setEditing(null)
    onChange()
  }
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.display_name
  const memberColor = (id: string | null) => members.find((m) => m.id === id)?.colour

  return (
    <section className="surface operator__section">
      <h2>{t.operator.events}</h2>
      {events.length === 0 ? (
        <p className="board__empty mono">{t.operator.noEvents}</p>
      ) : (
        <ul className="operator__list">
          {events.map((ev) => (
            <li key={ev.id}>
              <span
                className="operator__avatar"
                style={{ background: memberColor(ev.member_id) ?? 'var(--ink-faint)' }}
                aria-hidden="true"
              />
              <span>
                {ev.recur_json ? '🔁 ' : ''}
                {ev.title}
                <span className="mono operator__event-when">
                  {' · '}
                  {formatDay(ev.start_at, lang)}
                  {ev.all_day ? '' : ` ${formatTime(ev.start_at, lang)}`}
                  {memberName(ev.member_id) ? ` · ${memberName(ev.member_id)}` : ''}
                </span>
              </span>
              <button type="button" className="btn btn--ghost mono" onClick={() => setEditing(ev)} aria-label={t.common.save}>
                ✎
              </button>
              <button type="button" className="btn btn--ghost mono operator__del" onClick={() => remove(ev.id)}>
                {t.operator.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
      <EventForm
        key={editing?.id ?? 'new'}
        members={members}
        value={editing}
        onSaved={() => {
          setEditing(null)
          onChange()
        }}
        onCancel={editing ? () => setEditing(null) : undefined}
      />
    </section>
  )
}

// Weekly recap: an on-demand, calm reflection (NFR-CALM/COST — a button, never a
// loop). Hides itself when AI is unavailable (503) so it never shows a dead button.
function RecapSection() {
  const t = useT()
  const [recap, setRecap] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  async function generate() {
    setBusy(true)
    try {
      const r = await api<{ recap: string | null }>('recap')
      setRecap(r.recap)
    } catch (e) {
      if (isStatus(e, 503)) setUnavailable(true)
    } finally {
      setBusy(false)
    }
  }

  if (unavailable) return null
  return (
    <section className="surface operator__section">
      <h2>{t.operator.recapTitle}</h2>
      <p className="mono">{t.operator.recapHint}</p>
      {recap && <p className="lead">{recap}</p>}
      <button type="button" className="btn" onClick={generate} disabled={busy}>
        {busy ? t.operator.recapThinking : t.operator.recapGen}
      </button>
    </section>
  )
}

// Home photos: family pictures that drift across the wall board. Upload straight
// from a phone (camera or gallery); they're resized small before upload and the
// set is capped server-side, so this stays free. Hides itself if R2 is unbound.
function PhotosSection() {
  const t = useT()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['photos'],
    queryFn: () => api<{ photos: { id: string; key: string }[] }>('photos'),
  })
  const photos = data?.photos ?? []
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  async function add(file: File) {
    setBusy(true)
    try {
      const blob = await resizeImage(file, PHOTO_MAX)
      await api('photos', { method: 'POST', body: blob })
      qc.invalidateQueries({ queryKey: ['photos'] })
    } catch (e) {
      if (isStatus(e, 503)) setUnavailable(true)
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: string) {
    await api('photos', { method: 'DELETE', body: { id } }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['photos'] })
  }

  if (unavailable) return null
  return (
    <section className="surface operator__section">
      <h2>{t.operator.photos}</h2>
      <p className="mono">{t.operator.photoHint}</p>
      {photos.length === 0 ? (
        <p className="board__empty mono">{t.operator.noPhotos}</p>
      ) : (
        <div className="photo-grid">
          {photos.map((p) => (
            <div key={p.id} className="photo-grid__item">
              <img src={imgUrl(p.key)} alt="" loading="lazy" />
              <button
                type="button"
                className="photo-grid__del"
                onClick={() => remove(p.id)}
                aria-label={t.operator.delete}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="btn">
        {busy ? t.operator.photoUploading : t.operator.photoAdd}
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) add(f)
            e.target.value = ''
          }}
        />
      </label>
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
      <RoutineForm members={members} onSaved={onChange} />
    </section>
  )
}
