import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useT, useLang } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api } from '../../lib/api'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { Disclosure } from '../Disclosure'
import { colourFor } from '../../lib/things'
import { groupByMonth, ageAt } from '../../lib/year'
import { CARE_LOG_KEY, TRIPS_KEY, MEMBERS_KEY } from '../../lib/queryKeys'
import { useCarnets, carnetEmoji, CARNET_COLOUR, type CareLog } from '../../lib/carnets'
import { useGallery } from '../../lib/drawingGallery'
import type { Trip } from '../voyage/voyage'
import type { OperatorMember } from '../../lib/members'

// « La maison cette année » (B-8, bmad/09) — the house's diary: ONE quiet,
// read-only chronological read over the year's EXISTING append-only records —
// care_log entries, chore completions, finished trips, kept drawings. Names,
// faces and dates, NEVER counts (the chore-ledger rule, NFR-CALM-1) — so no
// tallies, no badges, and the month Disclosures carry no count chip. Derived
// entirely from created_at/at/date columns already there (D-17: the memory
// index is created_at, never a tracking column) and read cold-path: fetched
// once when this sub-section opens, never polled (D-18 — no new poll, and the
// only backend touch was widening chores-ledger's `?since` floor to a year).

const YEAR_SEC = 366 * 86400

// The chores-ledger row shape (mirrors functions/api/chores-ledger.ts).
interface LedgerHelper {
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
  helpers: LedgerHelper[]
}

// One diary line, whatever its source: a colour spine, a title, a soft context
// line (day + where), and the faces involved.
interface Face {
  name: string
  kind: string | null
  photo: string | null
  colour: string | null
}
interface Entry {
  key: string
  at: number
  spine: string
  title: string
  sub: string
  faces: Face[]
  // A destination the entry re-opens as (a finished trip → its album scene).
  to?: string
}

// Cold-path read options: cache and sit still — the diary is an album you open,
// not a surface that must stay fresh (a write still invalidates by prefix).
const cold = { staleTime: 5 * 60_000 }

