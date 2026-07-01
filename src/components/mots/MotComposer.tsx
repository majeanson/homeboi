import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api, ApiError } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useSurface } from '../../lib/surface'
import { useProfile } from '../../lib/profile'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { imgUrl } from '../../lib/image'
import { type Member } from '../../lib/members'
import { MEMBERS_KEY, MOTS_KEY } from '../../lib/queryKeys'
import { type Mot } from '../../lib/mots'
import { Icon } from '../Icon'
import { MemberSwitcher } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { EditField } from '../EditField'
import { MemoControls } from '../MemoControls'
import { ScheduleFields, todayDateStr, presetWhen } from './ScheduleFields'

// « Laisse un mot » composer — the board ＋ FAB « Mot » panel (#mots), AND the reply sheet.
// Pick a recipient face (or the whole Maisonnée), then type a line OR record a voice clip /
// drawing / photo. The recipient is chosen EXPLICITLY (it does NOT follow the device
// profile); default Maisonnée. Two add-ons:
//   • SCHEDULE (« Plus tard ») — an optional date+time → surface_at, so the mot waits hidden
//     until then (« bonne fête » on the morning, a reminder before they leave).
//   • REPLY — when `replyTo` is set the recipient is LOCKED to the original sender and the
//     composer shows « En réponse à … »; the new mot carries reply_to to thread them.
// Media memos reuse MemoControls (carrying recipient_id + surface_at + reply_to); a text mot
// goes through useWrite so it queues offline.

export function MotComposer({ replyTo, onDone }: { replyTo?: Mot; onDone: () => void }) {
  const t = useT()
  const fn = t.mots
  const write = useWrite()
  const { surface } = useSurface()
  const { memberId: profileId } = useProfile()
  // A reply is addressed back to the original sender; otherwise default Maisonnée.
  const [recipient, setRecipient] = useState<string | null>(replyTo ? replyTo.author_member_id : null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const voice = useVoiceInput(setText)

  // Schedule (« Plus tard ») — off by default (most mots are immediate, calm).
  const [scheduled, setScheduled] = useState(false)
  const [dateStr, setDateStr] = useState(todayDateStr)
  const [timeStr, setTimeStr] = useState('08:00')
  const surfaceAt =
    scheduled && dateStr ? Math.floor(new Date(`${dateStr}T${timeStr || '00:00'}`).getTime() / 1000) : null

  // « Me le rappeler » — the calmest reminder: a scheduled mot addressed to MYSELF, waiting on
  // my own face (no push, no badge). One tap sets recipient = me + opens the schedule at
  // tomorrow morning. Only when a face is picked and we're not already locked into a reply.
  const canRemindMe = !replyTo && !!profileId
  function remindMe() {
    if (!profileId) return
    setRecipient(profileId)
    setScheduled(true)
    const w = presetWhen('tomorrowAm')
    setDateStr(w.date)
    setTimeStr(w.time)
  }

  const { data } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') })
  const members = data?.members ?? []
  const replyName = replyTo ? members.find((m) => m.id === replyTo.author_member_id)?.display_name ?? null : null
  const faces = members.map((m) => ({
    id: m.id,
    name: m.display_name,
    colour: m.colour,
    photoUrl: m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null,
  }))

  const extraBody = { recipient_id: recipient, surface_at: surfaceAt, reply_to: replyTo?.id ?? null }

  async function submitText(v: string) {
    const value = v.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await write('mots', { method: 'POST', body: { text: value, ...extraBody }, affectedKeys: [MOTS_KEY] })
      setText('')
      onDone()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mot-composer">
      {replyTo ? (
        // Reply: recipient is fixed to the original sender — show « En réponse à … » instead
        // of a picker, with a snippet of the mot being answered.
        <p className="mot-composer__reply mono">
          <Icon name="arrow-left-bold" size={14} /> {replyName ? fn.replyTo(replyName) : fn.inReplyTo}
        </p>
      ) : (
        <>
          {/* À qui — the recipient face. Maisonnée (everyone) is the neutral default. */}
          <p className="sheet__group-label mono">{fn.toWhom}</p>
          {surface === 'kiosk' ? (
            <MemberSwitcher faces={faces} value={recipient} onChange={setRecipient} allLabel={fn.toMaisonnee} ariaLabel={fn.toWhom} />
          ) : (
            <div className="mot-composer__face">
              <FaceSelect faces={faces} value={recipient} onChange={setRecipient} allLabel={fn.toMaisonnee} ariaLabel={fn.toWhom} />
            </div>
          )}
          {/* « Me le rappeler » — a one-tap self-reminder: addresses the mot to my own face and
              schedules it for tomorrow morning. Calm alternative to a notification. */}
          {canRemindMe && (
            <button type="button" className="btn btn--sm btn--ghost mono mot-composer__remind" onClick={remindMe}>
              <Icon name="hourglass-high-bold" size={15} /> {fn.remindMe}
            </button>
          )}
        </>
      )}

      {/* Type the mot, or leave a voice / drawing / photo memo below. */}
      <EditField
        value={text}
        onChange={setText}
        onSubmit={submitText}
        submitLabel={fn.send}
        submitLeadingIcon="envelope-bold"
        submitVariant="primary"
        voice={voice}
        voiceLabel={t.capture.voice}
        placeholder={voice.listening ? t.capture.listening : fn.placeholder}
        ariaLabel={fn.compose}
        busy={busy}
        maxLength={2000}
      />

      {/* Schedule: hide the mot until a chosen moment. Optional, off by default. */}
      <div className="mot-composer__sched">
        <button
          type="button"
          className={'btn btn--sm' + (scheduled ? ' btn--primary' : '')}
          aria-pressed={scheduled}
          onClick={() => setScheduled((s) => !s)}
        >
          <Icon name="clock-bold" size={16} /> {fn.later}
        </button>
        {scheduled && <ScheduleFields date={dateStr} time={timeStr} onDate={setDateStr} onTime={setTimeStr} />}
      </div>

      <MemoControls onDone={onDone} endpoint="mots" affectedKey={MOTS_KEY} extraBody={extraBody} />
    </div>
  )
}
