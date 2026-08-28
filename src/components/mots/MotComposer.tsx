import { useState } from 'react'
import { facesFromMembers } from '../../lib/faces'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api, ApiError } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useSurface } from '../../lib/surface'
import { useProfile } from '../../lib/profile'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { type Member } from '../../lib/members'
import { MEMBERS_KEY, MOTS_KEY } from '../../lib/queryKeys'
import { type Mot } from '../../lib/mots'
import { Icon } from '../Icon'
import { MemberSwitcher } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { EditField } from '../EditField'
import { useMemoAttach } from '../MemoAttach'
import { ScheduleFields, todayDateStr, presetWhen } from './ScheduleFields'

// « Laisse un mot » composer — the board ＋ FAB « Mot » panel (#mots), AND the reply sheet.
// Pick a recipient face (or the whole Maisonnée), then write a line and/or clip a voice
// memo / drawing / photo onto it. The recipient is chosen EXPLICITLY (it does NOT follow
// the device profile); default Maisonnée. Two add-ons:
//   • SCHEDULE (« Plus tard ») — an optional date+time → surface_at, so the mot waits hidden
//     until then (« bonne fête » on the morning, a reminder before they leave). Its quick
//     presets now include « Me le rappeler » (demain matin, addressed to me) — which used
//     to be a rival top-level button that just opened this same panel.
//   • REPLY — when `replyTo` is set the recipient is LOCKED to the original sender and the
//     composer shows « En réponse à … »; the new mot carries reply_to to thread them.
// ONE write: text + any attachment go in a single POST through useWrite (offline-queued),
// because /api/mots takes both on one row (`if (!text && !(kind && mediaKey))`).

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
  // The 📎: a voice memo / drawing / photo joined TO this mot, not instead of it.
  const memo = useMemoAttach({ drawDraftId: 'mot' })

  // Schedule (« Plus tard ») — off by default (most mots are immediate, calm).
  const [scheduled, setScheduled] = useState(false)
  const [dateStr, setDateStr] = useState(todayDateStr)
  const [timeStr, setTimeStr] = useState('08:00')
  const surfaceAt =
    scheduled && dateStr ? Math.floor(new Date(`${dateStr}T${timeStr || '00:00'}`).getTime() / 1000) : null

  // « Me le rappeler » — the calmest reminder: a scheduled mot addressed to MYSELF, waiting on
  // my own face (no push, no badge). It is a PRESET of « Plus tard » (recipient = me, demain
  // matin), not a rival button: as its own top-level control it merely opened this same
  // schedule panel, which read as two ways to do one thing.
  const canRemindMe = !replyTo && !!profileId
  function remindMe() {
    if (!profileId) return
    setRecipient(profileId)
    const w = presetWhen('tomorrowAm')
    setDateStr(w.date)
    setTimeStr(w.time)
  }

  const { data } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') })
  const members = data?.members ?? []
  const replyName = replyTo ? members.find((m) => m.id === replyTo.author_member_id)?.display_name ?? null : null
  const faces = facesFromMembers(members)

  const extraBody = { recipient_id: recipient, surface_at: surfaceAt, reply_to: replyTo?.id ?? null }

  // ONE write for text + attachment. An attachment alone is a valid mot (a drawing
  // for a pre-reader), which is why EditField gets `allowEmpty` — but an empty mot
  // with nothing attached is not, and the server rejects it too («  Mot vide. »).
  async function submitMot(v: string) {
    const value = v.trim()
    if ((!value && !memo.draft) || busy) return
    setBusy(true)
    try {
      await write('mots', {
        method: 'POST',
        body: { text: value, ...memo.body, ...extraBody },
        affectedKeys: [MOTS_KEY],
      })
      setText('')
      memo.reset()
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
        </>
      )}

      {/* Write the mot, and/or clip a voice memo / drawing / photo onto it via the 📎
          inside the box. One field, one send — the memo no longer replaces the text. */}
      <EditField
        value={text}
        onChange={setText}
        onSubmit={submitMot}
        submitLabel={fn.send}
        submitLeadingIcon="envelope-bold"
        submitVariant="primary"
        voice={voice}
        voiceLabel={t.capture.voice}
        placeholder={voice.listening ? t.capture.listening : fn.placeholder}
        ariaLabel={fn.compose}
        busy={busy || memo.busy}
        allowEmpty={!!memo.draft}
        boxActions={memo.attachButton}
        maxLength={2000}
      >
        {memo.panel}
      </EditField>

      {/* Schedule: hide the mot until a chosen moment. Optional, off by default.
          « Me le rappeler » rides the preset row inside, not a second button. */}
      <div className="mot-composer__sched">
        <button
          type="button"
          className={'btn btn--sm' + (scheduled ? ' btn--primary' : '')}
          aria-pressed={scheduled}
          onClick={() => setScheduled((s) => !s)}
        >
          <Icon name="clock-bold" size={16} /> {fn.later}
        </button>
        {scheduled && (
          <ScheduleFields
            date={dateStr}
            time={timeStr}
            onDate={setDateStr}
            onTime={setTimeStr}
            extraPresets={
              canRemindMe ? (
                <button type="button" className="btn btn--sm btn--ghost mono" onClick={remindMe}>
                  <Icon name="hourglass-high-bold" size={15} /> {fn.remindMe}
                </button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  )
}