export function HouseDiarySection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'
  const nowSec = Math.floor(Date.now() / 1000)
  const since = nowSec - YEAR_SEC
  // Local midnight of today — a trip whose (inclusive) last day is before today
  // is finished. DST-safe: setHours pins the real local boundary.
  const todayStart = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000)

  const care = useQuery({
    // Household-wide read (no ?carnet) — a distinct sub-key under CARE_LOG_KEY so
    // any care-log write still refreshes it via the prefix invalidation.
    queryKey: [...CARE_LOG_KEY, 'household'],
    queryFn: () => api<{ entries: CareLog[] }>('care-log'),
    ...cold,
  })
  const carnets = useCarnets({ live: false })
  const chores = useQuery({
    // Local key: the year window is read only here (['chores-ledger'] alone is
    // ChoreLedger's 30-day glance — two windows, two cache rows).
    queryKey: ['chores-ledger', 'year'],
    queryFn: () => api<{ ledger: LedgerRow[] }>(`chores-ledger?since=${since}`),
    ...cold,
  })
  const trips = useQuery({
    queryKey: TRIPS_KEY,
    queryFn: () => api<{ trips: Trip[] }>('trips'),
    // Trips are operator-scoped server-side; on a kiosk this read 403s — fail
    // soft (no retry storm), the diary simply shows no trips there.
    retry: false,
    ...cold,
  })
  const drawings = useGallery()
  const members = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<{ members: OperatorMember[] }>('members'),
    ...cold,
  })

  const carnetById = new Map((carnets.data?.carnets ?? []).map((c) => [c.id, c]))
  const memberById = new Map((members.data?.members ?? []).map((m) => [m.id, m]))
  const face = (m: OperatorMember, suffix = ''): Face => ({
    name: m.display_name + suffix,
    kind: m.avatar_kind,
    photo: m.avatar_ref,
    colour: m.colour,
  })

  const entries: Entry[] = []
  // Care notes — what was serviced/installed/bought, on which carnet.
  for (const e of care.data?.entries ?? []) {
    if (e.at < since || e.at > nowSec) continue
    const c = carnetById.get(e.carnetId)
    entries.push({
      key: `care-${e.id}`,
      at: e.at,
      spine: c?.color || CARNET_COLOUR,
      title: `${c ? carnetEmoji(c) : '📦'} ${e.title}`,
      sub: c?.name ?? '',
      faces: [],
    })
  }
  // Chores done — the ledger's rows, same voice (who pitched in, which day).
  for (const r of chores.data?.ledger ?? []) {
    entries.push({
      key: `chore-${r.date}-${r.choreId}`,
      at: r.date,
      spine: colourFor('chore', r.choreColor),
      title: r.choreTitle,
      sub: '',
      faces: r.helpers.map((h) => ({
        name: h.name ?? t.operator.ledgerHelperChild,
        kind: h.avatarKind,
        photo: h.avatarRef,
        colour: h.colour,
      })),
    })
  }
  // Finished trips — entered at the day they ended, with who came.
  for (const tr of trips.data?.trips ?? []) {
    if (tr.end_at == null || tr.end_at >= todayStart || tr.end_at < since) continue
    entries.push({
      key: `trip-${tr.id}`,
      at: tr.end_at,
      spine: tr.colour,
      title: `🧳 ${tr.title}`,
      sub: tr.destination ?? '',
      faces: tr.members.map((id) => memberById.get(id)).filter((m): m is OperatorMember => !!m).map((m) => face(m)),
      // A finished trip re-opens as its album (B-12) — the diary is its doorway.
      to: `/voyage/${tr.id}`,
    })
  }
  // Kept drawings — credited like the gallery (« Léa · 3 ans » when the birth
  // year is known; never guessed).
  for (const d of drawings.data?.drawings ?? []) {
    if (d.created_at < since) continue
    const author = d.member_id ? memberById.get(d.member_id) : undefined
    const age = author ? ageAt(author.birthday, d.created_at) : null
    entries.push({
      key: `draw-${d.id}`,
      at: d.created_at,
      spine: colourFor('note', author?.colour),
      title: `🎨 ${t.operator.diaryDrawing}`,
      sub: '',
      faces: author ? [face(author, age != null ? ` · ${t.memo.ageN(age)}` : '')] : [],
    })
  }

  entries.sort((a, b) => b.at - a.at)
  const months = groupByMonth(entries, (e) => e.at)

  const monthLabel = (sec: number) =>
    new Date(sec * 1000).toLocaleDateString(loc, { month: 'long', year: 'numeric' })
  const dayLabel = (sec: number) =>
    new Date(sec * 1000).toLocaleDateString(loc, { weekday: 'short', day: 'numeric' })

  const loading = care.isLoading || chores.isLoading || drawings.isLoading

  const monthRows = (rows: Entry[]) => (
    <ul className="ledger__rows">
      {rows.map((e) => (
        <li key={e.key} className="ledger__row">
          <span className="ledger__spine" style={{ background: e.spine }} aria-hidden="true" />
          <div className="ledger__body">
            {e.to ? (
              <Link to={e.to} className="ledger__chore ledger__chore--link">
                {e.title}
              </Link>
            ) : (
              <span className="ledger__chore">{e.title}</span>
            )}
            <span className="ledger__name">
              {dayLabel(e.at)}
              {e.sub ? ` · ${e.sub}` : ''}
            </span>
            {e.faces.length > 0 && (
              <span className="ledger__helpers">
                {e.faces.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="ledger__helper">
                    <Avatar kind={f.kind} photo={f.photo} colour={f.colour} name={f.name} size={28} />
                    <span className="ledger__name">{f.name}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )

  return (
    <OperatorSection title={t.operator.diaryTitle} hint={t.operator.diaryHint} help={help} helpKey="houseDiary">
      {loading ? null : months.length === 0 ? (
        <EmptyState tone="calm">{t.operator.diaryEmpty}</EmptyState>
      ) : (
        <div className="ledger">
          {months.map(([monthSec, rows], i) =>
            // The newest month reads openly; older months rest folded behind a calm
            // Disclosure (finite glance — a year never fills the page unasked). No
            // count chip on the summary: no counts anywhere in memory copy.
            i === 0 ? (
              <div key={monthSec} className="ledger__day">
                <h3 className="ledger__date mono">{monthLabel(monthSec)}</h3>
                {monthRows(rows)}
              </div>
            ) : (
              <Disclosure key={monthSec} label={monthLabel(monthSec)}>
                {monthRows(rows)}
              </Disclosure>
            ),
          )}
        </div>
      )}
    </OperatorSection>
  )
}
