import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useCalm } from '../lib/calm'
import { useSpeak, playNarration } from '../lib/speak'
import { Icon, InlineIcon } from './Icon'
import { tintInk, wash } from '../lib/colors'
import { imgUrl } from '../lib/image'
import { api } from '../lib/api'
import { useOptimisticMutation } from '../lib/optimistic'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { chime, clock } from '../lib/cookTimers'

// The RUN of one routine — the calm "right now / then" picture story extracted
// from KidView so it can play on EVERY surface, not just the locked toddler
// kiosk: a parent on their phone, the wall tablet, a guest, all run the same UI
// off the same data (KidView mounts it after its face-picker; the /routine/:id/run
// scene mounts it directly). ONE big hero card at a time, narrated on tap, with
// the whole routine beneath as a picture filmstrip (current step lifted, done
// ones ✓). Tapping the card (or the arrow) speaks it and settles it done — the
// SAME gentle state every time (deterministic, no variable reward, NFR-CALM-2) —
// then the story moves on. When the day is done it ends on a handwritten "sweet
// dreams" and STOPS — no auto-advance, no nag — but offers a quiet, deliberate
// "Recommencer" so a redo is a choice, not a streak hook; the day resets server-side.
interface PlayerCard {
  icon: string
  label: string
  narration?: string
  // Optional per-step countdown (e.g. 120 = a 2-minute teeth brush). When set, the
  // step grows a tap-to-start countdown ring (calm: never force-advances).
  seconds?: number
}
export interface PlayerRoutine {
  id: string
  memberName: string | null
  color: string | null
  name: string
  cards: PlayerCard[]
  // Parallel parent-voice clip keys (feature #17 A), one per card ('' = none → TTS).
  cardsNarration?: string[]
  // Parallel card photo keys (feature #17 C), one per card ('' = none → emoji).
  cardsPhoto?: string[]
  doneIdx: number[]
}
// The shape GET /api/routines returns — the optimistic toggle rewrites doneIdx in
// this cache the same way whether KidView or the run scene owns the query.
type RoutinesData = { routines: PlayerRoutine[] }

