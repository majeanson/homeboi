import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createDeviceStore } from './createDeviceStore'
import { useNow } from './itemLife'
import { useAudience } from './audience'
import { useAuth } from './auth'
import { isGuest, isPaired } from './device'
import { useProfile } from './profile'
import { useHabits, dueToday, reminderDue, habitToday, nowMinute } from './habits'

// « Le point du jour » — when the check-in scene opens by itself.
//
// TWO behaviours, both opt-out-able per device (Réglages ▸ Système ▸ Affichage,
// beside the screensaver — that sub already owns "what this always-on screen does
// on its own"):
//
//   • the MORNING OPEN: the first time the app is opened on a new LOCAL day, if
//     anything is asking, the scene opens once. Dismissing it is the answer for
//     the day — it never nags twice.
//   • the REMINDERS: a habit's configured wall-clock times (minutes past local
//     midnight). When one comes due and the habit is still unsettled, the scene
//     opens — but only on a calm surface (the board, or over the screensaver),
//     never mid-routine, mid-form, or on top of a scene.
//
// This is read-time only. There is NO push and NO cron in this app (NFR-CALM-1):
// an open screen notices the moment has come; a phone in a pocket stays quiet.
// The kiosk is always on, which is exactly what makes that enough.

export interface HabitCheckinSettings {
  /** Open the scene on the first app open of a new local day. */
  autoOpen: boolean
  /** Let a habit's reminder times open the scene during the day. */
  reminders: boolean
  /** The last local day whose morning open already happened (0 = never). */
  lastShownDay: number
  /** Reminder minutes already fired, and the local day they belong to. */
  fired: { day: number; minutes: number[] }
}

const DEFAULTS: HabitCheckinSettings = {
  autoOpen: true,
  reminders: true,
  lastShownDay: 0,
  fired: { day: 0, minutes: [] },
}

const store = createDeviceStore<HabitCheckinSettings>('babillard-habitudes-checkin', DEFAULTS)

export const useHabitCheckin = store.use

export function setHabitCheckin(patch: Partial<HabitCheckinSettings>): void {
  store.set({ ...store.get(), ...patch })
}

/** Réglages ▸ Debug: replay today's morning open + let every reminder fire again. */
export function replayHabitCheckin(): void {
  store.set({ ...store.get(), lastShownDay: 0, fired: { day: 0, minutes: [] } })
}

// The scene's own route, and the two surfaces calm enough to be interrupted.
const SCENE = '/board/habitudes'
const isCalmSurface = (pathname: string) => pathname === '/board'

/**
 * Mounted once, shell-level (HubLayout), so a kiosk parked on /kitchen still gets
 * its morning open — not just a device sitting on the board.
 */
export function useHabitCheckinTrigger(saverShowing: boolean): void {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const { audience } = useAudience()
  const { signedIn } = useAuth()
  const { memberId: face } = useProfile()
  const settings = useHabitCheckin()
  // The shared minute clock — the same tick the board's lifecycle rides.
  const now = useNow()
  // Non-polling: the trigger must not add /api/habits to the board's poll cadence.
  const { data } = useHabits({ live: false })

  // Guard the StrictMode double-run and a same-tick re-entry (navigate() re-renders
  // this hook before the store write has propagated).
  const firing = useRef(false)

  useEffect(() => {
    if (firing.current) return
    if (!data) return
    // Same guards as the tour's auto-launch: a parent lens on a signed-in operator
    // or a paired wall kiosk. Never a guest, never the TV board, never a toddler /
    // simple lens (they have no business being handed someone's cigarette count).
    if (audience !== 'parent') return
    if (!signedIn && !isPaired()) return
    if (isGuest() || pathname.startsWith('/cast')) return
    // Never interrupt the scene with itself, nor a routine run / form / other scene.
    if (pathname === SCENE) return

    const today = habitToday()
    const due = dueToday(data.habits, data.days, face, today)

    // 1) The morning open — once per local day, per device, and only when the day
    //    actually asks for something. Stamp the day BEFORE navigating: dismissing
    //    the scene is the answer, and a failed navigation must not re-arm it.
    if (settings.autoOpen && settings.lastShownDay < today && due.length > 0) {
      firing.current = true
      setHabitCheckin({ lastShownDay: today })
      nav(SCENE)
      return
    }

    // 2) A reminder time — only from a calm surface, so it can never land on top of
    //    a half-typed form or a child's routine.
    if (!settings.reminders) return
    if (!isCalmSurface(pathname) && !saverShowing) return

    const minute = nowMinute(now)
    const firedToday = settings.fired.day === today ? settings.fired.minutes : []
    // Only habits ASKING today can remind: `due` is already "scheduled for today (or
    // owed this week) AND not settled", so a Monday habit stays silent on Tuesday and
    // a finished one stays silent for the rest of the day. It's also exactly the set
    // the scene will show, so a reminder never opens onto an empty screen.
    for (const h of due) {
      const at = reminderDue(h, minute, firedToday, false)
      if (at === null) continue
      firing.current = true
      setHabitCheckin({ fired: { day: today, minutes: [...firedToday, at] } })
      nav(SCENE)
      return
    }
  }, [data, audience, signedIn, pathname, face, settings, now, saverShowing, nav])

  // Re-arm once the scene is left, so a later reminder can still fire today.
  useEffect(() => {
    if (pathname !== SCENE) firing.current = false
  }, [pathname])
}
