import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useCalm } from '../lib/calm'
import { isGuest } from '../lib/device'
import { useProfile } from '../lib/profile'
import { useSpeak } from '../lib/speak'
import { Icon, InlineIcon } from '../components/Icon'
import { Loading, PairPrompt } from '../components/Fallback'
import { wash } from '../lib/colors'
import { imgUrl } from '../lib/image'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { timeOfDay } from '../lib/timeofday'
import { todRank, isRoutineTod, TOD_ICON, TOD_TINT } from '../lib/routineTod'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { RoutinePlayer, type PlayerRoutine } from '../components/RoutinePlayer'
import { colourFor } from '../lib/things'

// The pre-reader surface: a face/routine PICKER, then the calm picture-story RUN.
// The run itself lives in the shared RoutinePlayer (so a parent's phone + the
// /routine/:id/run scene play the very same thing); KidView owns only what's
// special to the locked toddler kiosk — auto-identifying the child, ordering by
// the moment of day, and drifting back to the picker after a finished routine.
interface Card {
  icon: string
  label: string
  narration?: string
  // Optional per-step countdown (e.g. 120 = a 2-minute teeth brush) — the player
  // shows a tap-to-start ring for it; here it just rides along on the card.
  seconds?: number
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

export function KidView() {
  const t = useT()
  const { calm } = useCalm()
  // Read-only guest (toddler kiosk handed to a sitter): the player hides the
  // progress-committing controls when ro, so a guest can still browse + hear steps.
  const ro = isGuest()
  const { memberId: profileId, setMemberId } = useProfile()
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

  // Kids seam #1: a HALF-done routine used to pin the kiosk — the drift above only
  // arms on *finished*, and wandering off mid-story is the toddler norm. So any
  // ~60 s without a tap drifts back to the picker too, whatever the progress (same
  // calm gate as the finished-drift). Nothing is lost: the run state is
  // server-side, so the returning kid re-picks their face and resumes in place.
  useEffect(() => {
    if (!pickedId || !calm) return
    let id: ReturnType<typeof setTimeout>
    const arm = () => {
      clearTimeout(id)
      id = setTimeout(() => setPickedId(null), 60_000)
    }
    arm()
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [pickedId, calm])

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
  // Kids seam #4: on an identified kiosk the picker filters to ONE kid — kid B had
  // no way to reach their own routine. Offer the other kids' FACES (pre-reader:
  // faces, not words) as a quiet strip; tapping it clears the picked profile so
  // the picker shows everyone. Deduped by member, so two routines = one face.
  const others = identified
    ? [...new Map(routines.filter((r) => r.memberId !== profileId).map((r) => [r.memberId ?? r.id, r])).values()]
    : []
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
              const tint = colourFor('routine', r.color)
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
                        <InlineIcon name="check-bold" /> {t.kid.routineDone}
                      </span>
                    ) : (
                      total > 0 && <span className="kid__routine-prog">{doneCount}/{total}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {others.length > 0 && (
            <button type="button" className="kid__others" onClick={() => setMemberId(null)} aria-label={t.kid.pick} title={t.kid.pick}>
              {others.map((r) => {
                const tint = colourFor('routine', r.color)
                return r.avatarPhoto ? (
                  <img key={r.id} className="kid__others-face" src={imgUrl(r.avatarPhoto)} alt="" />
                ) : (
                  <span key={r.id} className="kid__others-face kid__others-face--initial" style={{ background: tint }} aria-hidden="true">
                    {(r.memberName ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                )
              })}
            </button>
          )}
          <Link to="/board" className="kid__exit mono">
            {t.kid.exit}
          </Link>
        </main>
      </div>
    )
  }

  // The RUN — the shared player. The way back to the faces (kids seam #4) shows
  // whenever there is anywhere to go back TO: several visible routines, or an
  // IDENTIFIED kiosk (whose filter is exactly what hid kid B's routine — so the
  // way back also clears the picked profile and the picker shows everyone). It
  // renders both as the header face chip and the bottom link. Only a household
  // with one routine total keeps the old exit-only header.
  const backToFaces = () => {
    setPickedId(null)
    if (identified) setMemberId(null)
  }
  return (
    <RoutinePlayer
      routine={picked as PlayerRoutine}
      ro={ro}
      exitTo="/board"
      onBack={visible.length > 1 || (identified && routines.length > 1) ? backToFaces : undefined}
      backLabel={t.kid.pick}
    />
  )
}
