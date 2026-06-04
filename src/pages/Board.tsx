import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaptureBar } from '../components/CaptureBar'
import { BigTiles, type Tile } from '../components/BigTiles'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, ApiError } from '../lib/api'
import { formatClock, formatTime } from '../lib/format'

// The wall board. Polls the whole board in one read on an interval. ZERO AI on
// this path. Tolerates wifi loss: a failed poll keeps the last good frame and
// flips a "showing cache" stamp instead of blanking. The day's list empties
// and stays empty — no counters, no score for clearing it.
interface Member { id: string; display_name: string; avatar_ref: string; is_child: number }
interface EventRow { id: string; title: string; start_at: number; all_day: number; member_id: string | null }
interface ListRow { id: string; text: string; source: string }
interface Helper { name: string | null; role: string }
interface ChoreRow { id: string; title: string; rotation_json: string; current_idx: number; last_done_at: number | null; helpers?: Helper[] }
interface BoardData {
  syncedAt: number
  scope: string
  members: Member[]
  today: EventRow[]
  upcoming: EventRow[]
  tonight: { id: string; title: string; cook_member_id: string | null } | null
  list: ListRow[]
  chores: ChoreRow[]
}

const POLL_MS = 20000

export function Board() {
  const t = useT()
  const { lang } = useLang()
  const { audience } = useAudience()
  const [data, setData] = useState<BoardData | null>(null)
  const [stale, setStale] = useState(false)
  const [unauth, setUnauth] = useState(false)
  const [clock, setClock] = useState(() => formatClock(lang, Date.now()))
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api<BoardData>('board')
      setData(res)
      setStale(false)
      setUnauth(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUnauth(true)
      // Any other failure: keep the last frame, mark it stale.
      else setStale(true)
    }
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [load])

  useEffect(() => {
    const c = setInterval(() => setClock(formatClock(lang, Date.now())), 30000)
    return () => clearInterval(c)
  }, [lang])

  const memberName = (id: string | null) => data?.members.find((m) => m.id === id)?.display_name ?? null

  async function toggleList(item: ListRow) {
    // Optimistic: drop it from the open list immediately, then persist.
    setData((d) => (d ? { ...d, list: d.list.filter((i) => i.id !== item.id) } : d))
    await api('list', { method: 'PATCH', body: { id: item.id, checked: true } }).catch(() => load())
  }

  async function doneChore(chore: ChoreRow) {
    // Parent completing: advances the rotation + logs a parent contribution.
    await api('chores', { method: 'PATCH', body: { id: chore.id, role: 'parent' } }).catch(() => {})
    load()
  }

  async function helpChore(chore: ChoreRow) {
    // Toddler "I helped": logs a child contribution WITHOUT finishing the chore
    // (complete:false) — the shared-task model, where both roles can pitch in.
    await api('chores', { method: 'PATCH', body: { id: chore.id, role: 'child', complete: false } }).catch(() => {})
    load()
  }

  if (unauth) {
    return (
      <main className="narrow">
        <p className="lead">{t.pair.lead}</p>
        <Link to="/pair" className="btn btn--primary">
          {t.home.ctaPair}
        </Link>
      </main>
    )
  }

  // Toddler lens on the same board data: a few big, read-aloud tiles for what's
  // happening today. No capture bar, no admin — glance + tap to hear.
  if (audience === 'toddler') {
    const tiles: Tile[] = []
    if (data?.tonight) {
      tiles.push({
        key: 'tonight',
        icon: '🍽',
        label: data.tonight.title,
        sub: t.board.tonight,
        narration: `${t.board.tonight}: ${data.tonight.title}`,
      })
    }
    for (const e of data?.today ?? []) {
      tiles.push({
        key: e.id,
        icon: '📌',
        label: e.title,
        sub: e.all_day ? t.board.allDay : formatTime(e.start_at, lang),
        narration: e.title,
      })
    }
    // Chores a toddler can help with: tapping logs "I helped" (shared-task).
    for (const c of data?.chores ?? []) {
      tiles.push({
        key: `chore-${c.id}`,
        icon: '🧹',
        label: c.title,
        sub: t.board.help,
        narration: c.title,
        onTap: () => helpChore(c),
      })
    }
    return (
      <main className="kid__main">
        {!data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : (
          <BigTiles tiles={tiles} empty={t.board.today} />
        )}
      </main>
    )
  }

  return (
    <>
      <main className="board__main">
        <div className="board__clock mono">{clock}</div>
        <CaptureBar onCaptured={load} />

        {!data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : (
          <div className="board__grid">
            {/* Today */}
            <section className="surface board__zone">
              <h2 className="board__zone-title">{t.board.today}</h2>
              {data.today.length === 0 ? (
                <p className="board__empty mono">—</p>
              ) : (
                <ul className="board__events">
                  {data.today.map((e) => (
                    <li key={e.id}>
                      <span className="board__event-time mono">
                        {e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
                      </span>
                      <span className="board__event-title">{e.title}</span>
                      {memberName(e.member_id) && (
                        <span className="board__event-who mono">{memberName(e.member_id)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Tonight */}
            <section className="surface board__zone board__zone--tonight">
              <h2 className="board__zone-title">{t.board.tonight}</h2>
              {data.tonight ? (
                <>
                  <p className="board__tonight-meal">{data.tonight.title}</p>
                  {memberName(data.tonight.cook_member_id) && (
                    <p className="mono board__tonight-cook">
                      {memberName(data.tonight.cook_member_id)} {t.board.cooks}
                    </p>
                  )}
                </>
              ) : (
                <p className="board__empty mono">{t.board.nothingTonight}</p>
              )}
            </section>

            {/* List */}
            <section className="surface board__zone">
              <h2 className="board__zone-title">{t.board.list}</h2>
              {data.list.length === 0 ? (
                <p className="board__empty mono">{t.board.listEmpty}</p>
              ) : (
                <ul className="board__list">
                  {data.list.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="board__list-item" onClick={() => toggleList(item)}>
                        <span className="board__check" aria-hidden="true">
                          ☐
                        </span>
                        <span>{item.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Chores */}
            <section className="surface board__zone">
              <h2 className="board__zone-title">{t.board.chores}</h2>
              {data.chores.length === 0 ? (
                <p className="board__empty mono">{t.board.choresEmpty}</p>
              ) : (
                <ul className="board__chores">
                  {data.chores.map((c) => {
                    const rotation = safeRotation(c.rotation_json)
                    const whoId = rotation.length ? rotation[c.current_idx % rotation.length] : null
                    return (
                      <li key={c.id} className="board__chore">
                        <div>
                          <span className="board__chore-title">{c.title}</span>
                          {whoId && (
                            <span className="board__chore-turn mono">
                              {t.board.turn} {memberName(whoId)}
                            </span>
                          )}
                          {c.helpers && c.helpers.length > 0 && (
                            <span className="board__chore-helped mono">
                              {t.board.helpedBy} {c.helpers.map((h) => h.name ?? (h.role === 'child' ? '👶' : '🧑')).join(', ')}
                            </span>
                          )}
                        </div>
                        <button type="button" className="btn btn--ghost mono" onClick={() => doneChore(c)}>
                          {t.board.done}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Upcoming */}
            {data.upcoming.length > 0 && (
              <section className="surface board__zone board__zone--wide">
                <h2 className="board__zone-title">{t.board.upcoming}</h2>
                <ul className="board__upcoming mono">
                  {data.upcoming.map((e) => (
                    <li key={e.id}>
                      <span>{formatTime(e.start_at, lang)}</span> {e.title}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <p className="board__synced mono">
          {stale ? t.board.offline : `${t.board.synced} ${clock}`}
        </p>
      </main>
    </>
  )
}

function safeRotation(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
