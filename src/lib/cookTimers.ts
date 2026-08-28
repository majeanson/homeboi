import { useEffect, useRef, useState } from 'react'
import { soundOn } from './sound'

// A live countdown for a duration found in a step. Several run at once (start the
// pasta, then the sauce), so each carries a label + its own id. Extracted from
// CookMode so the single-recipe cook AND the multi-recipe cook (#43) share ONE
// timer engine + rail rather than each keeping a copy.
export type CookTimer = { id: number; label: string; total: number; remaining: number; running: boolean }

// MM:SS for the rail clock.
export const clock = (r: number) => `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`

// A short two-note chime when a timer reaches zero — gentle, not an alarm. Built
// lazily on Web Audio (the cook already tapped to start the timer, so audio is
// unlocked); silent no-op where Web Audio is missing. Pairs with a vibration.
// Exported so the routine player's per-step timer (a 2-min teeth brush) rings the
// SAME friendly "ding-ding" as the cook timers, rather than forking a second tone.
export function chime() {
  // Muted (lib/sound): a phone's silent switch doesn't reach Web Audio, so this is
  // the only thing that can stop a timer ringing on a quiet bus.
  if (!soundOn()) return
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    const note = (freq: number, at: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + at)
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.32)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.34)
    }
    note(880, 0) // A5
    note(1174.66, 0.18) // D6 — a friendly rising "ding-ding"
    // Close the context once the second note has rung out, freeing the hardware.
    window.setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch {
    /* no Web Audio — the vibration + visual "done" state carry it */
  }
}

// The shared cook-timer engine: a list of named countdowns, the one-second ticker
// (only armed while something runs, so paused timers don't churn it), and a
// chime + vibration when any reaches zero. `onFinish` (optional) hands the just-
// finished labels back so a caller can ALSO announce them aloud (the multi-cook
// does, to say which dish is ready). Add/toggle/remove mirror CookMode's originals:
// add starts immediately; tapping a clock pauses/resumes (or restarts a finished
// one); ✕ removes.
export function useCookTimers(onFinish?: (labels: string[]) => void) {
  const [timers, setTimers] = useState<CookTimer[]>([])
  const seq = useRef(0)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  // Caller builds the full label (e.g. "Pâtes · 10 min") so the engine stays
  // generic — single cook labels by step, multi-cook by recipe.
  function addTimer(seconds: number, label: string) {
    const id = ++seq.current
    setTimers((ts) => [...ts, { id, label, total: seconds, remaining: seconds, running: true }])
  }
  const toggleTimer = (id: number) =>
    setTimers((ts) =>
      ts.map((tm) =>
        tm.id !== id ? tm : tm.remaining === 0 ? { ...tm, remaining: tm.total, running: true } : { ...tm, running: !tm.running },
      ),
    )
  const removeTimer = (id: number) => setTimers((ts) => ts.filter((tm) => tm.id !== id))

  const anyRunning = timers.some((tm) => tm.running)
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => {
      setTimers((ts) => {
        const justDone: string[] = []
        const next = ts.map((tm) => {
          if (!tm.running) return tm
          if (tm.remaining <= 1) {
            justDone.push(tm.label)
            return { ...tm, remaining: 0, running: false }
          }
          return { ...tm, remaining: tm.remaining - 1 }
        })
        if (justDone.length) {
          chime()
          try {
            // Vibration is muted too, deliberately: a buzz on a table at 3 a.m. is
            // the same intrusion as a chime, and « silencieux » has to mean it. The
            // timer's visual "done" state carries the news either way.
            if (soundOn()) navigator.vibrate?.([200, 100, 200])
          } catch {
            /* no vibration API — the chime + visual "done" state are enough */
          }
          onFinishRef.current?.(justDone)
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [anyRunning])

  return { timers, addTimer, toggleTimer, removeTimer }
}
