// Best-effort natural-language -> timestamp for the "when" the intent-router
// echoes ("mardi 15h", "demain", "jeudi"). Deliberately small and forgiving:
// it covers the common household phrasings, and anything it can't read falls
// back to "today" so an event still lands somewhere visible rather than being
// dropped. A real calendar parser is out of scope for the prototype.

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

// Returns { startAt, allDay }. `now` is injectable so tests are deterministic
// (the runtime forbids argless Date in some contexts; callers pass Date.now()).
export function parseWhen(when: string | undefined, nowMs: number): { startAt: number; allDay: boolean } {
  const base = new Date(nowMs)
  if (!when) return { startAt: Math.floor(nowMs / 1000), allDay: true }
  const w = when.toLowerCase()

  const target = new Date(base)
  let matchedDay = false

  if (w.includes('demain') || w.includes('tomorrow')) {
    target.setUTCDate(target.getUTCDate() + 1)
    matchedDay = true
  } else if (w.includes("aujourd'hui") || w.includes('today') || w.includes('asoir') || w.includes('à soir')) {
    matchedDay = true
  } else {
    for (const [name, dow] of Object.entries(WEEKDAYS)) {
      if (w.includes(name)) {
        // Next occurrence of that weekday (today counts as 7 days out, so
        // "mardi" said on a Tuesday means next Tuesday — the common intent).
        const delta = ((dow - target.getUTCDay() + 7) % 7) || 7
        target.setUTCDate(target.getUTCDate() + delta)
        matchedDay = true
        break
      }
    }
  }

  // Time: "15h", "15h30", "3pm", "9:00".
  let allDay = true
  const t = w.match(/(\d{1,2})\s*(?:h|:)\s*(\d{0,2})/) || w.match(/(\d{1,2})\s*(am|pm)/)
  if (t) {
    let hour = parseInt(t[1], 10)
    const min = t[2] && /^\d+$/.test(t[2]) ? parseInt(t[2], 10) : 0
    if (/pm/.test(w) && hour < 12) hour += 12
    if (/am/.test(w) && hour === 12) hour = 0
    if (hour >= 0 && hour <= 23) {
      target.setUTCHours(hour, min, 0, 0)
      allDay = false
    }
  }

  if (!matchedDay && allDay) return { startAt: Math.floor(nowMs / 1000), allDay: true }
  return { startAt: Math.floor(target.getTime() / 1000), allDay }
}
