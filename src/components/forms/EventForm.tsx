import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWrite } from '../../lib/write'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { CERCLE_KEY, BUSINESSES_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { fullName, type Contact, type ContactLink } from '../../lib/cercle'
import { type Business } from '../../lib/businesses'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { LeadPicker } from '../LeadPicker'
import { StatusMessage } from '../StatusMessage'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { recurOf } from '../../lib/recurLabel'

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
}

// The "with" combobox lists BOTH cercle people and businesses; the picked option
// carries which kind it is so we set the right id.
type WhoPick = { kind: 'contact' | 'business' }


const pad = (n: number) => String(n).padStart(2, '0')

export function EventForm({
  members,
  value,
  initialDate,
  onSaved,
  onCancel,
}: {
  members: FormMember[]
  value?: EventInit | null
  initialDate?: number // local-midnight unix s to pre-fill a NEW event's date (from the calendar)
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
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(value?.recur_json))
  const [lead, setLead] = useState<number | null>(value?.lead_seconds ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const write = useWrite()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
    }
    setBusy(true)
    setErr(false)
    try {
      await write('events', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...fields } : fields,
        affectedKeys: [['events'], ['board'], MONTH_KEY],
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
      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t.operator.eventWhat}
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
