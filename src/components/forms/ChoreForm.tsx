import { useState } from 'react'
import { useWrite } from '../../lib/write'
import { useLang, useT } from '../../i18n'
import { ColorPicker } from '../ColorPicker'
import { Chip } from '../Chip'
import { EditField } from '../EditField'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { LeadPicker } from '../LeadPicker'
import { StatusMessage } from '../StatusMessage'
import { FormFooter } from '../FormFooter'
import { MemberPicker } from '../MemberPicker'
import { toFace } from '../FormScene'
import { anchorSecToDate, dateToAnchorSec, recurOf, todayAnchorDate } from '../../lib/recurLabel'
import { choreTemplates } from '../../lib/routineTemplates'
import { MONTH_KEY, CHORES_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { colourFor } from '../../lib/things'

// The complete chore (corvée) form — title (with common presets), a round-robin
// rotation of members, a colour, and an optional schedule. Shared by Settings ▸
// Chores and the Add sheet. Owns its POST (create) / PATCH (edit); calls
// onSaved() when done. Pass `value` to edit an existing chore in place (and a
// `key` so it re-inits when the target changes), mirroring EventForm.
interface FormMember {
  id: string
  display_name: string
}
export interface ChoreInit {
  id: string
  title: string
  color?: string
  rotation_json?: string | null
  recur_json?: string | null
  recur_start?: number | null
  lead_seconds?: number | null
  announce_evening?: number | null
}

function parseRotation(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function ChoreForm({
  members,
  value,
  initialStart,
  onSaved,
  onCancel,
}: {
  members: FormMember[]
  value?: ChoreInit | null
  initialStart?: number // local-midnight unix s to pre-fill a NEW chore's recurrence anchor (from the calendar)
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const presets = choreTemplates(lang)
  const [title, setTitle] = useState(value?.title ?? '')
  const [rotation, setRotation] = useState<string[]>(parseRotation(value?.rotation_json))
  const [color, setColor] = useState(colourFor('chore', value?.color))
  // Optional schedule — "tous les jeudis". null = a standing chore (no schedule).
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(value?.recur_json))
  // The recurrence anchor (which date "every 2 weeks" counts from). Defaults to
  // today; only sent when there's a recurrence — a standing chore has no anchor.
  const [start, setStart] = useState(
    anchorSecToDate(value?.recur_start) || (initialStart ? anchorSecToDate(initialStart) : '') || todayAnchorDate(),
  )
  // Calm "Bientôt" lead — only meaningful with a schedule (a no-schedule chore is a
  // standing to-do with no occurrence date to anchor against).
  const [lead, setLead] = useState<number | null>(value?.lead_seconds ?? null)
  // D-21 (bmad/10) « Sortir le bac » — opt-in "evening before" board announce;
  // only meaningful with a schedule, same reasoning as lead above.
  const [announceEvening, setAnnounceEvening] = useState(!!value?.announce_evening)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const write = useWrite()

  function toggleRot(id: string) {
    setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))
  }
  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setErr(false)
    const fields = {
      title: title.trim(),
      rotation,
      color,
      recur,
      start: recur ? dateToAnchorSec(start) : null,
      leadSeconds: recur ? lead : null, // a standing (no-schedule) chore has no occurrence to remind about
      announceEvening: recur ? announceEvening : false, // same reasoning: no schedule, no "evening before"
    }
    try {
      await write('chores', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...fields } : fields,
        affectedKeys: [CHORES_KEY, BOARD_KEY, MONTH_KEY],
      })
      if (!value) {
        // Create: clear for the next one. Edit: leave the fields (the section
        // closes the inline form via onSaved).
        setTitle('')
        setRotation([])
        setColor('#88A36F')
        setRecur(null)
        setStart(todayAnchorDate())
        setLead(null)
        setAnnounceEvening(false)
      }
      onSaved()
    } catch {
      // Keep the filled form — resetting on a failed write loses the chore.
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="operator__inline-form operator__chore-form" onSubmit={submit}>
      {/* The NAME leads, then the shortcuts that fill it. « Courantes » is seven
          chips — ~340px, most of a phone screen — and it sat ABOVE this field, so a
          form whose whole job is "type a chore" opened on a list of chores you might
          not want and pushed the box below the fold (measured: contentTopPx 347 at
          390px, the worst of any form in the state matrix). The chips are genuinely
          one-tap useful, so they stay visible rather than folding away — just under
          the thing they fill in, which is also the order you read them in: type it,
          or tap one. Same move as the recipe builder's « Remplir vite ». */}
      <EditField
        as="div"
        value={title}
        onChange={setTitle}
        onSubmit={() => submit()}
        submitIcon={null}
        placeholder={t.operator.addChore}
        ariaLabel={t.operator.addChore}
      />
      <div className="picker-chips mono">
        <span className="picker-chips__label">{t.operator.choreCommon}</span>
        {presets.map((p) => (
          <Chip key={p.label} onClick={() => setTitle(p.icon ? `${p.icon} ${p.label}` : p.label)}>
            {p.icon} {p.label}
          </Chip>
        ))}
      </div>
      {/* The round-robin rotation: tap faces in turn order; the ordinal badge shows
          who takes the first turn (the rotation is an ordered id array). */}
      <MemberPicker
        faces={members.map(toFace)}
        values={rotation}
        onToggle={toggleRot}
        ariaLabel={t.operator.forWho}
        ordinals
      />
      <ColorPicker value={color} onChange={setColor} label={t.operator.colorLabel} />
      <RecurPicker value={recur} onChange={setRecur} />
      {recur && (
        <>
          <label className="recur__row mono">
            <span>{t.operator.choreStart}</span>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <LeadPicker value={lead} onChange={setLead} />
          {/* D-21 (bmad/10) « Sortir le bac » — opt-in "evening before" board
              announce, the fête-line sibling (a single household display line,
              never a push — NFR-CALM-1). */}
          <label className="operator__check mono">
            <input
              type="checkbox"
              checked={announceEvening}
              onChange={(e) => setAnnounceEvening(e.target.checked)}
            />
            {t.operator.announceEveningLabel}
          </label>
          <p className="operator__seg-hint mono">{t.operator.announceEveningHint}</p>
        </>
      )}
      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <FormFooter
        saveLabel={value ? t.common.save : t.operator.addChore}
        saveDisabled={!title.trim()}
        busy={busy}
        onCancel={onCancel}
      />
    </form>
  )
}
