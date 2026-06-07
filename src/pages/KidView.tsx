import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useCalm } from '../lib/calm'
import { useProfile } from '../lib/profile'
import { useSpeak } from '../lib/speak'
import { Icon } from '../components/Icon'
import { Loading, PairPrompt } from '../components/Fallback'
import { tintInk } from '../lib/colors'
import { imgUrl } from '../lib/image'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'

// The pre-reader surface, in Pip's calm "right now / then" picture story: ONE
// big card at a time, narrated on tap, with the next thing shown small and a
// row of dots for rhythm. Tapping the big card (or the arrow) speaks it and
// settles it done — the SAME gentle state every time (deterministic, no
// variable reward, NFR-CALM-2) — then the story moves to the next thing. When
// the day is done it ends on a handwritten "sweet dreams" and STOPS (no "do it
// again" hook). The day resets server-side, so tomorrow it's simply empty again.
interface Card {
  icon: string
  label: string
  narration?: string
}
interface Routine {
  id: string
  memberId: string | null
  memberName: string | null
  color: string | null
  avatarPhoto: string | null
  name: string
  cards: Card[]
  doneIdx: number[]
}
type RoutinesData = { routines: Routine[] }
const ROUTINES_KEY = ['routines']

// mm:ss for the gentle per-step stopwatch (count-up — no countdown, no pressure).
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function KidView() {
  const t = useT()
  const { calm } = useCalm()
  const { memberId: profileId } = useProfile()
  const speak = useSpeak()
  const qc = useQueryClient()
  const [pickedId, setPickedId] = useState<string | null>(null)

  // Left-on toddler kiosk: a parent's change from another device (ticking a
  // routine, editing cards) must land here without a manual reload. `live` polls
  // + refetches on focus — same freshness model as the board.
  const { data, error } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<RoutinesData>('routines'),
    ...live,
  })

  // Toggle one card done for today. Optimistic so the tap feels instant on a
  // cheap tablet; on failure we roll back and resync from the server.
  const toggle = useMutation({
    mutationFn: (v: { routineId: string; cardIdx: number; done: boolean }) =>
      api('routines', { method: 'PATCH', body: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ROUTINES_KEY })
      const prev = qc.getQueryData<RoutinesData>(ROUTINES_KEY)
      qc.setQueryData<RoutinesData>(ROUTINES_KEY, (old) =>
        old
          ? {
              routines: old.routines.map((r) =>
                r.id === v.routineId
                  ? { ...r, doneIdx: v.done ? [...r.doneIdx, v.cardIdx] : r.doneIdx.filter((i) => i !== v.cardIdx) }
                  : r,
              ),
            }
          : old,
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ROUTINES_KEY, ctx.prev)
      qc.invalidateQueries({ queryKey: ROUTINES_KEY })
    },
  })

  // Read a step aloud WITHOUT marking it done — a toddler hears what to do first,
  // then does it. (Separated from finishing it, which is the start/timer flow.)
  function readAloud(idx: number) {
    speak(picked?.cards[idx]?.narration ?? picked?.cards[idx]?.label)
  }

  // A gentle per-step stopwatch: the kid taps ▶ to start a step (and hear it),
  // does it while it counts up, then taps ✓ to finish — which marks it done and
  // moves to the next, until the whole routine is complete. Count-up, no score.
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // How long each step took (card index → seconds), built up as the kid finishes
  // steps so the end can show a per-step result and a total. Session-local: it's
  // a gentle "look how you did", not data we persist — a reload starts it fresh.
  const [times, setTimes] = useState<Record<number, number>>({})
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  // Switching to another child's routine resets the stopwatch + the tally.
  useEffect(() => {
    setRunning(false)
    setElapsed(0)
    setTimes({})
  }, [pickedId])

  function startStep(idx: number) {
    setElapsed(0)
    setRunning(true)
    readAloud(idx)
  }
  function finishStep(routine: Routine, idx: number) {
    setRunning(false)
    const taken = elapsed
    setElapsed(0)
    if (!routine.doneIdx.includes(idx)) setTimes((m) => ({ ...m, [idx]: taken }))
    toggle.mutate({ routineId: routine.id, cardIdx: idx, done: !routine.doneIdx.includes(idx) })
  }

  if (isUnauthorized(error)) return <div className="kid"><PairPrompt /></div>
  if (!data && !error) return <Loading />
  const routines = data?.routines ?? []

  if (routines.length === 0) {
    return (
      <div className="kid">
        <main className="narrow kid__none">
          <p>{t.kid.none}</p>
          <Link to="/board" className="btn">
            {t.kid.exit}
          </Link>
        </main>
      </div>
    )
  }

  // If this device already knows who's holding it (a picked profile, see
  // lib/profile), skip the "Choisis ton nom" face-picker and jump straight to
  // that member's routine(s) — no need to ask a name we already have. Falls
  // back to everyone if the identified member has no routine of their own.
  const mine = profileId ? routines.filter((r) => r.memberId === profileId) : []
  const identified = mine.length > 0
  const visible = identified ? mine : routines

  // "Pick your face" when there are several children's routines; a single
  // routine auto-selects so the toddler lands straight in the story. When
  // identified, the faces are all the same member, so we already filtered to
  // theirs above.
  const picked = visible.find((r) => r.id === pickedId) ?? (visible.length === 1 ? visible[0] : undefined)
  if (!picked) {
    return (
      <div className="kid">
        <main className="kid__pick">
          <h1 className="kid__pick-title">{identified ? t.kid.pickRoutine : t.kid.pick}</h1>
          <div className="kid__faces">
            {visible.map((r) => (
              <button
                key={r.id}
                type="button"
                className="kid__face"
                style={{ background: r.avatarPhoto ? 'var(--card)' : r.color ?? '#88A36F' }}
                onClick={() => setPickedId(r.id)}
              >
                {r.avatarPhoto ? (
                  <img className="kid__face-photo" src={imgUrl(r.avatarPhoto)} alt="" />
                ) : (
                  <span className="kid__face-initial">{(r.memberName ?? '?').slice(0, 1).toUpperCase()}</span>
                )}
                <span className="kid__face-name">{identified ? r.name : r.memberName ?? r.name}</span>
                {r.cards.length > 0 && (
                  <span className="kid__face-peek" aria-hidden="true">
                    {r.cards.slice(0, 4).map((c) => c.icon || '○').join(' ')}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Link to="/board" className="kid__exit mono">
            {t.kid.exit}
          </Link>
        </main>
      </div>
    )
  }

  const tint = picked.color ?? '#88A36F'
  const allDone = picked.cards.length > 0 && picked.doneIdx.length >= picked.cards.length
  // Calm ON (default): the routine finishes and STOPS on a calm "sweet dreams".
  // Calm OFF: never dead-end — fall through to the last card, still re-tappable.
  const showAllDone = allDone && calm

  // The story position: the first not-yet-done card (else the last).
  const firstUndone = picked.cards.findIndex((_, i) => !picked.doneIdx.includes(i))
  const curIdx = firstUndone === -1 ? picked.cards.length - 1 : firstUndone
  const cur = picked.cards[curIdx]
  const next = picked.cards[curIdx + 1]

  // Time spent so far across the steps finished this session (plus the one
  // running right now) — shown small during the routine and broken down per step
  // at the end so the kid can see how long they took.
  const tallied = Object.values(times).reduce((a, b) => a + b, 0)
  const totalSecs = tallied + (running ? elapsed : 0)
  const timedSteps = picked.cards.map((c, i) => ({ ...c, i, secs: times[i] })).filter((c) => c.secs != null)

  return (
    <div className="kid">
      <div className="tdl" style={{ background: tint + '22' }}>
        <div className="tdl-top">
          <Link to="/board" className="tdl-exit" aria-label={t.kid.exit}>
            <Icon name="arrow-right-bold" size={20} style={{ transform: 'rotate(180deg)' }} />
          </Link>
          <div className="tdl-name">{picked.memberName ? `${picked.memberName} · ${picked.name}` : picked.name}</div>
          <div style={{ width: 44 }} />
        </div>

        <div className="tdl-stage">
          {showAllDone ? (
            <>
              <div className="tdl-illus" style={{ background: tint }} aria-hidden="true">
                <span className="tdl-illus-emoji">✿</span>
              </div>
              <div className="tdl-sweet">{t.kid.allDone}</div>
              {timedSteps.length > 0 && (
                <div className="tdl-times">
                  <div className="tdl-times__head mono">{t.kid.yourTimes}</div>
                  <ul className="tdl-times__list">
                    {timedSteps.map((c) => (
                      <li key={c.i}>
                        <span className="tdl-times__step">
                          <span aria-hidden="true">{c.icon || '○'}</span> {c.label}
                        </span>
                        <span className="tdl-times__t mono">{fmtClock(c.secs as number)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="tdl-times__total">
                    <span>{t.kid.total}</span>
                    <span className="mono">{fmtClock(totalSecs)}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="tdl-illus tdl-illus--tap"
                style={{ background: tint }}
                onClick={() => readAloud(curIdx)}
                aria-label={cur?.label}
              >
                <span className="tdl-illus-emoji">{cur?.icon || '○'}</span>
              </button>
              <div className="tdl-now">{t.kid.rightNow}</div>
              <div className="tdl-what" style={{ color: tintInk(tint) }}>
                {cur?.label}
              </div>
              {/* Tapping the picture only reads it aloud — doing it is the ▶ flow below. */}
              <div className="tdl-hear mono" aria-hidden="true">
                🔊 {t.kid.tapHear}
              </div>

              {next && (
                <div className="tdl-next">
                  {t.kid.then}
                  <span className="pill">
                    <span aria-hidden="true">{next.icon}</span> {next.label}
                  </span>
                </div>
              )}

              <div className="tdl-dots" aria-hidden="true">
                {picked.cards.map((_, k) => (
                  <i key={k} className={picked.doneIdx.includes(k) ? 'done' : k === curIdx ? 'on' : ''} />
                ))}
              </div>

              {totalSecs > 0 && (
                <div className="tdl-total mono" aria-live="polite">
                  ⏱ {fmtClock(totalSecs)}
                </div>
              )}

              {running ? (
                <div className="tdl-timer">
                  <span className="tdl-clock mono" aria-live="polite">
                    {fmtClock(elapsed)}
                  </span>
                  <button type="button" className="tdl-finish" onClick={() => finishStep(picked, curIdx)}>
                    ✓ {t.kid.finish}
                  </button>
                </div>
              ) : (
                <button type="button" className="tdl-start" onClick={() => startStep(curIdx)}>
                  ▶ {t.kid.start}
                </button>
              )}
            </>
          )}
        </div>

        {visible.length > 1 && (
          <button type="button" className="kid__exit mono" onClick={() => setPickedId(null)}>
            {identified ? t.kid.pickRoutine : t.kid.pick}
          </button>
        )}
      </div>
    </div>
  )
}
