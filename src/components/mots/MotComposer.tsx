import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api, ApiError } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useSurface } from '../../lib/surface'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { imgUrl } from '../../lib/image'
import { type Member } from '../../lib/members'
import { MEMBERS_KEY, MOTS_KEY } from '../../lib/queryKeys'
import { MemberSwitcher } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import { EditField } from '../EditField'
import { MemoControls } from '../MemoControls'

// « Laisse un mot » composer — the board ＋ FAB « Mot » panel (#mots). Pick a recipient
// face (or the whole Maisonnée), then type a line OR record a voice clip / drawing /
// photo. The recipient is chosen EXPLICITLY here (it does NOT follow the device profile —
// you rarely leave yourself a mot); default Maisonnée. Surface-switched like CercleNotes:
// the always-in-view face ROW on a kiosk, the collapsed tap-to-open chip on mobile.
// Media memos reuse MemoControls (endpoint='mots', carrying { recipient_id }); a text mot
// goes through useWrite so it queues offline.
export function MotComposer({ onDone }: { onDone: () => void }) {
  const t = useT()
  const fn = t.mots
  const write = useWrite()
  const { surface } = useSurface()
  const [recipient, setRecipient] = useState<string | null>(null) // null = Maisonnée
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const voice = useVoiceInput(setText)

  const { data } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') })
  const members = data?.members ?? []
  const faces = members.map((m) => ({
    id: m.id,
    name: m.display_name,
    colour: m.colour,
    photoUrl: m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null,
  }))

  async function submitText(v: string) {
    const value = v.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await write('mots', { method: 'POST', body: { recipient_id: recipient, text: value }, affectedKeys: [MOTS_KEY] })
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
      {/* À qui — the recipient face. Maisonnée (everyone) is the neutral default. */}
      <p className="sheet__group-label mono">{fn.toWhom}</p>
      {surface === 'kiosk' ? (
        <MemberSwitcher faces={faces} value={recipient} onChange={setRecipient} allLabel={fn.toMaisonnee} ariaLabel={fn.toWhom} />
      ) : (
        <div className="mot-composer__face">
          <FaceSelect faces={faces} value={recipient} onChange={setRecipient} allLabel={fn.toMaisonnee} ariaLabel={fn.toWhom} />
        </div>
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
      <MemoControls onDone={onDone} endpoint="mots" affectedKey={MOTS_KEY} extraBody={{ recipient_id: recipient }} />
    </div>
  )
}
