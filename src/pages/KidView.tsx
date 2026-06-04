import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { api, ApiError } from '../lib/api'

// The pre-reader surface. Big picture cards, no reading required to USE it.
// Tapping a card:
//   - speaks its narration on-device (browser SpeechSynthesis, zero Neurons),
//   - marks it done with the SAME gentle state every time (deterministic, no
//     variable reward — NFR-CALM-2),
// When every card is done the routine shows a calm "all done" and STOPS. There
// is no "do it again" hook and no score (NFR-CALM-1/4). The day resets server-
// side, so tomorrow it's simply empty again.
interface Card { icon: string; label: string; narration?: string }
interface Routine {
  id: string
  memberName: string | null
  color: string | null
  name: string
  cards: Card[]
  doneIdx: number[]
}

export function KidView() {
  const t = useT()
  const { lang } = useLang()
  const [routines, setRoutines] = useState<Routine[] | null>(null)
  const [unauth, setUnauth] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api<{ routines: Routine[] }>('routines')
      setRoutines(res.routines)
      // Auto-pick when there's exactly one routine (the common case).
      if (res.routines.length === 1) setPickedId(res.routines[0].id)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUnauth(true)
      else setRoutines([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function speak(text: string | undefined) {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang === 'fr' ? 'fr-CA' : 'en-CA'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch {
      /* narration is a nicety, never block the tap on it */
    }
  }

  async function toggleCard(routine: Routine, idx: number) {
    const isDone = routine.doneIdx.includes(idx)
    speak(routine.cards[idx]?.narration ?? routine.cards[idx]?.label)
    // Optimistic local update so the tap feels instant on a cheap tablet.
    setRoutines((rs) =>
      rs
        ? rs.map((r) =>
            r.id === routine.id
              ? { ...r, doneIdx: isDone ? r.doneIdx.filter((i) => i !== idx) : [...r.doneIdx, idx] }
              : r,
          )
        : rs,
    )
    await api('routines', {
      method: 'PATCH',
      body: { routineId: routine.id, cardIdx: idx, done: !isDone },
    }).catch(() => load())
  }

  if (unauth) {
    return (
      <div className="kid">
        <main className="narrow">
          <Link to="/pair" className="btn btn--primary">
            {t.home.ctaPair}
          </Link>
        </main>
      </div>
    )
  }

  if (!routines) return <p className="loading mono">{t.common.loading}</p>

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

  // "Pick your face" when there are several children's routines.
  const picked = routines.find((r) => r.id === pickedId)
  if (!picked) {
    return (
      <div className="kid">
        <main className="kid__pick">
          <h1 className="kid__pick-title">{t.kid.pick}</h1>
          <div className="kid__faces">
            {routines.map((r) => (
              <button
                key={r.id}
                type="button"
                className="kid__face"
                style={{ background: r.color ?? '#7a8b6f' }}
                onClick={() => setPickedId(r.id)}
              >
                <span className="kid__face-initial">{(r.memberName ?? '?').slice(0, 1).toUpperCase()}</span>
                <span className="kid__face-name">{r.memberName ?? r.name}</span>
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

  const allDone = picked.cards.length > 0 && picked.doneIdx.length >= picked.cards.length

  return (
    <div className="kid">
      <main className="kid__main">
        {allDone ? (
          <div className="kid__alldone">
            <div className="kid__alldone-mark" aria-hidden="true">
              ✿
            </div>
            <p className="kid__alldone-text">{t.kid.allDone}</p>
          </div>
        ) : (
          <div className="kid__cards">
            {picked.cards.map((card, idx) => {
              const done = picked.doneIdx.includes(idx)
              return (
                <button
                  key={idx}
                  type="button"
                  className={`kid__card${done ? ' is-done' : ''}`}
                  onClick={() => toggleCard(picked, idx)}
                  aria-pressed={done}
                  aria-label={card.label}
                >
                  <span className="kid__card-icon" aria-hidden="true">
                    {card.icon || '○'}
                  </span>
                  <span className="kid__card-label">{card.label}</span>
                  {done && (
                    <span className="kid__card-done" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        <div className="kid__footer">
          {routines.length > 1 && (
            <button type="button" className="kid__exit mono" onClick={() => setPickedId(null)}>
              {t.kid.pick}
            </button>
          )}
          <Link to="/board" className="kid__exit mono">
            {t.kid.exit}
          </Link>
        </div>
      </main>
    </div>
  )
}
