import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { useCalm } from '../lib/calm'
import { useSpeak, playNarration } from '../lib/speak'
import { Icon, InlineIcon } from './Icon'
import { tintInk, wash } from '../lib/colors'
import { imgUrl } from '../lib/image'
import { writeWith } from '../lib/write'
import { useOptimisticMutation } from '../lib/optimistic'
import { ROUTINES_KEY, STICKERS_KEY } from '../lib/queryKeys'
import { stickersFor } from '../lib/stickers'
import { todayLocalDay } from '../lib/localDay'
import { chime, clock } from '../lib/cookTimers'
import { colourFor } from '../lib/things'
import { Companion } from './Companion'
import { useSurface } from '../lib/surface'
import { companionPool, companionTone, isCompanion, type CompanionMoment } from '../lib/companions'
import { computeDayPart } from '../lib/timeofday'
import { tipFor } from '../lib/routineTips'

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
//
// ONE finish screen: the recap (sweet dreams + the picture story again + the ⏱ total
// + « Recommencer ») renders whenever the routine is complete, whatever the settings.
// « Mode calme » decides exactly ONE thing here — the sticker offer: calm ON (the
// default) ends the routine reward-free; calm OFF lets the child place a sticker on
// their wall. The STRUCTURAL calm tenets (no points, no streaks, no push) aren't
// toggleable and never were.
interface PlayerCard {
  icon: string
  label: string
  narration?: string
  // Optional per-step countdown (e.g. 120 = a 2-minute teeth brush). When set, the
  // step grows a tap-to-start countdown ring (calm: never force-advances).
  seconds?: number
  // Optional « truc » — the trick the companion says for THIS step when the child taps
  // it. Typed by the parent in the deck editor; beats the built-in catalog keyed on the
  // card's emoji (lib/routineTips), because a parent knows the real one. Stored inline
  // in cards_json, like `seconds` — no migration.
  tip?: string
}
export interface PlayerRoutine {
  id: string
  memberId?: string | null
  memberName: string | null
  color: string | null
  // The owning member's photo, when the caller has it (KidView) — drawn in the
  // header's "whose routine?" face chip so a pre-reader can switch kids.
  avatarPhoto?: string | null
  name: string
  cards: PlayerCard[]
  // Parallel parent-voice clip keys (feature #17 A), one per card ('' = none → TTS).
  cardsNarration?: string[]
  // Parallel card photo keys (feature #17 C), one per card ('' = none → emoji).
  cardsPhoto?: string[]
  doneIdx: number[]
  // Server-persisted per-step countdown state (card idx → {endsAt}|{left}), so a
  // started timer keeps real wall-clock time across leaving and reopening the app.
  timers?: Record<number, TimerEntry>
  // The owning member's chosen companion creature ('fox'|… , null = none). Purely
  // decorative company during the run; bound to time-of-day, never to progress.
  companion?: string | null
}
// How long an armed strip step waits for its confirming tap before melting back, and
// the ceiling on the `is-speaking` pulse — both borrowed from BigTiles so the toddler
// surfaces behave identically (hear-first, two taps, no wandering finger commits).
const ARM_MS = 6000
const SPEAK_FLASH_MAX_MS = 4000

