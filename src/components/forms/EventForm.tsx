import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWrite } from '../../lib/write'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { CERCLE_KEY, BUSINESSES_KEY, MONTH_KEY, TODO_TEMPLATES_KEY, EVENTS_KEY, BOARD_KEY, CAR_KEY } from '../../lib/queryKeys'
import { type TemplatesData } from '../../lib/todos'
import { fullName, type Contact, type ContactLink } from '../../lib/cercle'
import { type Business } from '../../lib/businesses'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { LeadPicker } from '../LeadPicker'
import { StatusMessage } from '../StatusMessage'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { EditField } from '../EditField'
import { FormFooter } from '../FormFooter'
import { MemberPicker } from '../MemberPicker'
import { toFace } from '../FormScene'
import { Disclosure } from '../Disclosure'
import { Cluster } from '../Layout'
import { InlineIcon } from '../Icon'
import { useCars } from '../../lib/carPrefs'
import { useOnline } from '../../lib/online'
import { recurOf } from '../../lib/recurLabel'
import { parsePeopleIds } from '../../lib/eventPeople'

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
  end_at?: number | null // optional « Jusqu'à » — the window's exclusive end (unix s)
  car_id?: string | null // « L'auto »: which household car this rendez-vous takes
  passengers?: string | null // « Qui »: the household people this concerns (JSON id array); member_id = passengers[0]
  bring_template_id?: string | null // « Activité »: the todo_templates id of its "what to bring" list
}

// The "with" combobox lists BOTH cercle people and businesses; the picked option
// carries which kind it is so we set the right id.
type WhoPick = { kind: 'contact' | 'business' }


const pad = (n: number) => String(n).padStart(2, '0')

// Pre-seed the "Avec" of a BRAND-NEW rendez-vous (no `value`) — a person, a
// business, or a member. Used by « Le cercle »'s "Planifier un rendez-vous" peek
// action so the appointment opens with its counterpart already filled in.
export interface EventSeedWith {
  contactId?: string | null
  businessId?: string | null
  memberId?: string | null
  name: string // seeds the "with" combobox text (people/businesses); members show as a highlit button
  title?: string // optional pre-filled event title (e.g. a pet's vet visit « Vétérinaire — Rex »)
}