export function RoutinePlayer({
  routine,
  ro,
  exitTo = '/board',
  onBack,
  backLabel,
}: {
  routine: PlayerRoutine
  // Read-only guest (a sitter on the kiosk): hide the ▶ start + →/✓ finish so they
  // can browse + hear steps + use a step timer, but never commit progress.
  ro?: boolean
  // Where the top-left exit goes (the kiosk leaves to /board; the parent scene
  // returns to the Routines tab).
  exitTo?: string
  // When present (KidView with several routines), a bottom "← back to faces" link.
  onBack?: () => void
  backLabel?: string
}) {
  const t = useT()
  const { calm } = useCalm()
  const speak = useSpeak()

  // Toggle one card done for today. Optimistic so the tap feels instant on a cheap
  // tablet; on failure the shared hook rolls back and resyncs. Owns the mutation
  // itself (not passed in) so both mount points get the same correct behaviour.
  const toggle = useOptimisticMutation<RoutinesData, { routineId: string; cardIdx: number; done: boolean }>({
    queryKey: ROUTINES_KEY,
    mutationFn: (v) => api('routines', { method: 'PATCH', body: v }),
    apply: (old, v) => ({
      routines: old.routines.map((r) =>
        r.id === v.routineId
          ? { ...r, doneIdx: v.done ? [...r.doneIdx, v.cardIdx] : r.doneIdx.filter((i) => i !== v.cardIdx) }
          : r,
      ),
    }),
  })

  // "Recommencer" — wipe today's ✓ so the routine plays fresh again (the calm
  // STOP is the absence of a nag, not a lock: a kid who wants to do it again, or a
  // parent re-running it, can — deliberately, no streak/reward). Optimistic so the
  // recap clears instantly; the backend deletes the day's run row.
  const resetRun = useOptimisticMutation<RoutinesData, { routineId: string }>({
    queryKey: ROUTINES_KEY,
    mutationFn: (v) => api('routines', { method: 'PATCH', body: { ...v, reset: true } }),
    apply: (old, v) => ({
      routines: old.routines.map((r) => (r.id === v.routineId ? { ...r, doneIdx: [] } : r)),
    }),
  })

  // One continuous run, not a per-step start/stop: tap ▶ ONCE to begin (reads the
  // first step aloud), then → through each step, ✓ on the last. Each → laps the
  // step's time; the clock keeps running between steps. Count-up, no score; the end
  // shows the total. (Distinct from a step's own tap-to-start countdown below.)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // How long each step took (card index → seconds), built up as steps finish so
  // the end can show a total. Session-local — a gentle "look how you did", not data
  // we persist; a reload starts it fresh.
  const [times, setTimes] = useState<Record<number, number>>({})
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  // Switching to another routine (KidView picker, or a deep-link change) resets the
  // stopwatch + tally.
  useEffect(() => {
    setRunning(false)
    setElapsed(0)
    setTimes({})
  }, [routine.id])

  // Read a step aloud WITHOUT marking it done — hear what to do first, then do it.
  function readAloud(idx: number) {
    if (idx < 0 || idx >= routine.cards.length) return
    const text = routine.cards[idx].narration ?? routine.cards[idx].label
    playNarration(routine.cardsNarration?.[idx], text, speak)
  }
  function startStep(idx: number) {
    setElapsed(0)
    setRunning(true)
    readAloud(idx)
  }
  // Advance one step: lap the current step's time, mark it done (which moves the
  // story to the next card), keep the clock running — until the LAST step, where it
  // stops and the recap appears.
  function advance(idx: number) {
    const taken = elapsed
    const isLast = idx >= routine.cards.length - 1
    setElapsed(0)
    if (!routine.doneIdx.includes(idx)) setTimes((m) => ({ ...m, [idx]: taken }))
    toggle.mutate({ routineId: routine.id, cardIdx: idx, done: true })
    if (isLast) {
      setRunning(false)
      // A pre-reader can't read the "sweet dreams" card — say it (the SAME gentle
      // line every time, NFR-CALM-2).
      speak(t.kid.allDone)
    } else {
      readAloud(idx + 1)
    }
  }

  // Play it again: clear the day's ✓ and the session stopwatch so it starts at the
  // first card, fresh. The kid taps ▶ to begin again (we don't auto-run — calm).
  function restart() {
    if (ro) return
    resetRun.mutate({ routineId: routine.id })
    setRunning(false)
    setElapsed(0)
    setTimes({})
  }

  const tint = routine.color ?? '#88A36F'
  const allDone = routine.cards.length > 0 && routine.doneIdx.length >= routine.cards.length
  // Calm ON (default): finish and STOP on a calm "sweet dreams". Calm OFF: never
  // dead-end — fall through to the last card, still re-tappable.
  const showAllDone = allDone && calm

  // The story position: the first not-yet-done card (else the last).
  const firstUndone = routine.cards.findIndex((_, i) => !routine.doneIdx.includes(i))
  const curIdx = firstUndone === -1 ? routine.cards.length - 1 : firstUndone
  const cur = routine.cards[curIdx]

  // Time spent so far across steps finished this session (plus the running one) —
  // a quiet line on the recap (a parent's glance; the kid's recap is the pictures).
  const tallied = Object.values(times).reduce((a, b) => a + b, 0)
  const totalSecs = tallied + (running ? elapsed : 0)

  return (
    <div className="kid">
      <div className="tdl" style={{ background: wash(tint) }}>
        <div className="tdl-top">
          <Link to={exitTo} className="tdl-exit" aria-label={t.kid.exit}>
            <Icon name="arrow-right-bold" size={20} style={{ transform: 'rotate(180deg)' }} />
          </Link>
          <div className="tdl-name">{routine.memberName ? `${routine.memberName} · ${routine.name}` : routine.name}</div>
          <div style={{ width: 44 }} />
        </div>

        <div className="tdl-stage">
          {showAllDone ? (
            <>
              <div className="tdl-illus" style={{ background: tint }} aria-hidden="true">
                <span className="tdl-illus-emoji">✿</span>
              </div>
              <div className="tdl-sweet">{t.kid.allDone}</div>
              {/* The story again, in pictures: every step wearing its ✓. Tap one to
                  hear it — a pre-reader relives the routine without reading. */}
              <div className="tdl-recap">
                {routine.cards.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    className="tdl-recap__step"
                    onClick={() => playNarration(routine.cardsNarration?.[i], c.narration ?? c.label, speak)}
                    aria-label={c.label}
                  >
                    {routine.cardsPhoto?.[i] ? (
                      <img className="tdl-recap__photo" src={imgUrl(routine.cardsPhoto[i])} alt="" aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true">{c.icon || '○'}</span>
                    )}
                    <span className="tdl-recap__check" aria-hidden="true">
                      <Icon name="check-bold" size={14} />
                    </span>
                  </button>
                ))}
              </div>
              {totalSecs > 0 && <div className="tdl-total mono">⏱ {clock(totalSecs)}</div>}
              {/* A gentle, deliberate "do it again" — not a streak hook, just the
                  choice the calm STOP leaves open. A guest can't commit progress. */}
              {!ro && (
                <button type="button" className="tdl-again" onClick={restart} style={{ color: tintInk(tint) }}>
                  <InlineIcon name="arrow-counter-clockwise-bold" /> {t.kid.again}
                </button>
              )}
            </>
          ) : (
            <>
              {/* The whole step is a picture you tap to hear — no instructional
                  text; the picture + audio carry the meaning (NFR-KID-2). */}
              <button
                type="button"
                className="tdl-illus tdl-illus--tap"
                style={{ background: tint }}
                onClick={() => readAloud(curIdx)}
                aria-label={cur?.label}
              >
                {routine.cardsPhoto?.[curIdx] ? (
                  <img className="tdl-illus-photo" src={imgUrl(routine.cardsPhoto[curIdx])} alt="" />
                ) : (
                  <span className="tdl-illus-emoji">{cur?.icon || '○'}</span>
                )}
              </button>
              <button
                type="button"
                className="tdl-what"
                style={{ color: tintInk(tint) }}
                onClick={() => readAloud(curIdx)}
                aria-label={cur?.label}
              >
                {cur?.label}
              </button>

              {/* A per-step countdown when this step carries a timer (e.g. brush
                  teeth for 2 min). Tap-to-start, calm: a soft chime + ✓ at zero, but
                  it NEVER force-advances or nags — the kid still taps → to continue.
                  Keyed by curIdx so it resets fresh on every step. */}
              {cur?.seconds ? <Countdown key={curIdx} seconds={cur.seconds} tint={tint} /> : null}

              {/* The whole routine as a picture filmstrip: every step in order, the
                  current one lifted + ringed ("you are here"), finished ones softened
                  with a ✓. Non-interactive: a calm progress display, not a menu. */}
              <div className="tdl-strip" aria-hidden="true">
                {routine.cards.map((c, k) => {
                  const done = routine.doneIdx.includes(k)
                  const state = done ? 'done' : k === curIdx ? 'on' : 'wait'
                  return (
                    <span key={k} className={`tdl-step tdl-step--${state}`}>
                      <span className="tdl-step__pic">
                        {routine.cardsPhoto?.[k] ? (
                          <img src={imgUrl(routine.cardsPhoto[k])} alt="" />
                        ) : (
                          <span className="tdl-step__emoji">{c.icon || '○'}</span>
                        )}
                      </span>
                      {done && (
                        <span className="tdl-step__check">
                          <Icon name="check-bold" size={14} />
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>

              {/* Start ONCE (▶), then advance with →, and ✓ on the last. A guest
                  never sees these (they commit progress) — the tap-to-hear picture /
                  label + the step timer above still work. */}
              {!ro &&
                (running ? (
                  <div className="tdl-timer">
                    <span className="tdl-clock mono" aria-live="polite">
                      {clock(elapsed)}
                    </span>
                    <button
                      type="button"
                      className="tdl-finish"
                      onClick={() => advance(curIdx)}
                      aria-label={curIdx >= routine.cards.length - 1 ? t.kid.finish : t.kid.tapNext}
                    >
                      <Icon name={curIdx >= routine.cards.length - 1 ? 'check-bold' : 'arrow-right-bold'} size={34} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="tdl-start" onClick={() => startStep(curIdx)} aria-label={t.kid.start}>
                    <Icon name="play-bold" size={22} />
                  </button>
                ))}

              {/* Calm OFF never shows the recap, so the routine "ends" on its last
                  card with every step ✓. Offer the same deliberate restart here so a
                  redo doesn't dead-end on a re-tappable last step. */}
              {!ro && allDone && (
                <button type="button" className="tdl-again" onClick={restart} style={{ color: tintInk(tint) }}>
                  <InlineIcon name="arrow-counter-clockwise-bold" /> {t.kid.again}
                </button>
              )}
            </>
          )}
        </div>

        {onBack && (
          <button type="button" className="kid__exit mono" onClick={onBack}>
            <InlineIcon name="arrow-left-bold" /> {backLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// One step's tap-to-start countdown ring (e.g. the dentist's two minutes for
// brushing teeth). Idle: shows the duration + "tap to start". Running: a ring
// drains as it counts down (mm:ss in the middle); tap pauses / resumes. At zero: a
// soft chime + a gentle vibration + a ✓ pulse, and it STOPS — it never advances the
// routine or nags (NFR-CALM). Tapping a finished timer restarts it. The chime is
// the shared cook-timer "ding-ding" so the whole app sounds the same.
function Countdown({ seconds, tint }: { seconds: number; tint: string }) {
  const t = useT()
  const [left, setLeft] = useState(seconds)
  const [running, setRunning] = useState(false)
  const done = left <= 0

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => clearInterval(id)
  }, [running])
  // Ring out + stop the moment it reaches zero (separate from the ticker so the
  // chime fires exactly once, on the running→done edge).
  useEffect(() => {
    if (!running || left > 0) return
    setRunning(false)
    chime()
    try {
      navigator.vibrate?.([200, 100, 200])
    } catch {
      /* no vibration API — the chime + the ✓ pulse carry it */
    }
  }, [left, running])

  function tap() {
    if (done) {
      setLeft(seconds) // restart a finished timer
      setRunning(true)
    } else {
      setRunning((r) => !r) // first tap starts; later taps pause / resume
    }
  }

  // Fraction elapsed → how far the ring has drained (0 full, 1 empty).
  const p = seconds > 0 ? 1 - left / seconds : 1
  const hint = done ? t.routines.timerDone : running ? t.routines.timerPause : t.routines.timerStart
  return (
    <button
      type="button"
      className={'tdl-countdown' + (running ? ' is-running' : '') + (done ? ' is-done' : '')}
      style={{ '--tint': tint, '--p': String(p) } as React.CSSProperties}
      onClick={tap}
      aria-label={`${hint} · ${clock(left)}`}
    >
      <span className="tdl-countdown__face">
        <span className="tdl-countdown__time mono">
          {done ? <Icon name="check-bold" size={30} /> : clock(left)}
        </span>
      </span>
      <span className="tdl-countdown__hint mono">{hint}</span>
    </button>
  )
}
