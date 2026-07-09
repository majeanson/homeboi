import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { formatAgo } from '../../lib/format'
import { todayLocalDay } from '../../lib/localDay'
import { composeSinceMorning, type ChangeRow } from '../../lib/sinceMorning'
import { Sheet } from '../Sheet'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'

// « Depuis ce matin » (A-3, bmad/10) — tap the board greeting for a cold, pull-only
// peek at today's writes by face. Reuses the shared Sheet chrome (NOT
// EntityDetailSheet — this lists many rows, not one entity) and the chores-ledger
// `.ledger` row family (Avatar + a line + a soft "when") instead of a one-off list.
//
// ⚠ the doc's sharpest calm edge: this must NEVER become a badge, a count, or a
// persistent feed. The query body only mounts while `open` — so closing the sheet
// unmounts the last observer and `gcTime: 0` drops the cache instantly. Nothing is
// fetched until the sheet opens, and nothing survives after it closes: no unread
// state, no "N new" anywhere, even in memory.
export function TodayChangesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} ariaLabel={t.sinceMorning.title}>
      <h3>{t.sinceMorning.title}</h3>
      {open && <TodayChangesBody />}
    </Sheet>
  )
}

function TodayChangesBody() {
  const t = useT()
  const { lang } = useLang()
  const { data, isLoading } = useQuery({
    // Keyed on today's local day so a peek held open across local midnight (a kiosk
    // never closed) still reads as a fresh day on the next open, not yesterday's.
    queryKey: ['today-changes', todayLocalDay()],
    queryFn: () => api<{ entries: ChangeRow[] }>('today-changes'),
    gcTime: 0,
  })

  const entries = composeSinceMorning(data?.entries ?? [], t)

  if (isLoading) return null
  if (entries.length === 0) return <EmptyState tone="calm">{t.sinceMorning.empty}</EmptyState>

  return (
    <div className="ledger">
      <ul className="ledger__rows">
        {entries.map((e) => (
          <li key={e.key} className="ledger__row">
            {e.face ? (
              <Avatar kind={e.face.kind} photo={e.face.photo} colour={e.face.colour} name={e.face.name} size={32} />
            ) : (
              // Face-less event line (decided, A-3): a neutral spine instead of a
              // face — the line names a fact, never claims a person.
              <span className="ledger__spine" style={{ background: 'var(--sky)' }} aria-hidden="true" />
            )}
            <div className="ledger__body">
              <span className="ledger__chore">{e.text}</span>
              <span className="ledger__name">{formatAgo(e.at * 1000, lang)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
