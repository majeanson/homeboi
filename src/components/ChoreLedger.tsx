import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { HelpTitle, type HelpMode } from '../lib/helpMode'
import { api } from '../lib/api'
import { Avatar } from './Avatar'
import { EmptyState } from './EmptyState'

// "Qui a fait quoi cette semaine ?" — the calm, READ-ONLY chore fairness ledger.
// It settles "it's not my turn" by SHOWING the recent shared record, not scoring
// it: day subheadings, the chore's colour spine, the names/faces who pitched in.
// Deliberately NO count, NO tally, NO ranking, NO "you're behind" (NFR-CALM-1) —
// observation only, neutral tone, no urgency. Reads the append-only contribution
// log via /api/chores-ledger (see functions/api/chores-ledger.ts).

interface Helper {
  memberId: string | null
  name: string | null
  role: string
  avatarKind: string | null
  avatarRef: string | null
  colour: string | null
}
interface LedgerRow {
  date: number
  choreId: string
  choreTitle: string
  choreColor: string | null
  helpers: Helper[]
}

// Page-local query key: the ledger is read only here (Réglages ▸ Corvées), so it
// stays beside its component rather than in src/lib/queryKeys.ts (cross-page only).
const LEDGER_KEY = ['chores-ledger']

export function ChoreLedger({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'
  const { data, isLoading } = useQuery({
    queryKey: LEDGER_KEY,
    queryFn: () => api<{ since: number; ledger: LedgerRow[] }>('chores-ledger'),
  })
  const ledger = data?.ledger ?? []

  // Group rows under a day subheading, newest day first (the API already sorts
  // newest-first; rows of the same day are contiguous).
  const days: { date: number; rows: LedgerRow[] }[] = []
  for (const row of ledger) {
    const last = days[days.length - 1]
    if (last && last.date === row.date) last.rows.push(row)
    else days.push({ date: row.date, rows: [row] })
  }

  const dayLabel = (sec: number) =>
    new Date(sec * 1000).toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <section className="surface operator__section">
      <HelpTitle help={help} k="choreLedger">{t.operator.ledgerTitle}</HelpTitle>
      {help?.bubbleFor('choreLedger')}

      {isLoading ? null : days.length === 0 ? (
        <EmptyState tone="calm">{t.operator.ledgerEmpty}</EmptyState>
      ) : (
        <div className="ledger">
          {days.map((d) => (
            <div key={d.date} className="ledger__day">
              <h3 className="ledger__date mono">{dayLabel(d.date)}</h3>
              <ul className="ledger__rows">
                {d.rows.map((row) => (
                  <li key={`${d.date}-${row.choreId}`} className="ledger__row">
                    {/* The chore's colour spine — same cue as everywhere a chore
                        shows; purely decorative, never a status. */}
                    <span
                      className="ledger__spine"
                      style={{ background: row.choreColor ?? '#88A36F' }}
                      aria-hidden="true"
                    />
                    <div className="ledger__body">
                      <span className="ledger__chore">{row.choreTitle}</span>
                      <span className="ledger__helpers">
                        {row.helpers.map((h, i) => {
                          // A deleted member (null name) falls back to a calm,
                          // role-based label rather than a blank — never a score.
                          const label = h.name ?? t.operator.ledgerHelperChild
                          return (
                            <span key={`${h.memberId ?? h.role}-${i}`} className="ledger__helper">
                              <Avatar
                                kind={h.avatarKind}
                                photo={h.avatarRef}
                                colour={h.colour}
                                name={label}
                                size={28}
                              />
                              <span className="ledger__name">{label}</span>
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
