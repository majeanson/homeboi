import { useState } from 'react'
import { useT } from '../i18n'
import { ApiError } from '../lib/api'
import { useWrite } from '../lib/write'
import { useRecordUndo } from '../lib/toast'
import { useVoiceInput } from '../lib/useVoiceInput'
import { CATS, type CatKey } from '../lib/cats'
import { CAPTURE_KEYS } from '../lib/captureKeys'
import { Icon, type IconName } from './Icon'
import { EditField } from './EditField'
import { Disclosure } from './Disclosure'
import { StatusMessage } from './StatusMessage'

// « Classer » — the capture spine. Type or speak one line; Workers AI routes it to an
// event / task / list item / pantry-low / meal / leftover / upkeep / note. It lived inside the
// board's ＋ sheet, wedged directly above the audio-memo buttons — which is what made
// the ＋ sheet unreadable: the field's mic (speech → text → AI files it) and « Mémo
// vocal » (record a clip → a fridge note) wore the same glyph and meant opposite things.
//
// Capture is a WRITE spine and the Ask sheet was explicitly a READ one ("Read-only: this
// never writes (capture stays the write spine)" — functions/api/ask.ts). Putting them on
// one voice surface, behind a Demander/Classer segment, is what finally separates the two
// mics: on the Ask sheet the mic's meaning is whatever the segment says, and the ＋ sheet's
// note tile is left to be a plain note that a memo can be clipped to.
//
// Extracted verbatim from AddSheet (state, offline write, degraded picker, re-route
// cleanup, compensating undo) so BOTH surfaces can't drift — AskSheet renders it; the ＋
// sheet no longer has a capture tile at all.

export type CaptureType = 'event' | 'meal' | 'task' | 'list-item' | 'pantry-low' | 'leftover' | 'upkeep' | 'note'

// The 8 AI-router types as re-file tiles.
const TYPE_DRESS: { type: CaptureType; cat: CatKey; icon: IconName }[] = [
  { type: 'event', cat: 'event', icon: 'calendar-blank-bold' },
  { type: 'meal', cat: 'meal', icon: 'bowl-food-bold' },
  { type: 'leftover', cat: 'meal', icon: 'arrow-counter-clockwise-bold' },
  { type: 'task', cat: 'chore', icon: 'hand-heart-bold' },
  // « Entretien » (home_projects upkeep) — the recurring-maintenance capture
  // ("gouttières chaque automne"); wears the season card's broom.
  { type: 'upkeep', cat: 'chore', icon: 'broom-bold' },
  { type: 'list-item', cat: 'list', icon: 'sparkle-bold' },
  { type: 'pantry-low', cat: 'pantry', icon: 'carrot-bold' },
  { type: 'note', cat: 'routine', icon: CATS.routine.icon },
]

// One row a capture routing inserted (mirrors the Cleanup shape that
// functions/api/capture returns as `routed.cleanup`): the table + id, so a
// correction (re-route) or a calm undo can drop exactly what was created.
type Cleanup = { table: string; id: string }

// Each cleanup table → its own DELETE endpoint (every one already takes { id }).
// Lets the compensating undo remove the row(s) a routing created by REUSING each
// resource's existing delete — no new server handler. Mirrors capture.ts's
// CLEANUP_TABLES allowlist (keep the two in step).
const CAPTURE_UNDO_EP: Record<string, string> = {
  events: 'events',
  tasks: 'chores',
  list_items: 'list',
  pantry_low: 'pantry',
  meals: 'meals',
  meal_leftovers: 'meal-leftovers',
  home_projects: 'home-projects',
  notes: 'notes',
}


