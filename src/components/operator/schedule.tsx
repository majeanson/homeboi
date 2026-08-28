import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { SCHEDULE_KEY, BOARD_KEY, MEMBERS_KEY, CAR_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { type Member } from '../../lib/members'
import { isGuest } from '../../lib/device'
import { Chip } from '../Chip'
import { Modal } from '../Modal'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { StatusMessage } from '../StatusMessage'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ L'auto ▸ Horaires. The quiet weekly schedule backdrop (migration 0069):
// each member's recurring work/away window, and whether it TAKES the shared car.
// These never show as agenda items — they only shape « L'auto »'s availability
// (free gaps + conflicts) and the derived "who's home" glance. A single odd week is
// adjusted per-date in the /voiture view, not here. Persists on /api/schedule;
// saving invalidates SCHEDULE_KEY + BOARD_KEY so the week + the board glance refresh.

export interface ScheduleBlock {
  id: string
  memberId: string
  label: string | null
  startMin: number
  endMin: number
  weekdays: number[]
  holdsCar: boolean
  color: string | null
  weekInterval?: number // repeat every N weeks (1 = every week). #28
  anchorDay?: number | null // the fortnight phase, stamped server-side; preserved on edit
}

const pad = (n: number) => String(n).padStart(2, '0')
const minToHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
const hhmmToMin = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  const min = +m[1] * 60 + +m[2]
  return min >= 0 && min <= 24 * 60 ? min : null
}

