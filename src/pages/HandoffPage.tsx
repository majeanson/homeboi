import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { slotLabel } from '../lib/mealSlots'
import { EmptyState } from '../components/EmptyState'
import { Icon, InlineIcon } from '../components/Icon'

// #34 — the babysitter handoff. The terminal view a `sitter` share link lands on
// (it can read nothing else — the server allowlist keeps it to /api/guest/window).
// One calm, read-only screen: today's plan, the bedtime routines, allergies/notes
// on the kids ("à savoir"), emergency contacts (tap to call), and the wifi + house
// rules. No close button — this IS the guest's whole app.

interface WindowData {
  kind: 'sitter' | 'welcome'
  householdName: string
  wifi: { ssid: string | null; password: string | null }
  houseRules: string | null
  binDay: string | null
  today?: { events: { id: string; title: string; start_at: number; all_day: number; who: string | null }[]; meals: { id: string; slot: string; title: string }[] }
  bedtimeRoutines?: { id: string; name: string; who: string | null; cards: { icon: string; label: string }[] }[]
  toKnow?: { name: string; isChild: boolean; notes: string | null }[]
  emergency?: { name: string; phone: string | null }[]
}

export function HandoffPage() {
  const t = useT()
  const { lang } = useLang()
  const { data, isLoading } = useQuery({ queryKey: ['guest-window'], queryFn: () => api<WindowData>('guest/window') })

  const time = (start_at: number, all_day: number) =>
    all_day
      ? t.shareMode.allDay
      : new Date(start_at * 1000).toLocaleTimeString(lang === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' })

  const events = data?.today?.events ?? []
  const meals = data?.today?.meals ?? []
  const routines = data?.bedtimeRoutines ?? []
  const toKnow = data?.toKnow ?? []
  const emergency = data?.emergency ?? []
  const wifi = data?.wifi

  return (
    <div className="scene handoff" aria-label={t.shareMode.handoffTitle}>
      <header className="scene__head">
        <div className="scene__head-titles">
          <h2 className="pm-sheet__title">
            <InlineIcon name="heart-bold" /> {t.shareMode.handoffTitle}
          </h2>
          {data?.householdName && <span className="scene__head-sub mono">{data.householdName}</span>}
        </div>
      </header>

      <div className="scene__body handoff__body">
        {isLoading && !data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : (
          <>
            {/* Emergency first — the thing you reach for in a hurry. */}
            {emergency.length > 0 && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="phone-bold" /> {t.shareMode.emergency}
                </h3>
                <ul className="handoff__rows">
                  {emergency.map((c, i) => (
                    <li key={i} className="handoff__row">
                      <span className="handoff__row-name">{c.name}</span>
                      {c.phone && (
                        <a className="btn btn--ghost mono" href={`tel:${c.phone}`}>
                          <InlineIcon name="phone-bold" /> {c.phone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* À savoir — allergies / notes on each person. */}
            {toKnow.length > 0 && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="first-aid-kit-bold" /> {t.shareMode.toKnow}
                </h3>
                <ul className="handoff__rows">
                  {toKnow.map((m, i) => (
                    <li key={i} className="handoff__note">
                      <span className="handoff__row-name">
                        {m.name}
                        {m.isChild && <span className="tag mono"> {t.shareMode.child}</span>}
                      </span>
                      <span className="handoff__note-text">{m.notes}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Today's plan — events + meals, read-only. */}
            <section className="handoff__sec">
              <h3 className="handoff__h mono">
                <InlineIcon name="sun-bold" /> {t.shareMode.today}
              </h3>
              {events.length === 0 && meals.length === 0 ? (
                <p className="handoff__empty mono">{t.shareMode.noToday}</p>
              ) : (
                <>
                  {events.length > 0 && (
                    <ul className="handoff__agenda">
                      {events.map((e) => (
                        <li key={e.id} className="handoff__ev">
                          <span className="handoff__ev-time mono">{time(e.start_at, e.all_day)}</span>
                          <span className="handoff__ev-title">{e.title}</span>
                          {e.who && <span className="handoff__ev-who mono">{e.who}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {meals.length > 0 && (
                    <ul className="handoff__meals">
                      {meals.map((m) => (
                        <li key={m.id} className="handoff__meal">
                          <span className="handoff__meal-slot mono">{slotLabel(m.slot, t)}</span>
                          <span>{m.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            {/* Bedtime routines — the cards are the steps to read off. */}
            {routines.length > 0 && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="moon-stars-bold" /> {t.shareMode.bedtime}
                </h3>
                {routines.map((r) => (
                  <div key={r.id} className="handoff__routine">
                    <p className="handoff__routine-name">
                      {r.name}
                      {r.who && <span className="handoff__ev-who mono"> {r.who}</span>}
                    </p>
                    <ul className="handoff__cards">
                      {r.cards.map((c, i) => (
                        <li key={i} className="handoff__card">
                          <span aria-hidden="true">{c.icon}</span> {c.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}

            {/* Wifi + house rules. */}
            {(wifi?.ssid || data?.houseRules || data?.binDay) && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="key-bold" /> {data?.householdName || t.shareMode.welcomeTitle}
                </h3>
                {wifi?.ssid && <WifiBlock ssid={wifi.ssid} password={wifi.password} />}
                {data?.binDay && (
                  <p className="handoff__line">
                    <Icon name="sparkle-bold" size={16} /> {t.shareMode.binDay} — <strong>{data.binDay}</strong>
                  </p>
                )}
                {data?.houseRules && <p className="handoff__rules">{data.houseRules}</p>}
              </section>
            )}

            {!isLoading && events.length === 0 && meals.length === 0 && routines.length === 0 && toKnow.length === 0 && emergency.length === 0 && !wifi?.ssid && !data?.houseRules && !data?.binDay && (
              <EmptyState>{t.shareMode.empty}</EmptyState>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Wifi network + password with a tap-to-copy password (a sitter joins fast).
export function WifiBlock({ ssid, password }: { ssid: string; password: string | null }) {
  const t = useT()
  const copy = () => {
    if (password) void navigator.clipboard?.writeText(password).catch(() => {})
  }
  return (
    <div className="handoff__wifi">
      <p className="handoff__line">
        <InlineIcon name="wifi-high-bold" /> {t.shareMode.wifi} — <strong>{ssid}</strong>
      </p>
      {password && (
        <button type="button" className="btn btn--ghost mono" onClick={copy} aria-label={t.shareMode.copy}>
          {password} <InlineIcon name="link-bold" />
        </button>
      )}
    </div>
  )
}