// A running/just-finished timer is { endsAt } (the unix second it reaches zero);
// a paused one is { left } (banked seconds). The player derives remaining from the
// clock, never a frozen counter — so it stays true after the app was closed.
type TimerEntry = { endsAt: number } | { left: number }
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
  const { lang } = useLang()
  const { calm } = useCalm()
  const { surface } = useSurface()
  const speak = useSpeak()
  const qc = useQueryClient()
  // The buddy is big + glanceable on a wall tablet (kiosk), but on a phone the same
  // 72px creature overlapped the → advance button in the bottom corner and blocked the
  // tap. On mobile it's smaller AND lifted clear of the controls (.kid--phone in CSS).
  const onPhone = surface === 'mobile'
  const buddySize = onPhone ? 46 : 72

  // Toggle one card done for today. Optimistic so the tap feels instant on a cheap
  // tablet; on failure the shared hook rolls back and resyncs. Owns the mutation
  // itself (not passed in) so both mount points get the same correct behaviour.
  // Writes go through `writeWith` (not raw `api`) so a tap made offline queues to
  // the outbox and replays on reconnect instead of silently dropping — a routine is
  // exactly what a kid taps on a wall tablet with flaky wifi (NFR-OFFLINE-1).
  const toggle = useOptimisticMutation<RoutinesData, { routineId: string; cardIdx: number; done: boolean }>({
    queryKey: ROUTINES_KEY,
    mutationFn: (v) => writeWith(qc, 'routines', { method: 'PATCH', body: v }),
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
    mutationFn: (v) => writeWith(qc, 'routines', { method: 'PATCH', body: { ...v, reset: true } }),
    apply: (old, v) => ({
      // Recommencer wipes the whole day's run row server-side (doneIdx AND timers),
      // so clear both in the cache to match.
      routines: old.routines.map((r) => (r.id === v.routineId ? { ...r, doneIdx: [], timers: {} } : r)),
    }),
  })

  // Persist one step's countdown timer (start / pause / resume / restart / clear).
  // Optimistic so the tap feels instant on the tablet; the server merges it into
  // today's run row so reopening the app shows the timer at its real remaining.
  const setTimer = useOptimisticMutation<RoutinesData, { routineId: string; cardIdx: number; timer: TimerEntry | null }>({
    queryKey: ROUTINES_KEY,
    mutationFn: (v) => writeWith(qc, 'routines', { method: 'PATCH', body: v }),
    apply: (old, v) => ({
      routines: old.routines.map((r) => {
        if (r.id !== v.routineId) return r
        const timers = { ...(r.timers ?? {}) }
        if (v.timer === null) delete timers[v.cardIdx]
        else timers[v.cardIdx] = v.timer
        return { ...r, timers }
      }),
    }),
  })

  // One continuous run, not a per-step start/stop: tap ▶ ONCE to begin (reads the
  // first step aloud), then → through each step, ✓ on the last. Each → laps the
  // step's time; the clock keeps running between steps. Count-up, no score; the end
  // shows the total. (Distinct from a step's own tap-to-start countdown below.)
  // WALL-CLOCK anchored, NOT a counter that freezes when the app is backgrounded:
  // `startAt` is the unix second the current step began; `elapsed` is DERIVED from
  // the clock on every render. A browser suspends setInterval in a backgrounded
  // tab, so a `+1`-per-tick counter would stall while you're away and resume behind
  // real time ("the timer hasn't moved"). Deriving from Date.now() means leaving and
  // reopening shows the real time spent — the same discipline the Countdown ring uses.
  const nowSec = () => Math.floor(Date.now() / 1000)
  const [running, setRunning] = useState(false)
  const [startAt, setStartAt] = useState(0)
  // A bare re-render pulse each second while running (elapsed is derived, not stored).
  const [, tick] = useState(0)
  // How long each step took (card index → seconds), built up as steps finish so
  // the end can show a total. Session-local — a gentle "look how you did", not data
  // we persist; a reload starts it fresh.
  const [times, setTimes] = useState<Record<number, number>>({})
  const elapsed = running ? Math.max(0, nowSec() - startAt) : 0
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  // Backgrounding suspends the interval; on return recompute immediately (this also
  // re-renders the child Countdown ring so it snaps to its real remaining at once)
  // rather than wait up to a second for the first resumed tick.
  useEffect(() => {
    if (!running) return
    const refresh = () => tick((x) => x + 1)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [running])
  // Switching to another routine (KidView picker, or a deep-link change) resets the
  // stopwatch + tally.
  useEffect(() => {
    setRunning(false)
    setStartAt(0)
    setTimes({})
  }, [routine.id])

  // Which card is being read aloud right now (the `is-speaking` pulse on the hero +
  // the tapped strip step). Same discipline as BigTiles: cleared by speak()'s onEnd
  // when a voice actually runs, and by a ceiling timer when it can't (no installed
  // FR-CA voice makes speak() a silent no-op — the tap must still visibly register).
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null)
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (speakTimer.current) clearTimeout(speakTimer.current)
      if (armTimer.current) clearTimeout(armTimer.current)
    },
    [],
  )
  function flashSpeaking(idx: number) {
    setSpeakingIdx(idx)
    if (speakTimer.current) clearTimeout(speakTimer.current)
    speakTimer.current = setTimeout(() => setSpeakingIdx(null), SPEAK_FLASH_MAX_MS)
  }
  const endSpeaking = () => {
    if (speakTimer.current) clearTimeout(speakTimer.current)
    setSpeakingIdx(null)
  }

  // Read a step aloud WITHOUT marking it done — hear what to do first, then do it.
  function readAloud(idx: number) {
    if (idx < 0 || idx >= routine.cards.length) return
    const text = routine.cards[idx].narration ?? routine.cards[idx].label
    flashSpeaking(idx)
    playNarration(routine.cardsNarration?.[idx], text, (raw) => speak(raw, undefined, { onEnd: endSpeaking }))
  }
  // A short, gentle pulse when a step settles — the same one the step Countdown gives
  // at zero, so the app feels the same in the hand. Guarded: no vibration API is fine.
  function buzz() {
    try {
      navigator.vibrate?.(20)
    } catch {
      /* no vibration API — the ✓ + the spoken next step carry it */
    }
  }

  // The strip's ACCESSIBLE name for one step — « Brosse tes dents, étape 3 de 5 · fait ».
  // The TTS narration is not a screen reader: an AT user got pure silence out of this
  // filmstrip (it was aria-hidden). `state` is the caller's, since after a tap the
  // optimistic cache hasn't reached this render's `routine` yet.
  const stepLabel = (idx: number, state: string) =>
    routine.cards[idx] ? `${routine.cards[idx].label}, ${t.kid.stepOf(idx + 1, routine.cards.length)} · ${state}` : ''
  // The polite live region under the strip: where the story just moved. Not the
  // stopwatch (announcing it every second would flood a screen reader).
  const [announce, setAnnounce] = useState('')
  // Tap the companion → it speaks on-device, and a tiny wiggle plays via the is-talking
  // class. Tap-initiated (never a finish-triggered cheer), so it stays calm. What it
  // says is decided in sayCompanion() below, once the current card is known.
  const [buddyTalking, setBuddyTalking] = useState(false)
  // The line it just said, shown in a speech bubble beside it. A pre-reader hears it;
  // the parent standing there READS it — which is how a trick ("top, bottom, and your
  // tongue too") reaches the grown-up who has to repeat it tomorrow morning.
  const [buddyLine, setBuddyLine] = useState<string | null>(null)
  const buddyTimers = useRef<number[]>([])

  // Sticker wall (OPT-IN — the one thing « Mode calme » gates). On finishing, the child
  // places ONE sticker on their wall; local `awarded` state then shows it done (one per
  // finish, no farming). Calm ON → the offer doesn't exist, and neither does the wall
  // (Routines' entry + StickerWallPage share the same !calm gate).
  const [awarded, setAwarded] = useState<string | null>(null)
  // The grid is always the same SIZE, but the glyphs in it are drawn from the wide
  // catalog per (local day, routine): today's brushing-teeth handful differs from
  // today's bedtime handful, and from tomorrow's. Deterministic, so a redo of the same
  // routine on the same day re-offers the same stickers — nothing to farm or reroll.
  const offer = useMemo(() => stickersFor(todayLocalDay(), routine.id), [routine.id])
  function placeSticker(sticker: string) {
    setAwarded(sticker)
    writeWith(qc, 'routine-stickers', {
      method: 'POST',
      body: { memberId: routine.memberId ?? undefined, sticker, routineId: routine.id },
      affectedKeys: [STICKERS_KEY],
    }).catch(() => setAwarded(null))
  }
  function startStep(idx: number) {
    setStartAt(nowSec())
    setRunning(true)
    readAloud(idx)
  }
  // Advance one step: lap the current step's time, mark it done (which moves the
  // story to the next card), keep the clock running — until the LAST step, where it
  // stops and the recap appears.
  function advance(idx: number) {
    const taken = elapsed
    const isLast = idx >= routine.cards.length - 1
    setStartAt(nowSec()) // re-anchor the lap for the next step; the clock keeps running
    if (!routine.doneIdx.includes(idx)) setTimes((m) => ({ ...m, [idx]: taken }))
    toggle.mutate({ routineId: routine.id, cardIdx: idx, done: true })
    buzz()
    if (isLast) {
      setRunning(false)
      // A pre-reader can't read the "sweet dreams" card — say it (the SAME gentle
      // line every time, NFR-CALM-2).
      speak(t.kid.allDone)
    } else {
      readAloud(idx + 1)
      // A screen reader gets nothing from the TTS narration (it isn't AT), so say
      // where we are, politely, in the live region under the strip.
      setAnnounce(stepLabel(idx + 1, t.kid.stepNow))
    }
  }

  // Go BACK to a step (the ← button, or a confirmed tap on a done step in the strip).
  // The current step is DERIVED (first-undone), so un-marking `idx` is all it takes:
  // the story rewinds to it and reads itself aloud. Anything after stays ✓ — nothing
  // is lost if the kid steps forward again. Never a redo prompt, never a scold.
  function goBack(idx: number) {
    if (ro || idx < 0) return
    setArmedIdx(null)
    toggle.mutate({ routineId: routine.id, cardIdx: idx, done: false })
    setStartAt(nowSec()) // the lap restarts on the step we came back to
    setTimes((m) => {
      const next = { ...m }
      delete next[idx]
      return next
    })
    buzz()
    readAloud(idx)
    setAnnounce(stepLabel(idx, t.kid.stepNow))
  }

  // The filmstrip's hear-first tap (BigTiles' arm/ARM_MS pattern, not a new one):
  //   a DONE step   → tap 1 speaks « Revenir à … ? Tape encore », tap 2 rewinds to it;
  //   a FUTURE step → speaks it, always. A preview, NEVER a jump (a wandering finger
  //                   must not skip the story forward and tick steps nobody did);
  //   the CURRENT   → speaks itself, like the hero card.
  const [armedIdx, setArmedIdx] = useState<number | null>(null)
  function tapStep(idx: number) {
    const done = routine.doneIdx.includes(idx)
    if (!done || ro) {
      setArmedIdx(null)
      readAloud(idx)
      return
    }
    if (armedIdx === idx) {
      goBack(idx)
      return
    }
    const c = routine.cards[idx]
    flashSpeaking(idx)
    speak(t.kid.backTo(c.narration ?? c.label), undefined, { onEnd: endSpeaking })
    setArmedIdx(idx)
    if (armTimer.current) clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmedIdx(null), ARM_MS)
  }

  // Play it again: clear the day's ✓ and the session stopwatch so it starts at the
  // first card, fresh. The kid taps ▶ to begin again (we don't auto-run — calm).
  function restart() {
    if (ro) return
    resetRun.mutate({ routineId: routine.id })
    setRunning(false)
    setStartAt(0)
    setTimes({})
  }

  const tint = colourFor('routine', routine.color)
  // ONE finish screen, whatever the settings: a finished routine always ends on the
  // "sweet dreams" recap (the picture story again + the ⏱ total + « Recommencer »).
  // Calm used to fork this into a second, poorer ending ("sit on the last card") —
  // two code paths saying the same thing badly. Calm now gates exactly ONE thing:
  // the sticker offer below.
  const allDone = routine.cards.length > 0 && routine.doneIdx.length >= routine.cards.length

  // The story position: the first not-yet-done card (else the last).
  const firstUndone = routine.cards.findIndex((_, i) => !routine.doneIdx.includes(i))
  const curIdx = firstUndone === -1 ? routine.cards.length - 1 : firstUndone
  const cur = routine.cards[curIdx]

  // ── What the companion says when the child taps it ─────────────────────────
  //
  // The cascade, tricks before chatter:
  //   1. the parent's own « truc » on this card, if they typed one;
  //   2. the built-in trick for this card's PICTURE (lib/routineTips);
  //   3. only if neither exists — a warm line, pooled from the creature's own
  //      personality, where the story is, and the time of day.
  //
  // So the tap is USEFUL first and friendly second. A creature that only ever says
  // "keep going!" gets tapped once; one that knows how you put a coat on gets tapped
  // every morning. None of this is fed progress — see the note in lib/companions.ts.
  function sayCompanion() {
    if (!isCompanion(routine.companion)) return
    // No current card at the finish (the recap is up) → no trick to give, and
    // deliberately no "you did it!" either: the pool drops its story-position lines.
    const trick = allDone || !cur ? null : tipFor(cur, lang)
    const moment: CompanionMoment | null = allDone
      ? null
      : routine.doneIdx.length === 0
        ? 'start'
        : curIdx >= routine.cards.length - 1
          ? 'last'
          : 'mid'
    const line =
      trick ??
      (() => {
        const pool = companionPool(
          {
            says: t.routines.companionSays,
            voices: t.routines.companionVoices,
            moments: t.routines.companionMoments,
            tones: t.routines.companionTones,
          },
          { companion: routine.companion, moment, tone: companionTone(computeDayPart(Date.now())) },
        )
        return pool[Math.floor(Math.random() * pool.length)]
      })()
    speak(line)
    setBuddyLine(line)
    setBuddyTalking(true)
    // The wiggle is brief; the bubble lingers long enough to READ a trick (they run
    // longer than "Allô !"), then fades on its own — never a thing to dismiss.
    buddyTimers.current.forEach(clearTimeout)
    buddyTimers.current = [
      window.setTimeout(() => setBuddyTalking(false), 600),
      window.setTimeout(() => setBuddyLine(null), Math.min(3500 + line.length * 55, 9000)),
    ]
  }
  // Never leave a timer running into an unmounted component (the kid tapped ✕ mid-line).
  useEffect(() => () => buddyTimers.current.forEach(clearTimeout), [])
  // The step the ← rewinds to: the last DONE one before where we are. Normally
  // curIdx - 1; computed rather than assumed, since a deck edit can leave doneIdx
  // sparse (done [1] with 0 undone → we're on 0 and there is nothing behind it).
  // -1 = nothing to go back to → the ← doesn't render (first step / nothing done).
  let prevIdx = -1
  for (let i = curIdx - 1; i >= 0; i--)
    if (routine.doneIdx.includes(i)) {
      prevIdx = i
      break
    }
  // Picking a routine back up mid-day: the ▶ reads as « Continuer », not « Commencer »
  // (and, as always, speaks the step it lands on).
  const resuming = routine.doneIdx.length > 0

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
          {/* "Whose routine?" — a FACE chip (pre-reader friendly), always present
              when the caller offers a way back (kids seam #4): tapping it returns
              to the picker so kid B can reach their own routine, even on a kiosk
              identified to kid A. Falls back to the 44px spacer that balanced the
              header before. */}
          {onBack ? (
            <button type="button" className="tdl-face" onClick={onBack} aria-label={backLabel} title={backLabel}>
              {routine.avatarPhoto ? (
                <img className="tdl-face__img" src={imgUrl(routine.avatarPhoto)} alt="" />
              ) : (
                <span className="tdl-face__initial" style={{ background: tint }} aria-hidden="true">
                  {(routine.memberName ?? routine.name).slice(0, 1).toUpperCase()}
                </span>
              )}
            </button>
          ) : (
            <div style={{ width: 44 }} />
          )}
        </div>

        {/* The companion buddy — a larger, present creature that keeps the child
            company through the run. Tap it and it says the trick for the step they're
            ON (the parent's own, or the one for the card's picture), falling back to a
            warm line. It's TAP-initiated + daypart-bound (dozes at night): presence,
            help and play — never a grade, and it doesn't cheer at a finish.
            The bubble carries the words for the grown-up in the room; the speech
            carries them for the pre-reader, who can't read either. */}
        {isCompanion(routine.companion) && (
          <div className={'tdl-buddy-wrap' + (onPhone ? ' tdl-buddy-wrap--phone' : '')}>
            {buddyLine && (
              <div className="tdl-buddy__bubble" role="status">
                {buddyLine}
              </div>
            )}
            <button
              type="button"
              className={'tdl-buddy' + (buddyTalking ? ' is-talking' : '')}
              onClick={sayCompanion}
              aria-label={t.routines.companionTap}
            >
              <Companion companion={routine.companion} size={buddySize} />
            </button>
          </div>
        )}

        <div className="tdl-stage">
          {allDone ? (
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

              {/* The sticker reward — the ONE thing « Mode calme » decides. Calm ON
                  (the default): the routine simply ends, no reward anywhere. Calm OFF:
                  the child picks a sticker and places it on their wall (one per finish,
                  no farming). A guest can't write. */}
              {!ro && !calm && (
                <div className="tdl-sticker">
                  {awarded ? (
                    <div className="tdl-sticker__done">
                      <span className="tdl-sticker__got" aria-hidden="true">{awarded}</span>
                      <span>{t.routines.stickerPlaced}</span>
                      <Link to="/routine/stickers" className="tdl-sticker__wall">{t.routines.stickerWallLink}</Link>
                    </div>
                  ) : (
                    <>
                      <div className="tdl-sticker__prompt">{t.routines.stickerPrompt}</div>
                      <div className="tdl-sticker__grid">
                        {offer.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="tdl-sticker__opt"
                            aria-label={t.routines.stickerPick}
                            onClick={() => placeSticker(s)}
                          >
                            <span aria-hidden="true">{s}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

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
                className={'tdl-illus tdl-illus--tap' + (speakingIdx === curIdx ? ' is-speaking' : '')}
                style={{ background: tint }}
                onClick={() => readAloud(curIdx)}
                aria-label={stepLabel(curIdx, t.kid.stepNow)}
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
                  Keyed by curIdx so it resets fresh on every step. Its state is
                  persisted server-side (via onPersist) so leaving + reopening the app
                  shows the timer at its real remaining; a guest (ro) runs it locally
                  only — no onPersist, so they can use it but never commit. */}
              {cur?.seconds ? (
                <Countdown
                  key={curIdx}
                  seconds={cur.seconds}
                  tint={tint}
                  persisted={routine.timers?.[curIdx]}
                  onPersist={ro ? undefined : (s) => setTimer.mutate({ routineId: routine.id, cardIdx: curIdx, timer: s })}
                />
              ) : null}

              {/* The whole routine as a picture filmstrip: every step in order, the
                  current one lifted + ringed ("you are here"), finished ones softened
                  with a ✓. GENTLY INTERACTIVE (and no longer aria-hidden — the TTS
                  narration is not a screen reader): tap a DONE step to hear « Revenir
                  à … ? Tape encore » and, on a second tap, rewind the story to it; a
                  FUTURE step only speaks itself (a preview, never a jump — a wandering
                  finger must not tick steps nobody did); the current one speaks itself
                  like the hero. Pictures + audio carry it; no reading required. */}
              <div className="tdl-strip">
                {routine.cards.map((c, k) => {
                  const done = routine.doneIdx.includes(k)
                  const state = done ? 'done' : k === curIdx ? 'on' : 'wait'
                  const armed = armedIdx === k
                  const word = done ? t.kid.stepDone : k === curIdx ? t.kid.stepNow : t.kid.stepTodo
                  return (
                    <button
                      key={k}
                      type="button"
                      className={
                        `tdl-step tdl-step--${state}` +
                        (armed ? ' is-armed' : '') +
                        (speakingIdx === k ? ' is-speaking' : '')
                      }
                      onClick={() => tapStep(k)}
                      aria-label={armed ? t.kid.backTo(c.label) : stepLabel(k, word)}
                    >
                      <span className="tdl-step__pic">
                        {routine.cardsPhoto?.[k] ? (
                          <img src={imgUrl(routine.cardsPhoto[k])} alt="" />
                        ) : (
                          <span className="tdl-step__emoji">{c.icon || '○'}</span>
                        )}
                      </span>
                      {done && !armed && (
                        <span className="tdl-step__check" aria-hidden="true">
                          <Icon name="check-bold" size={14} />
                        </span>
                      )}
                      {armed && (
                        <span className="tdl-step__again" aria-hidden="true">
                          👆
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {/* Where the story just moved, said politely once — an AT user gets no
                  meaning at all from the spoken narration. Never the stopwatch. */}
              <span className="sr-only" aria-live="polite">
                {announce}
              </span>

              {/* Start ONCE (▶ — « Continuer » when today's run is already under way),
                  then advance with →, and ✓ on the last. Beside them, a big ← that
                  UN-does the last finished step so the story rewinds to it and reads
                  itself aloud again (Marc's ask: a three-year-old taps → too fast).
                  It hides on the first step and when nothing is done — there's nowhere
                  to go back to. A guest never sees any of these (they commit progress);
                  the tap-to-hear picture / label + the step timer still work for them. */}
              {!ro && (
                <div className="tdl-controls">
                  {prevIdx >= 0 && (
                    <button
                      type="button"
                      className="tdl-prev"
                      onClick={() => goBack(prevIdx)}
                      aria-label={t.kid.prev}
                      title={t.kid.prev}
                    >
                      <Icon name="arrow-left-bold" size={30} />
                    </button>
                  )}
                  {running ? (
                    <div className="tdl-timer">
                      {/* A glanceable count-up, not a status message — announcing it every
                          second floods a screen reader, so keep it out of the live region. */}
                      <span className="tdl-clock mono" aria-live="off">
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
                    <button
                      type="button"
                      className="tdl-start"
                      onClick={() => startStep(curIdx)}
                      aria-label={resuming ? t.kid.resume : t.kid.start}
                      title={resuming ? t.kid.resume : t.kid.start}
                    >
                      <Icon name="play-bold" size={22} />
                    </button>
                  )}
                </div>
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
//
// State is WALL-CLOCK driven, not a frozen counter: a running timer is anchored to
// an absolute `endsAt`, so the remaining is recomputed from the clock on every tick
// and on (re)mount — leaving the app and coming back shows the timer where it really
// is, not where it paused. `persisted` seeds + syncs that state from the server (so
// it survives an app close, and a second device sees it); `onPersist` saves each
// start/pause/restart. With no `onPersist` (a read-only guest) it just runs locally.
function Countdown({
  seconds,
  tint,
  persisted,
  onPersist,
}: {
  seconds: number
  tint: string
  persisted?: TimerEntry
  onPersist?: (s: TimerEntry | null) => void
}) {
  const t = useT()
  const nowSec = () => Math.floor(Date.now() / 1000)
  // Local mirror so a tap feels instant; the server (persisted) is the source of
  // truth on load and when another device changes it.
  const [state, setState] = useState<TimerEntry | null>(persisted ?? null)
  // Re-sync when the server delivers a different timer for this card. Keyed on the
  // meaningful fields so a same-value poll doesn't reset a live tick.
  const pEndsAt = persisted && 'endsAt' in persisted ? persisted.endsAt : null
  const pLeft = persisted && 'left' in persisted ? persisted.left : null
  useEffect(() => {
    setState(persisted ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pEndsAt, pLeft])
  // A bare re-render pulse each second while running (left is derived, not stored).
  const [, force] = useState(0)

  // Derive the live remaining + running from the clock, so it's correct even after
  // the app was closed for a while.
  let left: number
  let running: boolean
  if (state && 'endsAt' in state) {
    left = Math.max(0, state.endsAt - nowSec())
    running = left > 0
  } else if (state && 'left' in state) {
    left = state.left
    running = false
  } else {
    left = seconds
    running = false
  }
  const done = left <= 0 && !!state && 'endsAt' in state

  // Tick once a second while running so `left` recomputes; cleared the instant it
  // hits zero (running flips false) or the step changes (unmount).
  const everRan = useRef(false)
  useEffect(() => {
    if (!running) return
    everRan.current = true
    const id = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  // Chime + buzz EXACTLY once, only on a LIVE running→zero edge — never when we load
  // a timer that already finished while the app was away (everRan stays false then).
  const chimed = useRef(false)
  useEffect(() => {
    if (done && everRan.current && !chimed.current) {
      chimed.current = true
      chime()
      try {
        navigator.vibrate?.([200, 100, 200])
      } catch {
        /* no vibration API — the chime + the ✓ pulse carry it */
      }
    }
    if (!done) chimed.current = false
  }, [done])

  function tap() {
    const now = nowSec()
    let next: TimerEntry
    if (running) next = { left } // pause: bank the remaining
    else if (done) next = { endsAt: now + seconds } // restart a finished timer
    else if (state && 'left' in state) next = { endsAt: now + state.left } // resume from pause
    else next = { endsAt: now + seconds } // first start
    setState(next)
    onPersist?.(next)
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
