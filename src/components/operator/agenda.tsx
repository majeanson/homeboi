import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { useWrite } from '../../lib/write'
import { useAddSheet } from '../../lib/addSheet'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { useConfirm } from '../../lib/confirm'
import { isGuest } from '../../lib/device'
import { api } from '../../lib/api'
import { formatDay, formatTime } from '../../lib/format'
import { HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { type SchoolYear, type SchoolBreak } from '../../lib/year'
import { EventForm } from '../forms/EventForm'
import { InlineIcon } from '../Icon'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { ListRow } from '../ListRow'
import { StatusMessage } from '../StatusMessage'
import { Cluster } from '../Layout'
import { MONTH_KEY, EVENTS_KEY, BOARD_KEY, CAR_KEY } from '../../lib/queryKeys'
import { OperatorSection } from './OperatorSection'
import { type EventRow, type Member } from './types'
import { eventMembers } from '../../lib/eventPeople'

// Events: the operator manages the agenda here (edit/delete + reschedule), but
// ADDING is the same ＋ as everywhere — this section opens it (open('event'))
// rather than carrying a duplicate blank form. The shared <EventForm> still
// appears inline, but only to EDIT an existing event. 🔁 marks a recurring series.
export function EventsSection({
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
  const { open } = useAddSheet()
  const removal = useDeferredRemoval(EVENTS_KEY)
  const write = useWrite()
  // Read-only guest: hide the add-event button + the inline edit form (RowActions
  // already hides its own ✏️/🗑️, so a guest can't open the editor anyway).
  const ro = isGuest()
  const [editing, setEditing] = useState<EventRow | null>(null)

  // useDeferredRemoval, NOT useUndoableRemove (REVIEW-PASS, 2026-08-28). The latter
  // hides the row by mutating the cache (`setQueryData`), which is fine while the only
  // reader is this Réglages list — its queries are not `live`. But `DayPlanPage` reads
  // EVENTS_KEY with `...live` (staleTime 0, ~10 s poll), so a poll or a RealtimeHub
  // nudge landing inside the undo window refilled the cache and flashed the deleted row
  // back on the day page, then removed it again when the held write finally ran. The
  // deferred store holds the id OUT of the render on every surface in the scope, which
  // no refetch can undo — the exact case its "CROSS-SURFACE" note describes.
  function remove(ev: EventRow) {
    if (editing?.id === ev.id) setEditing(null)
    removal.remove([ev.id], t.undo.cleared(ev.title), async () => {
      await write('events', { method: 'DELETE', body: { id: ev.id }, affectedKeys: [EVENTS_KEY, BOARD_KEY, MONTH_KEY, CAR_KEY] })
      onChange()
    })
  }
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.display_name
  // « Qui » for the agenda list subtitle: all the household people the event concerns,
  // names joined (this is a management list, not a glance — plain text, no face pile).
  const eventWho = (ev: EventRow) => {
    const names = eventMembers(ev).map((id) => memberName(id)).filter(Boolean) as string[]
    return names.length ? names.join(', ') : undefined
  }
  const memberColor = (id: string | null) => members.find((m) => m.id === id)?.colour

  return (
    <OperatorSection title={t.operator.events}>
      {events.length === 0 ? (
        <EmptyState>{t.operator.noEvents}</EmptyState>
      ) : (
        <ul className="operator__list">
          {removal.visible(events).map((ev) => (
            <li key={ev.id}>
              <ListRow
                leading={
                  <span
                    className="operator__avatar"
                    style={{ background: ev.business_colour ?? memberColor(ev.member_id) ?? 'var(--ink-faint)' }}
                    aria-hidden="true"
                  />
                }
                title={
                  <>
                    {ev.recur_json && (
                      <>
                        <InlineIcon name="repeat-bold" size={13} color="var(--sky-deep)" />{' '}
                      </>
                    )}
                    {ev.title}
                  </>
                }
                subtitle={
                  <>
                    {formatDay(ev.start_at, lang)}
                    {ev.all_day ? '' : ` ${formatTime(ev.start_at, lang)}`}
                    {(() => {
                      const who = ev.business_name ?? ev.contact_name ?? eventWho(ev)
                      return who ? ` · ${who}` : ''
                    })()}
                  </>
                }
                actions={
                  <RowActions
                    onEdit={() => setEditing(ev)}
                    onDelete={() => remove(ev)}
                    editLabel={t.operator.editEvent}
                    deleteLabel={t.operator.deleteEvent}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
      {/* Adding lives on the ＋ (open('event')); the inline form is EDIT-only so
          Réglages doesn't carry a second copy of the blank event form. */}
      {ro ? null : editing ? (
        <EventForm
          key={editing.id}
          members={members}
          value={editing}
          onSaved={() => {
            setEditing(null)
            onChange()
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="btn btn--primary operator__add" onClick={() => open('event', ['event'])}>
          <InlineIcon name="plus-bold" /> {t.operator.addEvent}
        </button>
      )}
    </OperatorSection>
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')
// LOCAL-midnight unix s ↔ a `<input type="date">` string, matching the browser's
// own zone (the same "browser tz = household tz" assumption EventForm's date
// field already makes — the kiosk lives in the house).
const secToDateStr = (sec: number) => {
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const dateStrToSec = (s: string): number | null => {
  if (!s) return null
  const t = new Date(`${s}T00:00`).getTime()
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
}

interface BreakDraft {
  key: string
  from: string
  to: string
  label: string
}
let breakSeq = 0
const newBreakKey = () => `sb${++breakSeq}`

// « La rentrée » (D-17, bmad/10) — the school-year bounds, typed ONCE a year: the
// board's « Demain » then knows a school morning from a vacation morning (see
// lib/year.schoolDayKind), and the year view gets the same bounds for free
// (lib/year.yearPoints). Appended to the SAME « Agenda » sub as EventsSection
// (C-15 standing rule: a new setting merges into an existing sub, never adds a
// pill). Persists on /api/household (functions/_lib/schoolYear.ts) — the server
// re-validates too (dates ordered, breaks inside the term), so a malformed save
// still surfaces the shared error banner instead of storing something the board
// would misread all year.
export function SchoolYearSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const ro = isGuest()
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ schoolYear?: SchoolYear | null }>('household'),
  })
  const [firstDay, setFirstDay] = useState('')
  const [lastDay, setLastDay] = useState('')
  const [breaks, setBreaks] = useState<BreakDraft[]>([])
  const [seeded, setSeeded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')

  // Seed once from the server value — never re-clobber a mid-edit form on a
  // background refetch (same "seed once" rule as household.tsx's name field).
  useEffect(() => {
    if (seeded || data === undefined) return
    const sy = data.schoolYear
    if (sy) {
      setFirstDay(secToDateStr(sy.firstDay))
      setLastDay(secToDateStr(sy.lastDay))
      setBreaks(sy.breaks.map((b) => ({ key: newBreakKey(), from: secToDateStr(b.from), to: secToDateStr(b.to), label: b.label ?? '' })))
    }
    setSeeded(true)
  }, [data, seeded])

  const addBreak = () => setBreaks((bs) => [...bs, { key: newBreakKey(), from: '', to: '', label: '' }])
  const removeBreak = (key: string) => setBreaks((bs) => bs.filter((b) => b.key !== key))
  const updateBreak = (key: string, patch: Partial<BreakDraft>) =>
    setBreaks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)))

  async function save() {
    const first = dateStrToSec(firstDay)
    const last = dateStrToSec(lastDay)
    if (first == null || last == null || first >= last) {
      setStatus('bad')
      return
    }
    const payload: SchoolYear = {
      firstDay: first,
      lastDay: last,
      breaks: breaks.reduce<SchoolBreak[]>((acc, b) => {
        const from = dateStrToSec(b.from)
        const to = dateStrToSec(b.to)
        if (from == null || to == null || from > to) return acc
        acc.push(b.label.trim() ? { from, to, label: b.label.trim() } : { from, to })
        return acc
      }, []),
    }
    try {
      await write('household', { method: 'PATCH', body: { schoolYear: payload }, affectedKeys: [HOUSEHOLD_KEY] })
      setStatus('saved')
    } catch {
      setStatus('bad')
    }
  }

  // Wipes the first/last day AND every typed relâche in one shot — no undo path,
  // so (like household.tsx's member delete) it asks first via the in-app confirm
  // dialog rather than the forgiving undo toast the lighter rows use.
  async function clear() {
    const okay = await confirm({ message: t.operator.schoolYearClearConfirm, confirmLabel: t.operator.schoolYearClear, tone: 'danger' })
    if (!okay) return
    setFirstDay('')
    setLastDay('')
    setBreaks([])
    try {
      await write('household', { method: 'PATCH', body: { schoolYear: null }, affectedKeys: [HOUSEHOLD_KEY] })
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
      setStatus('saved')
    } catch {
      setStatus('bad')
    }
  }

  if (ro) {
    // Read-only guest: a plain summary, no form.
    const sy = data?.schoolYear
    return (
      <OperatorSection title={t.operator.schoolYearTitle} help={help} helpKey="schoolYear">
        {sy ? (
          <p className="mono">
            {formatDay(sy.firstDay, lang)} → {formatDay(sy.lastDay, lang)}
          </p>
        ) : (
          <EmptyState>{t.operator.schoolYearHint}</EmptyState>
        )}
      </OperatorSection>
    )
  }

  return (
    <OperatorSection title={t.operator.schoolYearTitle} hint={t.operator.schoolYearHint} help={help} helpKey="schoolYear">
      <label className="recur__row mono">
        <span>{t.operator.schoolYearFirstDay}</span>
        <input className="input" type="date" value={firstDay} onChange={(e) => setFirstDay(e.target.value)} />
      </label>
      <label className="recur__row mono">
        <span>{t.operator.schoolYearLastDay}</span>
        <input className="input" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
      </label>
      <h3 className="operator__field-label">{t.operator.schoolYearBreaksTitle}</h3>
      {breaks.map((b) => (
        <Cluster key={b.key} className="operator__schoolbreak">
          <label className="recur__row mono">
            <span>{t.operator.schoolYearBreakFrom}</span>
            <input className="input" type="date" value={b.from} onChange={(e) => updateBreak(b.key, { from: e.target.value })} />
          </label>
          <label className="recur__row mono">
            <span>{t.operator.schoolYearBreakTo}</span>
            <input className="input" type="date" value={b.to} onChange={(e) => updateBreak(b.key, { to: e.target.value })} />
          </label>
          <input
            className="input"
            value={b.label}
            onChange={(e) => updateBreak(b.key, { label: e.target.value })}
            placeholder={t.operator.schoolYearBreakLabel}
            aria-label={t.operator.schoolYearBreakLabel}
          />
          <RowActions onDelete={() => removeBreak(b.key)} deleteLabel={t.operator.schoolYearRemoveBreak} />
        </Cluster>
      ))}
      <Cluster>
        <button type="button" className="btn btn--ghost" onClick={addBreak}>
          <InlineIcon name="plus-bold" /> {t.operator.schoolYearAddBreak}
        </button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={!firstDay || !lastDay}>
          {t.common.save}
        </button>
        {(firstDay || lastDay || breaks.length > 0) && (
          <button type="button" className="btn btn--ghost" onClick={clear}>
            {t.operator.schoolYearClear}
          </button>
        )}
      </Cluster>
      {status === 'saved' && <StatusMessage tone="success">{t.operator.postalSaved}</StatusMessage>}
      {status === 'bad' && <StatusMessage tone="error">{t.operator.schoolYearBad}</StatusMessage>}
    </OperatorSection>
  )
}