export function CaptureForm({ autoFocus }: { autoFocus?: boolean }) {
  const t = useT()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  const [text, setText] = useState('')
  const voice = useVoiceInput(setText)
  // The last route's result, kept so we can (a) confirm "Ajouté : X", (b) offer the
  // re-route tiles, and (c) re-file with the ORIGINAL text + the rows to undo — the
  // input is cleared after a successful route, so a correction sources from here.
  const [routed, setRouted] = useState<{ text: string; label: string; degraded: boolean; cleanup: Cleanup[] } | null>(
    null,
  )
  // A-2 (bmad/10): capture goes through the offline-aware `write()` — the raw text is
  // enqueued to the SAME /api/capture endpoint and replayed on reconnect, so
  // routing/parseWhen still happen server-side, just later. `queued` confirms that calm
  // hand-off; `err` stays for a REAL server rejection (4xx/5xx) — a case `write()`
  // rethrows rather than queues, so a genuine failure isn't silently eaten.
  const [err, setErr] = useState(false)
  const [queued, setQueued] = useState(false)
  const [busy, setBusy] = useState(false)

  // Compensating undo for a capture: the row(s) are already live, so delete each
  // via its own resource endpoint. Offline-aware (useWrite) and idempotent — a row
  // already gone (e.g. it was re-routed) just no-ops.
  async function undoCapture(cleanup: Cleanup[]) {
    for (const row of cleanup) {
      const ep = CAPTURE_UNDO_EP[row.table]
      if (!ep) continue
      try {
        await write(ep, { method: 'DELETE', body: { id: row.id }, affectedKeys: CAPTURE_KEYS })
      } catch {
        /* already gone or a server reject — nothing to take back */
      }
    }
  }

  // forceType (a re-route correction tile, or the degraded type-picker) skips the AI
  // router. A re-route re-files the text we already captured (the input was cleared on
  // the first success) and hands the server the PREVIOUS routing's rows to delete
  // (`undo`), so a correction MOVES the capture instead of duplicating it.
  async function submit(value: string, forceType?: CaptureType) {
    const v = (forceType ? routed?.text ?? value : value).trim()
    if (!v || busy) return
    setErr(false)
    setQueued(false)
    setBusy(true)
    const prevCleanup = forceType ? routed?.cleanup : undefined
    setRouted(null)
    try {
      const res = await write<{ type: string; degraded: boolean; routed: { kind: string; label: string; cleanup?: Cleanup[] } }>(
        'capture',
        { method: 'POST', body: { text: v, forceType, undo: prevCleanup }, affectedKeys: CAPTURE_KEYS },
      )
      if (res.queued) {
        // Offline: no routed/undo UI (there's nothing routed yet) — just the calm
        // "it's kept" confirmation, and clear the box like a successful capture.
        setText('')
        setQueued(true)
        return
      }
      const degraded = res.data.degraded && !forceType
      const label = res.data.routed?.label ?? v
      const cleanup = res.data.routed?.cleanup ?? []
      setRouted({ text: v, label, degraded, cleanup })
      if (!degraded) setText('')
      // Calm undo on every REAL route (not the degraded fallback note, which is
      // awaiting a re-route): the created row is live, so record a compensating
      // entry that deletes it. A re-route records a fresh entry for the new row;
      // any prior entry's delete then no-ops (the server already dropped that row).
      if (!degraded && cleanup.length) {
        recordUndo({ message: `${t.capture.routed} ${label}`, onUndo: () => void undoCapture(cleanup) })
      }
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      // A real 4xx/5xx (the server answered and said no): surface it so the tap
      // isn't silently lost. write() does NOT queue this case (see write.ts).
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  // Shown DIRECTLY when a capture came back degraded (AI off → picking a type is
  // required work, not an optional tweak), and otherwise tucked behind the quiet
  // "Corriger" disclosure (a mis-route is rare, so the happy path stays the line).
  const rerouteTiles = (
    <div className="cat-grid">
      {TYPE_DRESS.map((ty) => (
        <button key={ty.type} type="button" className="cat-pick" onClick={() => void submit(text, ty.type)}>
          <span className="ct" style={{ background: CATS[ty.cat].wash }}>
            <Icon name={ty.icon} size={22} color={CATS[ty.cat].deep} />
          </span>
          <span>{t.capture.types[ty.type]}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="capture-form">
      <EditField
        value={text}
        onChange={setText}
        onSubmit={(v) => void submit(v)}
        submitLabel={t.common.add}
        submitLeadingIcon="plus-bold"
        submitVariant="primary"
        leadingIcon="sparkle-bold"
        voice={voice}
        voiceLabel={t.capture.voice}
        placeholder={voice.listening ? t.capture.listening : t.capture.placeholder}
        ariaLabel={t.common.add}
        autoFocus={autoFocus}
        busy={busy}
      />

      {queued && <StatusMessage tone="info">{t.capture.queued}</StatusMessage>}
      {err && <StatusMessage tone="error">{t.capture.failed}</StatusMessage>}

      {/* After a route, lead with just the calm confirmation line ("Ajouté : X").
          Correction is a mis-route recovery, not the happy path, so the 7 re-file
          tiles hide behind a quiet "Corriger" disclosure. The DEGRADED fallback (AI
          off) is different: picking a type is REQUIRED, so those tiles stay shown. */}
      {routed && (
        <>
          <p className="capture__routed mono">
            {routed.degraded ? t.capture.degraded : `${t.capture.routed} ${routed.label}`}
          </p>
          {routed.degraded ? (
            rerouteTiles
          ) : (
            <Disclosure label={t.capture.correct} className="capture__correct">
              {rerouteTiles}
            </Disclosure>
          )}
        </>
      )}
    </div>
  )
}
