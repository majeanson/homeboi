import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useCalm } from '../lib/calm'
import { isGuest } from '../lib/device'
import { useProfile } from '../lib/profile'
import { useSpeak, playNarration } from '../lib/speak'
import { Icon } from '../components/Icon'
import { Loading, PairPrompt } from '../components/Fallback'
import { tintInk, wash } from '../lib/colors'
import { imgUrl } from '../lib/image'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { useOptimisticMutation } from '../lib/optimistic'
import { timeOfDay } from '../lib/timeofday'
import { todRank, isRoutineTod, TOD_ICON, TOD_TINT } from '../lib/routineTod'
import { ROUTINES_KEY } from '../lib/queryKeys'

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
  timeOfDay: string | null
  cards: Card[]
  // Parallel parent-voice clip keys (feature #17 A), one per card ('' = none →
  // on-device TTS). Optional: older payloads predate it.
  cardsNarration?: string[]
  // Parallel card photo keys (feature #17 C), one per card ('' = none → the
  // card's emoji). Optional: older payloads predate it.
  cardsPhoto?: string[]
  doneIdx: number[]
}
type RoutinesData = { routines: Routine[] }

// mm:ss for the gentle per-step stopwatch (count-up — no countdown, no pressure).
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function KidView() {
  const t = useT()
  const { calm } = useCalm()
  // Read-only guest (toddler kiosk handed to a sitter): advancing a routine PATCHes
  // step progress (a write, via useOptimisticMutation — NOT writeWith, so it isn't
  // auto-refused). Hide the ▶ start + →/✓ finish so a guest can still browse and
  // hear steps read aloud, but never commit progress.
  const ro = isGuest()
  const { memberId: profileId } = useProfile()
  const speak = useSpeak()
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
  // cheap tablet; on failure the shared hook rolls back and resyncs.
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

  // Read a step aloud WITHOUT marking it done — a toddler hears what to do first,
  // then does it. (Separated from finishing it, which is the start/timer flow.)
  function readAloud(idx: number) {
    if (!picked || idx < 0 || idx >= picked.cards.length) return
    // Prefer the parent's recorded clip for this card (feature #17 A); fall back
    // to on-device TTS on any failure / when no clip was recorded.
    const text = picked.cards[idx].narration ?? picked.cards[idx].label
    playNarration(picked.cardsNarration?.[idx], text, speak)
  }

  // One continuous run, not a per-step start/stop: the kid taps ▶ ONCE to begin
  // (it reads the first step aloud), then → to move through each step, and ✓ on the
  // last one to finish — start, next, next, next, stop. Each → laps the current
  // step's time; the clock keeps running between steps. Count-up, no score; the end
  // shows every step's time + the total.
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

  // After the "sweet dreams" recap, drift back to the face picker so the wall
  // tablet is ready for the next child — only when a picker was actually used
  // (pickedId set); a single auto-selected routine has no picker to return to.
  useEffect(() => {
    if (!pickedId || !calm) return
    const r = (data?.routines ?? []).find((x) => x.id === pickedId)
    if (!r || r.cards.length === 0 || r.doneIdx.length < r.cards.length) return
    const id = setTimeout(() => setPickedId(null), 20_000)
    return () => clearTimeout(id)
  }, [data, pickedId, calm])

  function startStep(idx: number) {
    setElapsed(0)
    setRunning(true)
    readAloud(idx)
  }
  // Advance one step: lap the current step's time, mark it done (which moves the
  // story to the next card), and keep the clock running — until the LAST step,
  // where it stops and the recap appears. The timer is NOT reset between steps.
  function advance(routine: Routine, idx: number) {
    const taken = elapsed
    const isLast = idx >= routine.cards.length - 1
    setElapsed(0)
    if (!routine.doneIdx.includes(idx)) setTimes((m) => ({ ...m, [idx]: taken }))
    toggle.mutate({ routineId: routine.id, cardIdx: idx, done: true })
    if (isLast) {
      setRunning(false)
      // A pre-reader can't read the "sweet dreams" card — say it. The SAME
      // gentle line every time (deterministic, no variable reward, NFR-CALM-2).
      speak(t.kid.allDone)
    } else {
      readAloud(idx + 1)
    }
  }

  if (isUnauthorized(error)) return <div className="kid"><PairPrompt /></div>
  if (!data && !error) return <Loading />
  // A routine with no cards yet (a parent saved the shell, steps to come) has no
  // story to tell — keep it out of the kid surface entirely so the picker never
  // lands on an empty stage (curIdx would point at nothing).
  const routines = (data?.routines ?? []).filter((r) => r.cards.length > 0)

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
  // Surface the routine that matches the CURRENT moment first (morning shows
  // Matin first, evening shows Dodo), "anytime" next, the rest after — an
  // ORDERING cue only; everything stays visible and tappable (NFR-CALM).
  const tod = timeOfDay(Date.now())
  const visible = [...(identified ? mine : routines)].sort(
    (a, b) => todRank(tod, a.timeOfDay) - todRank(tod, b.timeOfDay),
  )

  // The picker: one spacious card per routine — there are usually only a few, so
  // each gets room to show what's inside (its step photos/emojis), whose it is,
  // and a calm status. A single routine auto-selects so the toddler lands straight
  // in the story. When identified (the device already knows the child) we skip the
  // avatar and the "Maya ·" prefix — every card is theirs (the operator's ask).
  const PREVIEW = 4
  const picked = visible.find((r) => r.id === pickedId) ?? (visible.length === 1 ? visible[0] : undefined)
  if (!picked) {
    return (
      <div className="kid">
        <main className="kid__pick">
          <h1 className="kid__pick-title">{identified ? t.kid.pickRoutine : t.kid.pick}</h1>
          <div className="kid__faces">
            {visible.map((r) => {
              const total = r.cards.length
              const doneCount = r.doneIdx.filter((i) => i >= 0 && i < total).length
              const done = total > 0 && doneCount >= total
              // A familiar-voice hint when the parent recorded any card (feature #17 A).
              const hasVoice = (r.cardsNarration ?? []).some((k) => !!k)
              const tint = r.color ?? '#88A36F'
              return (
                <button
                  key={r.id}
                  type="button"
                  className={'kid__face kid__routine' + (done ? ' is-done' : '')}
                  // A soft per-child colour wash so a shared kiosk reads "by person".
                  style={{ background: wash(tint) }}
                  onClick={() => {
                    // Say what was picked — audio confirmation is the pre-reader's
                    // "you tapped the right one" (NFR-KID-2).
                    speak(identified ? r.name : `${r.memberName ?? ''} ${r.name}`.trim())
                    setPickedId(r.id)
                  }}
                >
                  {/* The routine's moment, worn as a small picture badge — a
                      pre-reader spots "the moon one" without reading. */}
                  {isRoutineTod(r.timeOfDay) && (
                    <span className="kid__face-tod" aria-hidden="true">
                      <Icon name={TOD_ICON[r.timeOfDay]} size={22} color={TOD_TINT[r.timeOfDay]} />
                    </span>
                  )}
                  {/* Who it's for — only when several children share the device;
                      an identified device already knows, so we drop the avatar. */}
                  <span className="kid__routine-who">
                    {!identified &&
                      (r.avatarPhoto ? (
                        <img className="kid__routine-ava" src={imgUrl(r.avatarPhoto)} alt="" />
                      ) : (
                        <span className="kid__routine-ava kid__routine-ava--initial" style={{ background: tint }}>
                          {(r.memberName ?? '?').slice(0, 1).toUpperCase()}
                        </span>
                      ))}
                    <span className="kid__face-name">
                      {identified ? r.name : r.memberName ? `${r.memberName} · ${r.name}` : r.name}
                    </span>
                  </span>
                  {/* A real preview of the routine: each step as its photo (feature
                      #17 C) or its emoji — a pre-reader recognises "the one with the
                      toothbrush". Finished steps read softer (calm, deterministic). */}
                  {total > 0 && (
                    <span className="kid__routine-strip" aria-hidden="true">
                      {r.cards.slice(0, PREVIEW).map((c, i) => (
                        <span
                          key={i}
                          className={'kid__routine-slot' + (r.doneIdx.includes(i) ? ' is-done' : '')}
                        >
                          {r.cardsPhoto?.[i] ? (
                            <img className="kid__routine-thumb" src={imgUrl(r.cardsPhoto[i])} alt="" />
                          ) : (
                            <span className="kid__routine-emoji">{c.icon || '○'}</span>
                          )}
                        </span>
                      ))}
                      {total > PREVIEW && <span className="kid__routine-more">+{total - PREVIEW}</span>}
                    </span>
                  )}
                  {/* Status: a familiar-voice hint, then either a calm "done" or a
                      quiet how-far cue. Both reset daily — not a streak (NFR-CALM). */}
                  <span className="kid__routine-status mono">
                    {hasVoice && (
                      <span className="kid__routine-voice" title={t.kid.routineVoice}>
                        <Icon name="microphone-bold" size={15} />
                      </span>
                    )}
                    {done ? (
                      <span className="kid__routine-done">
                        <span aria-hidden="true">✓</span> {t.kid.routineDone}
                      </span>
                    ) : (
                      total > 0 && <span className="kid__routine-prog">{doneCount}/{total}</span>
                    )}
                  </span>
                </button>
              )
            })}
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
  // running right now) — shown small during the routine and as a quiet line on
  // the recap (a parent's glance; the kid's recap is the picture grid).
  const tallied = Object.values(times).reduce((a, b) => a + b, 0)
  const totalSecs = tallied + (running ? elapsed : 0)

  return (
    <div className="kid">
      <div className="tdl" style={{ background: wash(tint) }}>
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
              {/* The story again, in pictures: every step wearing its ✓. Tap one
                  to hear it — a pre-reader relives the routine without reading
                  (the old mm:ss table meant nothing to a three-year-old). */}
              <div className="tdl-recap">
                {picked.cards.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    className="tdl-recap__step"
                    onClick={() => playNarration(picked.cardsNarration?.[i], c.narration ?? c.label, speak)}
                    aria-label={c.label}
                  >
                    {picked.cardsPhoto?.[i] ? (
                      <img className="tdl-recap__photo" src={imgUrl(picked.cardsPhoto[i])} alt="" aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true">{c.icon || '○'}</span>
                    )}
                    <span className="tdl-recap__check" aria-hidden="true">✓</span>
                  </button>
                ))}
              </div>
              {totalSecs > 0 && <div className="tdl-total mono">⏱ {fmtClock(totalSecs)}</div>}
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
                {/* A parent's photo of the real thing wins over the emoji when set
                    (feature #17 C); falls back to the emoji otherwise. */}
                {picked.cardsPhoto?.[curIdx] ? (
                  <img className="tdl-illus-photo" src={imgUrl(picked.cardsPhoto[curIdx])} alt="" />
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

              {/* "Next" preview + the rhythm dots share ONE row, so the column
                  stays short enough to fit a tablet without scrolling. The
                  per-step clock below is the only time shown while running — the
                  session total is kept for the end recap (a parent's glance),
                  not doubled up here. */}
              <div className="tdl-meta">
                {next && (
                  <div className="tdl-next" aria-hidden="true">
                    <span className="tdl-next-arrow">→</span>
                    {picked.cardsPhoto?.[curIdx + 1] ? (
                      <img className="tdl-next-photo" src={imgUrl(picked.cardsPhoto[curIdx + 1])} alt="" />
                    ) : (
                      <span className="tdl-next-pic">{next.icon || '○'}</span>
                    )}
                  </div>
                )}
                <div className="tdl-dots" aria-hidden="true">
                  {picked.cards.map((_, k) => (
                    <i key={k} className={picked.doneIdx.includes(k) ? 'done' : k === curIdx ? 'on' : ''} />
                  ))}
                </div>
              </div>

              {/* Start ONCE (▶), then advance through with →, and ✓ on the last.
                  A guest never sees these (they commit progress) — the tap-to-hear
                  picture/label above still works. */}
              {!ro &&
                (running ? (
                  <div className="tdl-timer">
                    <span className="tdl-clock mono" aria-live="polite">
                      {fmtClock(elapsed)}
                    </span>
                    <button
                      type="button"
                      className="tdl-finish"
                      onClick={() => advance(picked, curIdx)}
                      aria-label={curIdx >= picked.cards.length - 1 ? t.kid.finish : t.kid.tapNext}
                    >
                      {curIdx >= picked.cards.length - 1 ? '✓' : '→'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="tdl-start"
                    onClick={() => startStep(curIdx)}
                    aria-label={t.kid.start}
                  >
                    <Icon name="play-bold" size={22} />
                  </button>
                ))}
            </>
          )}
        </div>

        {visible.length > 1 && (
          <button type="button" className="kid__exit mono" onClick={() => setPickedId(null)}>
            {/* The ← marks this as "go back" (to the faces), distinct from the
                top-left exit that leaves Kid Mode — two same-styled text links
                were indistinguishable to a pre-reader. */}
            <span aria-hidden="true">← </span>
            {identified ? t.kid.pickRoutine : t.kid.pick}
          </button>
        )}
      </div>
    </div>
  )
}