export function EventForm({
  members,
  value,
  seedWith,
  initialDate,
  defaultRide,
  defaultActivity,
  onSaved,
  onCancel,
}: {
  members: FormMember[]
  value?: EventInit | null
  seedWith?: EventSeedWith | null
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
  const [title, setTitle] = useState(value?.title ?? (value ? '' : seedWith?.title ?? ''))
  const [date, setDate] = useState(
    dateSeed ? `${dateSeed.getFullYear()}-${pad(dateSeed.getMonth() + 1)}-${pad(dateSeed.getDate())}` : '',
  )
  const [time, setTime] = useState(init && !value?.all_day ? `${pad(init.getHours())}:${pad(init.getMinutes())}` : '')
  // Optional « Jusqu'à » — how long this rendez-vous lasts. Blank = a point in the day
  // (what every event was until now). When set it drives « L'auto »'s availability
  // exactly instead of the flat 2 h guess, and the calendar can draw a real span.
  const endInit = value?.end_at && !value.all_day ? new Date(value.end_at * 1000) : null
  const [endTime, setEndTime] = useState(endInit ? `${pad(endInit.getHours())}:${pad(endInit.getMinutes())}` : '')
  // Clearing the start time makes it an all-day rendez-vous, whose window is the whole
  // day — a leftover end would be a ghost the server drops anyway.
  const setStartTime = (v: string) => {
    setTime(v)
    if (!v) setEndTime('')
  }
  // « Qui » — the household people this rendez-vous concerns. ONE multi-select (calm:
  // pick each face once). Stored in `passengers`; `member_id` is written as the
  // denormalized primary (people[0]) — the single-car "qui a l'auto" holder and the
  // back-compat face for pre-multi rows. Seed order: an edited row's passengers, else
  // its legacy single member_id, else a member peek seed.
  const seedPeople = parsePeopleIds(value?.passengers)
  const [people, setPeople] = useState<string[]>(
    seedPeople.length ? seedPeople : value?.member_id ? [value.member_id] : value ? [] : seedWith?.memberId ? [seedWith.memberId] : [],
  )
  const togglePerson = (id: string) => setPeople((cur) => (cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]))
  // « Avec » — the OPTIONAL external counterpart of a rendez-vous: a « Le cercle »
  // person ("Mamie visite") OR a Business ("vet", "plombier"). Independent of « Qui »
  // above (the vet appointment IS for the kids — the two axes coexist); only business
  // vs contact stay mutually exclusive (one external entity). People/businesses come
  // from their shared caches; a failed fetch just hides that option.
  const [contactId, setContactId] = useState<string | null>(value?.contact_id ?? (value ? null : seedWith?.contactId ?? null))
  const [businessId, setBusinessId] = useState<string | null>(value?.business_id ?? (value ? null : seedWith?.businessId ?? null))
  const [pickText, setPickText] = useState(
    value?.contact_name ?? value?.business_name ?? (value ? '' : seedWith?.memberId ? '' : seedWith?.name ?? ''),
  )
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
  const online = useOnline()
  const [bringInput, setBringInput] = useState('')
  const [bringDraft, setBringDraft] = useState<string[]>([])
  const [bringBusy, setBringBusy] = useState(false)
  const [bringErr, setBringErr] = useState(false)
  // Returns the created (or already-selected) template id, so submit() can auto-create
  // an un-saved draft and attach it — nothing typed is silently dropped. Online-only
  // (needs the new id synchronously to auto-select; useWrite would return null queued).
  async function createBringList(): Promise<string | null> {
    const items = bringDraft.map((s) => s.trim()).filter(Boolean)
    if (!items.length || bringBusy) return bringTemplateId
    setBringBusy(true)
    setBringErr(false)
    try {
      const res = await api<{ id: string }>('todo-templates', {
        method: 'POST',
        body: { title: title.trim() || t.operator.bringDefaultName, items },
      })
      setBringTemplateId(res.id)
      setBringDraft([])
      setBringInput('')
      await qc.invalidateQueries({ queryKey: TODO_TEMPLATES_KEY })
      return res.id
    } catch {
      // Keep the draft so nothing typed is lost, but DON'T swallow the failure — the
      // list genuinely wasn't created (online-only), so surface it instead of leaving
      // the operator thinking it saved.
      setBringErr(true)
      return null
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
  // « L'auto » — the optional ride layer: does this event take a household car? The
  // people riding are « Qui » above (no separate passenger list); a cercle contact in
  // « Avec » still reads as a carpool parent driving their car. Default off so a plain
  // event is unchanged. Collapsed in a Disclosure (calm: secondary).
  const { cars, hasCar, primary } = useCars()
  // A new ride (defaultRide) pre-picks the household car so it's a one-tap add.
  const [carId, setCarId] = useState<string | null>(value?.car_id ?? (defaultRide && primary ? primary.id : null))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const write = useWrite()

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim() || !date || busy) return
    const startAt = Math.floor(new Date(`${date}T${time || '00:00'}`).getTime() / 1000)
    if (!Number.isFinite(startAt)) return
    // If the user typed « À apporter » items but never tapped « Créer la liste »,
    // auto-create the list now and attach it — so nothing typed is silently lost.
    const effectiveBring = bringDraft.length && !bringTemplateId ? await createBringList() : bringTemplateId
    // Weekly with no weekday picked → the server defaults to the anchor's (UTC)
    // weekday. We don't compute it here: local getDay() could disagree with the
    // server's UTC expansion and recur on the wrong day.
    const fields = {
      title: title.trim(),
      startAt,
      allDay: !time,
      // « Qui » is the source of truth (stored in passengers); member_id is the
      // denormalized primary (people[0]) for the car holder + legacy single-face
      // reads. « Avec » (contact/business) is independent; only business vs contact
      // are mutually exclusive (the server keeps that one external answer).
      memberId: people[0] ?? null,
      contactId: businessId ? null : contactId,
      businessId,
      recur,
      leadSeconds: lead,
      // null (not undefined) so a PATCH that clears « Jusqu'à » actually clears the
      // stored end rather than leaving the old one in place.
      endAt: endTime ? Math.floor(new Date(`${date}T${endTime}`).getTime() / 1000) : null,
      carId,
      passengers: people,
      bringTemplateId: effectiveBring,
    }
    setBusy(true)
    setErr(false)
    try {
      await write('events', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...fields } : fields,
        // CAR_KEY too: a rendez-vous can take the car (« Prend l'auto »), so /api/car
        // resolves from this very row. Without it the board glance and /voiture kept
        // showing the pre-save answer until the next poll.
        affectedKeys: [EVENTS_KEY, BOARD_KEY, MONTH_KEY, CAR_KEY],
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
      {/* Native date/time inputs can't take a `placeholder`, and iOS's own faint
          "jj/mm/aaaa" / "--:--" hint is invisible on light themes — an empty box
          reads as unlabelled. Give each a visible label via the same `.recur__row`
          pattern the Répéter / Afficher dès rows below already use (Marc, 2026-07-04). */}
      <label className="recur__row mono">
        <span>{t.operator.eventDateLabel}</span>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={t.operator.eventDateLabel}
        />
      </label>
      <label className="recur__row mono">
        <span>{t.operator.eventTimeLabel}</span>
        <input
          className="input"
          type="time"
          value={time}
          onChange={(e) => setStartTime(e.target.value)}
          aria-label={t.operator.eventTimeLabel}
        />
      </label>
      {/* Optional « Jusqu'à ». Only offered once a start time exists: an all-day
          rendez-vous already spans the whole day. Blank stays the default — a point,
          exactly as before — so nothing about an existing rendez-vous changes. */}
      {time && (
        <label className="recur__row mono">
          <span>{t.operator.eventUntilLabel}</span>
          <input
            className="input"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            aria-label={t.operator.eventUntilLabel}
          />
        </label>
      )}
      {members.length > 0 && (
        <>
          <p className="mono event-transport__label">{t.operator.eventPeople}</p>
          <MemberPicker
            faces={members.map(toFace)}
            values={people}
            onToggle={togglePerson}
            ariaLabel={t.operator.eventPeople}
          />
        </>
      )}
      {/* « Avec » — the optional EXTERNAL counterpart: someone from Le cercle or a
          Business (vet, plombier…). Independent of « Qui » above; business vs contact
          stay one answer. */}
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
          frequentsKey="event-who"
          onPick={(opt) => {
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
      {/* « Répéter » and « Afficher dès » sat here as two permanently-open select
          rows, and both are at their default on nearly every rendez-vous you write
          (« Jamais » · « Au moment même ») — two lines of machinery between « Qui »
          and the two optional sections below, answering questions almost nobody
          asked. Folded into a third optional section, they read like what they are.
          It opens itself the moment either carries a real answer, so EDITING a
          repeating rendez-vous (or one with a lead time) never hides it.
          NOTE, deliberately not cargo-culted: ChoreForm, HomeProjectForm and
          HabitForm keep their RecurPicker inline. There it costs ONE row and it is
          the point of the form — a chore's rotation and a habit's cadence ARE its
          recurrence. Here it was two rows of optional detail on a form whose subject
          is a single moment. */}
      <Disclosure
        label={t.operator.eventWhenMore}
        defaultOpen={recur != null || lead != null}
        className="event-when"
      >
        <RecurPicker value={recur} onChange={setRecur} />
        <LeadPicker value={lead} onChange={setLead} />
      </Disclosure>
      {/* The event form is ONE form: a plain rendez-vous up top, then three OPTIONAL
          sections (calm: collapsed by default). The last two replace the old separate
          ＋ « Trajet » / « Activité » tiles — fill only what you need. */}
      {/* « Prend l'auto » — the optional transport answer, and the ONLY thing that
          makes a rendez-vous occupy « L'auto ». Deliberately NOT called « Trajet »:
          there is one noun in this app — un rendez-vous — and taking the car is a
          plain yes/no on it, exactly like « À apporter » below. (A separate "trajet"
          concept is what made a rendez-vous and a car booking read as two different
          things while being one row.) Tap the active car again to clear = doesn't
          take the car. The people riding are « Qui » above; a cercle person in
          « Avec » still reads as someone else driving.
          Hidden when the household explicitly has no car — nothing to take. */}
      {hasCar && (
        <Disclosure
          label={t.operator.eventTakesCar}
          defaultOpen={carId != null || !!defaultRide}
          className="event-transport"
        >
          {/* With a single household car the chip IS the yes/no, so the extra
              « Quelle auto ? » prompt would just repeat the Disclosure's own label. */}
          {cars.length > 1 && <p className="mono event-transport__label">{t.operator.eventCarWho}</p>}
          <Cluster>
            {cars.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`btn btn--ghost${carId === c.id ? ' is-active' : ''}`}
                aria-pressed={carId === c.id}
                style={carId === c.id && c.color ? { borderColor: c.color, color: c.color } : undefined}
                onClick={() => setCarId(carId === c.id ? null : c.id)}
              >
                {c.name}
              </button>
            ))}
          </Cluster>
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
                aria-pressed={bringTemplateId === tp.id}
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
                <button type="button" className="btn" disabled={bringBusy || !online} onClick={createBringList}>
                  <InlineIcon name="check-bold" size={15} /> {t.operator.bringCreate}
                </button>
                {/* Online-only (needs the new id synchronously to attach it). Say so
                    when offline, and surface a real failure instead of silently
                    dropping the typed list — the draft is kept either way. */}
                {!online && <StatusMessage tone="info">{t.offline.unavailable}</StatusMessage>}
                {bringErr && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
              </>
            )}
          </div>
        )}
      </Disclosure>
      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter
        saveLabel={value ? t.common.save : t.operator.addEvent}
        saveDisabled={!title.trim() || !date}
        busy={busy}
        onCancel={onCancel}
      />
    </form>
  )
}
