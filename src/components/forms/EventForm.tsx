import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWrite } from '../../lib/write'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { CERCLE_KEY, BUSINESSES_KEY, MONTH_KEY, TODO_TEMPLATES_KEY, EVENTS_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { type TemplatesData } from '../../lib/todos'
import { fullName, type Contact, type ContactLink } from '../../lib/cercle'
import { type Business } from '../../lib/businesses'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { LeadPicker } from '../LeadPicker'
import { StatusMessage } from '../StatusMessage'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { EditField } from '../EditField'
import { Disclosure } from '../Disclosure'
import { InlineIcon } from '../Icon'
import { useCars } from '../../lib/carPrefs'
import { recurOf } from '../../lib/recurLabel'

// Parse the events.passengers JSON column (a member-id array) into a string[] for the
// form's multi-select. Defensive: a malformed/absent value reads as no passengers.
const parsePassengers = (raw?: string | null): string[] => {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// The complete event (rendez-vous) form — title, date, optional time (no time =
// all-day), member, and recurrence. Shared by Settings ▸ Agenda AND the global
// Add sheet so both offer identical detail (DRY: one form, two homes). Owns its
// own POST/PATCH; calls onSaved() when done. Pass `value` to edit (and a `key`
// so it re-inits when the target changes).
interface FormMember {
  id: string
  display_name: string
}
export interface EventInit {
  id: string
  title: string
  start_at: number
  all_day: number
  member_id: string | null
  contact_id?: string | null // #21
  contact_name?: string | null // seed the "with" picker's text when editing
  business_id?: string | null // a « Le cercle » Business (vet, plumber…) — a rendez-vous
  business_name?: string | null // seed the "with" picker's text when editing
  recur_json?: string | null
  lead_seconds?: number | null
  car_id?: string | null // « L'auto »: which household car this ride takes
  passengers?: string | null // « L'auto »: member ids riding along (JSON array)
  bring_template_id?: string | null // « Activité »: the todo_templates id of its "what to bring" list
}

// The "with" combobox lists BOTH cercle people and businesses; the picked option
// carries which kind it is so we set the right id.
type WhoPick = { kind: 'contact' | 'business' }


const pad = (n: number) => String(n).padStart(2, '0')

export function EventForm({
  members,
  value,
  initialDate,
  defaultRide,
  defaultActivity,
  onSaved,
  onCancel,
}: {
  members: FormMember[]
  value?: EventInit | null
  initialDate?: number // local-midnight unix s to pre-fill a NEW event's date (from the calendar)
  defaultRide?: boolean // « L'auto »: open as a ride (Transport block expanded + car pre-picked)
  defaultActivity?: boolean // « Activité »: a recurring kid commitment — default weekly + open the logistics block
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const init = value ? new Date(value.start_at * 1000) : null
  // Pre-fill the date from the edited event, else a calendar-seeded day, else blank.
  const dateSeed = init ?? (initialDate ? new Date(initialDate * 1000) : null)
  const [title, setTitle] = useState(value?.title ?? '')
  const [date, setDate] = useState(
    dateSeed ? `${dateSeed.getFullYear()}-${pad(dateSeed.getMonth() + 1)}-${pad(dateSeed.getDate())}` : '',
  )
  const [time, setTime] = useState(init && !value?.all_day ? `${pad(init.getHours())}:${pad(init.getMinutes())}` : '')
  const [memberId, setMemberId] = useState<string | null>(value?.member_id ?? null)
  // The "who" of a rendez-vous is exactly one of: a member, a « Le cercle » person
  // ("Mamie visite"), or a Business ("vet", "plombier"). Picking any one clears the
  // others. People come from the shared cercle cache + businesses from theirs (both
  // often already warm); a failed fetch just hides that option rather than breaking
  // the form.
  const [contactId, setContactId] = useState<string | null>(value?.contact_id ?? null)
  const [businessId, setBusinessId] = useState<string | null>(value?.business_id ?? null)
  const [pickText, setPickText] = useState(value?.contact_name ?? value?.business_name ?? '')
  const { data: cercle } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<{ contacts: Contact[]; links: ContactLink[] }>('cercle'),
    ...live,
  })
  const { data: bizData } = useQuery({
    queryKey: BUSINESSES_KEY,
    queryFn: () => api<{ businesses: Business[] }>('businesses'),
    ...live,
  })
  const contacts = cercle?.contacts ?? []
  const businesses = bizData?.businesses ?? []
  const clearWho = () => {
    setContactId(null)
    setBusinessId(null)
    setPickText('')
  }
  // A new « Activité » defaults to a weekly recurrence (a soccer-every-Tuesday rhythm)
  // so the operator usually just confirms it.
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(value?.recur_json) ?? (defaultActivity ? { freq: 'weekly', interval: 1, weekdays: [] } : null))
  const [lead, setLead] = useState<number | null>(value?.lead_seconds ?? null)
  // « Activité » — the optional "what to bring" checklist, picked from the household's
  // saved lists (the SAME todo_templates that power the departure checklists). On the
  // activity's day, « Avant de partir » surfaces it. Reuses the template cache.
  const templatesQ = useQuery({ queryKey: TODO_TEMPLATES_KEY, queryFn: () => api<TemplatesData>('todo-templates'), ...live })
  const templates = templatesQ.data?.templates ?? []
  const [bringTemplateId, setBringTemplateId] = useState<string | null>(value?.bring_template_id ?? null)
  // Build a bring-list INLINE: type items here (souliers · gourde) to create a new
  // todo_templates list without leaving the form — the same lists « Avant de partir »
  // surfaces. The new list is named after the event (« Soccer ») and auto-selected.
  const qc = useQueryClient()
  const [bringInput, setBringInput] = useState('')
  const [bringDraft, setBringDraft] = useState<string[]>([])
  const [bringBusy, setBringBusy] = useState(false)
  async function createBringList() {
    const items = bringDraft.map((s) => s.trim()).filter(Boolean)
    if (!items.length || bringBusy) return
    setBringBusy(true)
    try {
      const res = await api<{ id: string }>('todo-templates', {
        method: 'POST',
        body: { title: title.trim() || t.operator.bringDefaultName, items },
      })
      setBringTemplateId(res.id)
      setBringDraft([])
      setBringInput('')
      await qc.invalidateQueries({ queryKey: TODO_TEMPLATES_KEY })
    } catch {
      /* keep the draft so nothing typed is lost */
    } finally {
      setBringBusy(false)
    }
  }
  const pushBringItem = (raw: string) => {
    const x = raw.trim()
    if (!x) return
    setBringDraft((d) => [...d, x])
    setBringInput('')
  }
  // « L'auto » — the optional ride layer: does this event take a household car, and
  // which kids ride along. Both default off so a plain event is unchanged. The
  // driver is still the member/contact above (member = we drive · a cercle contact =
  // a carpool parent drives their car). Collapsed in a Disclosure (calm: secondary).
  const { cars, hasCar, primary } = useCars()
  // A new ride (defaultRide) pre-picks the household car so it's a one-tap add.
  const [carId, setCarId] = useState<string | null>(value?.car_id ?? (defaultRide && primary ? primary.id : null))
  const [passengers, setPassengers] = useState<string[]>(parsePassengers(value?.passengers))
  const togglePassenger = (id: string) =>
    setPassengers((cur) => (cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const write = useWrite()

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim() || !date || busy) return
    const startAt = Math.floor(new Date(`${date}T${time || '00:00'}`).getTime() / 1000)
    if (!Number.isFinite(startAt)) return
    // Weekly with no weekday picked → the server defaults to the anchor's (UTC)
    // weekday. We don't compute it here: local getDay() could disagree with the
    // server's UTC expansion and recur on the wrong day.
    const fields = {
      title: title.trim(),
      startAt,
      allDay: !time,
      // The server enforces the same precedence (business → contact → member).
      memberId: contactId || businessId ? null : memberId,
      contactId: businessId ? null : contactId,
      businessId,
      recur,
      leadSeconds: lead,
      carId,
      passengers,
      bringTemplateId,
    }
    setBusy(true)
    setErr(false)
    try {
      await write('events', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...fields } : fields,
        affectedKeys: [EVENTS_KEY, BOARD_KEY, MONTH_KEY],
      })
      onSaved()
    } catch {
      // Keep what was typed — closing here would silently throw the event away.
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="operator__inline-form" onSubmit={submit}>
      <EditField
        as="div"
        value={title}
        onChange={setTitle}
        onSubmit={() => submit()}
        submitIcon={null}
        placeholder={t.operator.eventWhat}
        ariaLabel={t.operator.eventWhat}
      />
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input
        className="input"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        aria-label={t.operator.eventAllDay}
      />
      <div className="operator__rotation mono">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`btn btn--ghost${memberId === m.id && !contactId && !businessId ? ' is-active' : ''}`}
            onClick={() => {
              clearWho()
              setMemberId(memberId === m.id ? null : m.id)
            }}
          >
            {m.display_name}
          </button>
        ))}
      </div>
      {/* …or someone from Le cercle, OR a Business (vet, plombier…) — a rendez-vous.
          Picking any "with" clears the member above; the server keeps it one answer. */}
      {(contacts.length > 0 || businesses.length > 0) && (
        <EntityCombobox<WhoPick>
          value={pickText}
          onChange={(v) => {
            setPickText(v)
            if (!v.trim()) {
              setContactId(null)
              setBusinessId(null)
            }
          }}
          options={[
            ...contacts.map((c): ComboOption<WhoPick> => ({ id: c.id, label: fullName(c), data: { kind: 'contact' }, icon: 'users-three-bold' })),
            ...businesses.map((b): ComboOption<WhoPick> => ({ id: b.id, label: b.name, data: { kind: 'business' }, icon: 'storefront-bold' })),
          ]}
          onPick={(opt) => {
            setMemberId(null)
            if (opt.data?.kind === 'business') {
              setBusinessId(opt.id)
              setContactId(null)
            } else {
              setContactId(opt.id)
              setBusinessId(null)
            }
            setPickText(opt.label)
          }}
          placeholder={t.operator.eventWith}
          submitIcon={null}
          typeaheadOnly
        />
      )}
      <RecurPicker value={recur} onChange={setRecur} />
      <LeadPicker value={lead} onChange={setLead} />
      {/* The event form is ONE form: a plain rendez-vous up top, then two OPTIONAL
          sections (calm: collapsed by default). They replace the old separate
          ＋ « Trajet » / « Activité » tiles — fill only what you need. */}
      {/* « Trajet » — the optional ride layer: which household car it takes (tap again
          to clear = no car / carpool) + which kids ride along. The driver stays the
          member/contact above. Hidden when there's no car AND no members. */}
      {(hasCar || members.length > 0) && (
        <Disclosure
          label={t.operator.eventTrajet}
          defaultOpen={carId != null || passengers.length > 0 || !!defaultRide}
          className="event-transport"
        >
          {hasCar && (
            <>
              <p className="mono event-transport__label">{t.operator.eventCarWho}</p>
              <div className="operator__rotation mono">
                {cars.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`btn btn--ghost${carId === c.id ? ' is-active' : ''}`}
                    style={carId === c.id && c.color ? { borderColor: c.color, color: c.color } : undefined}
                    onClick={() => setCarId(carId === c.id ? null : c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {members.length > 0 && (
            <>
              <p className="mono event-transport__label">{t.operator.eventPassengers}</p>
              <div className="operator__rotation mono">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`btn btn--ghost${passengers.includes(m.id) ? ' is-active' : ''}`}
                    onClick={() => togglePassenger(m.id)}
                  >
                    {m.display_name}
                  </button>
                ))}
              </div>
            </>
          )}
        </Disclosure>
      )}
      {/* « À apporter » — the optional bring-list for an activity (« Soccer : souliers ·
          gourde »). Pick a saved list OR build one INLINE (type items → a new
          todo_templates list, the same lists « Avant de partir » uses). Always
          available, so a first list can be made right here, not only in Réglages. */}
      <Disclosure
        label={t.operator.eventBring}
        defaultOpen={bringTemplateId != null || !!defaultActivity}
        className="event-bring"
      >
        {templates.length > 0 && (
          <div className="operator__rotation mono">
            {templates.map((tp) => (
              <button
                key={tp.id}
                type="button"
                className={`btn btn--ghost${bringTemplateId === tp.id ? ' is-active' : ''}`}
                onClick={() => setBringTemplateId(bringTemplateId === tp.id ? null : tp.id)}
              >
                {tp.title}
              </button>
            ))}
          </div>
        )}
        {/* Build a NEW list inline — only when none is picked (picking one IS the list). */}
        {bringTemplateId == null && (
          <div className="event-bring__build">
            {/* A plain input + button — a transient "bring" line, not worth EditField's
                clear/mic/actions chrome here. Enter adds an item too. */}
            <div className="event-bring__add">
              <input
                className="input"
                value={bringInput}
                onChange={(e) => setBringInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    pushBringItem(bringInput)
                  }
                }}
                placeholder={t.operator.bringAddItem}
                aria-label={t.operator.bringAddItem}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => pushBringItem(bringInput)}
                aria-label={t.operator.bringAddItem}
              >
                <InlineIcon name="plus-bold" size={16} />
              </button>
            </div>
            {bringDraft.length > 0 && (
              <>
                <div className="tags">
                  {bringDraft.map((it, i) => (
                    <button
                      key={i}
                      type="button"
                      className="tag"
                      onClick={() => setBringDraft((d) => d.filter((_, j) => j !== i))}
                      aria-label={`${it} — ${t.common.delete}`}
                    >
                      {it} <InlineIcon name="x-bold" size={11} />
                    </button>
                  ))}
                </div>
                <button type="button" className="btn" disabled={bringBusy} onClick={createBringList}>
                  <InlineIcon name="check-bold" size={15} /> {t.operator.bringCreate}
                </button>
              </>
            )}
          </div>
        )}
      </Disclosure>
      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <button type="submit" className="btn" disabled={!title.trim() || !date || busy}>
        {value ? t.common.save : t.operator.addEvent}
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </form>
  )
}
