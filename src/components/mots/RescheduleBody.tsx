import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { MOTS_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { type Mot } from '../../lib/mots'
import { ScheduleFields, dateStr, hhmm } from './ScheduleFields'

// The sender-outbox reschedule sheet — move a « Plus tard » mot to a new moment, or send it
// now (surface_at:null). Seeded from the mot's current surface_at. Reuses ScheduleFields so
// the presets match the composer; the write goes through useWrite (offline-queueable) and the
// server re-validates that the new time is still in the future (else it surfaces now).
export function RescheduleBody({ mot, onDone }: { mot: Mot; onDone: () => void }) {
  const fn = useT().mots
  const write = useWrite()
  const seed = mot.surface_at ? new Date(mot.surface_at * 1000) : new Date()
  const [date, setDate] = useState(() => dateStr(seed))
  const [time, setTime] = useState(() => hhmm(seed))
  const at = date ? Math.floor(new Date(`${date}T${time || '00:00'}`).getTime() / 1000) : null

  const save = (surface_at: number | null) => {
    void write('mots', { method: 'PATCH', body: { id: mot.id, surface_at }, affectedKeys: [MOTS_KEY, BOARD_KEY] }).catch(
      () => {},
    )
    onDone()
  }

  return (
    <div className="mot-composer">
      <ScheduleFields date={date} time={time} onDate={setDate} onTime={setTime} />
      <div className="mot-composer__sched">
        <button type="button" className="btn btn--primary mono" onClick={() => save(at)}>
          {fn.reschedule}
        </button>
        <button type="button" className="btn btn--ghost mono" onClick={() => save(null)}>
          {fn.sendNow}
        </button>
      </div>
    </div>
  )
}