export function ScheduleSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const write = useWrite()
  const removal = useDeferredRemoval(SCHEDULE_KEY)
  const ro = isGuest()
  const { data: blocksData } = useQuery({
    queryKey: SCHEDULE_KEY,
    queryFn: () => api<{ blocks: ScheduleBlock[] }>('schedule'),
    ...live,
  })
  const { data: membersData } = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<{ members: Member[] }>('members'),
    ...live,
  })
  // SCHEDULE_KEY is a live-polled query, so a delete must ride useDeferredRemoval:
  // hide the row now + hold the DELETE behind the undo toast, or the next ~10 s poll
  // resurrects it mid-undo (the flash-back glitch). `visible` drops the pending rows.
  const blocks = removal.visible(blocksData?.blocks ?? [])
  const members = membersData?.members ?? []
  const [editing, setEditing] = useState<ScheduleBlock | null>(null)
  const [adding, setAdding] = useState(false)

  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'
  const colorOf = (id: string) => members.find((m) => m.id === id)?.colour
  const daysLabel = (wd: number[]) =>
    wd.length === 0 ? t.operator.schedEveryDay : [...wd].sort((a, b) => a - b).map((d) => t.recur.weekdayShort[d]).join(' ')
  const everyLabel = (n: number | undefined) => (n && n > 1 ? ` · ${t.operator.schedEveryNWeeksShort(n)}` : '')

  async function save(b: Omit<ScheduleBlock, 'id'> & { id?: string }) {
    await write('schedule', {
      method: b.id ? 'PATCH' : 'POST',
      body: b,
      affectedKeys: [SCHEDULE_KEY, BOARD_KEY, CAR_KEY, MONTH_KEY],
    })
    setEditing(null)
    setAdding(false)
  }
  function remove(b: ScheduleBlock) {
    removal.remove([b.id], t.undo.cleared(nameOf(b.memberId)), () =>
      write('schedule', { method: 'DELETE', body: { id: b.id }, affectedKeys: [SCHEDULE_KEY, BOARD_KEY, CAR_KEY, MONTH_KEY] }),
    )
  }

  return (
    <OperatorSection title={t.operator.schedTitle} help={help} helpKey="schedule">
      {blocks.length === 0 ? (
        <EmptyState>{t.operator.schedEmpty}</EmptyState>
      ) : (
        <ul className="operator__list meal-slots">
          {blocks.map((b) =>
            editing?.id === b.id ? (
              <li key={b.id}>
                <BlockForm members={members} value={b} onSave={save} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={b.id} className="meal-slots__row">
                <span className="meal-slots__name">
                  <span
                    className="meal-slots__chip"
                    style={{ background: colorOf(b.memberId) ?? '#888' }}
                    aria-hidden="true"
                  />
                  <span className="meal-slots__label">
                    <strong>{nameOf(b.memberId)}</strong>
                    {b.label ? ` · ${b.label}` : ''} · {daysLabel(b.weekdays)}
                    {everyLabel(b.weekInterval)} · {minToHHMM(b.startMin)}–
                    {minToHHMM(b.endMin)}
                    {b.holdsCar ? ` · ${t.operator.schedHoldsCarShort}` : ''}
                  </span>
                </span>
                {!ro && (
                  <RowActions
                    onEdit={() => {
                      setAdding(false)
                      setEditing(b)
                    }}
                    onDelete={() => remove(b)}
                    editLabel={`${t.common.edit} — ${nameOf(b.memberId)}`}
                    deleteLabel={`${t.common.delete} — ${nameOf(b.memberId)}`}
                  />
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {/* Add opens the form in a Modal, not unfolded under the list — a long schedule
          pushed it below the fold, so the form you just asked for was off-screen. (Editing
          stays in place on the row you tapped: it's anchored, not stranded.) */}
      {!ro && (
        <button
          type="button"
          className="btn btn--primary operator__add"
          onClick={() => {
            setEditing(null)
            setAdding(true)
          }}
          disabled={members.length === 0}
        >
          ＋ {t.operator.schedAdd}
        </button>
      )}
      {/* A disabled button with no reason beside it is a dead end: a schedule block
          belongs to a MEMBER, so with none added there is nothing to schedule — say
          that, and point at where members are added, rather than greying out and
          leaving the operator to guess (REVIEW-PASS « smaller nits »). */}
      {!ro && members.length === 0 && <p className="operator__hint mono">{t.operator.schedNoMembers}</p>}
      <Modal open={adding} onClose={() => setAdding(false)} title={t.operator.schedAdd}>
        {adding && <BlockForm members={members} onSave={save} onCancel={() => setAdding(false)} />}
      </Modal>
    </OperatorSection>
  )
}

// The add/edit form for one schedule block — member, optional label, time range,
// weekdays, and the "takes the car" toggle.
function BlockForm({
  members,
  value,
  onSave,
  onCancel,
}: {
  members: Member[]
  value?: ScheduleBlock
  onSave: (b: Omit<ScheduleBlock, 'id'> & { id?: string }) => void
  onCancel: () => void
}) {
  const t = useT()
  const [memberId, setMemberId] = useState(value?.memberId ?? members[0]?.id ?? '')
  const [label, setLabel] = useState(value?.label ?? '')
  const [start, setStart] = useState(minToHHMM(value?.startMin ?? 8 * 60))
  const [end, setEnd] = useState(minToHHMM(value?.endMin ?? 17 * 60))
  const [weekdays, setWeekdays] = useState<number[]>(value?.weekdays ?? [1, 2, 3, 4, 5])
  const [holdsCar, setHoldsCar] = useState(value?.holdsCar ?? true)
  // Repeat every N weeks (1 = every week, the default). Biweekly/alternating-week
  // shifts (#28); the server stamps the fortnight phase when interval > 1.
  const [interval, setInterval] = useState(value?.weekInterval ?? 1)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)

  const toggleDay = (d: number) =>
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)))

  async function submit() {
    const startMin = hhmmToMin(start)
    const endMin = hhmmToMin(end)
    if (!memberId || startMin == null || endMin == null || endMin <= startMin) {
      setErr(true)
      return
    }
    setBusy(true)
    setErr(false)
    try {
      await onSave({ id: value?.id, memberId, label: label.trim() || null, startMin, endMin, weekdays, holdsCar, color: value?.color ?? null, weekInterval: interval, anchorDay: value?.anchorDay ?? null })
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="operator__inline-form">
      <div className="operator__rotation mono">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`btn btn--ghost${memberId === m.id ? ' is-active' : ''}`}
            aria-pressed={memberId === m.id}
            onClick={() => setMemberId(m.id)}
          >
            {m.display_name}
          </button>
        ))}
      </div>
      <EditField value={label} onChange={setLabel} placeholder={t.operator.schedLabel} ariaLabel={t.operator.schedLabel} />
      <div className="operator__rotation mono">
        <label className="mono">
          {t.operator.schedFrom}{' '}
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="mono">
          {t.operator.schedTo}{' '}
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="recur__days">
        {t.recur.weekdayShort.map((lbl, d) => (
          <Chip key={d} selected={weekdays.includes(d)} onClick={() => toggleDay(d)} ariaLabel={lbl}>
            {lbl}
          </Chip>
        ))}
      </div>
      {/* Repeat every N weeks — every week (default) or an alternating-week rota. */}
      <p className="mono event-transport__label">{t.operator.schedRepeat}</p>
      <div className="operator__rotation mono">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={`btn btn--ghost${interval === n ? ' is-active' : ''}`}
            aria-pressed={interval === n}
            onClick={() => setInterval(n)}
          >
            {n === 1 ? t.operator.schedEveryWeek : t.operator.schedEveryNWeeks(n)}
          </button>
        ))}
      </div>
      <label className="operator__check mono">
        <input type="checkbox" checked={holdsCar} onChange={(e) => setHoldsCar(e.target.checked)} />
        {t.operator.schedHoldsCar}
      </label>
      {err && <StatusMessage tone="error">{t.operator.schedBad}</StatusMessage>}
      <div className="operator__rotation mono">
        <button type="button" className="btn" onClick={submit} disabled={busy}>
          {value ? t.common.save : t.common.add}
        </button>
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}
