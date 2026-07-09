// B-11 (bmad/10) — carnets.css moved out of the eager shell; this page only needs
// its lone .handoff__pin-img rule (the « En cas de pépin » pin photo), unmoved to
// avoid churning an unrelated file for one class.
import '../styles/carnets.css'
// handoff.css moved out of the eager shell too (uniquely-named .handoff__ classes).
import '../styles/handoff.css'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api, isStatus } from '../lib/api'
import { guestWindowKey } from '../lib/queryKeys'
import { slotLabel } from '../lib/mealSlots'
import { imgUrl } from '../lib/image'
import { PIN_EMOJI, type HomePinKind } from '../lib/carnets'
import { EmptyState } from '../components/EmptyState'
import { GuestExpired } from '../components/GuestExpired'
import { Icon, InlineIcon } from '../components/Icon'
import { SharePreviewBar, useSharePreview } from '../components/SharePreviewBar'

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
  pins?: { kind: HomePinKind; label: string; detail: string | null; mediaKey: string | null; home: string }[]
  // D-19 — the opt-in « Joindre un parent » target (an operator's own preview never
  // carries one — there's no sender to attribute it to).
  reachParent?: { name: string; phone: string } | null
}

export function HandoffPage() {
  const t = useT()
  const { lang } = useLang()
  // ?preview=sitter lets the operator see the sitter card from Réglages ▸ Partage.
  const preview = useSharePreview()
  const { data, isLoading, isError } = useQuery({
    queryKey: guestWindowKey(preview),
    queryFn: () => api<WindowData>(`guest/window${preview ? `?kind=${preview}` : ''}`),
    // A revoked/expired token won't recover on retry — surface the expired state fast.
    retry: (count, err) => !isStatus(err, 401) && !isStatus(err, 403) && count < 2,
  })

  const time = (start_at: number, all_day: number) =>
    all_day
      ? t.shareMode.allDay
      : new Date(start_at * 1000).toLocaleTimeString(lang === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' })

  const events = data?.today?.events ?? []
  const meals = data?.today?.meals ?? []
  const routines = data?.bedtimeRoutines ?? []
  const toKnow = data?.toKnow ?? []
  const emergency = data?.emergency ?? []
  const allPins = data?.pins ?? []
  // Split the house map: « En cas de pépin » keeps the WHERE-is-it / document pins,
  // while the HOW-TO pins ("comment partir le lave-vaisselle") get their own calm
  // "Comment ça marche" section — the sitter reads them, not hunts for a shutoff.
  const pins = allPins.filter((p) => p.kind !== 'howto')
  const howto = allPins.filter((p) => p.kind === 'howto')
  const multiHome = new Set(allPins.map((p) => p.home)).size > 1
  const wifi = data?.wifi

  return (
    <div className="scene handoff" aria-label={t.shareMode.handoffTitle}>
      {preview && <SharePreviewBar />}
      <header className="scene__head">
        <div className="scene__head-titles">
          <h2 className="pm-sheet__title">
            <InlineIcon name="heart-bold" /> {t.shareMode.handoffTitle}
          </h2>
          {data?.householdName && <span className="scene__head-sub mono">{data.householdName}</span>}
        </div>
        {/* A printed handoff on the fridge is genuinely useful (#34). */}
        <button type="button" className="btn btn--sm no-print" onClick={() => window.print()}>
          <InlineIcon name="printer-bold" /> {t.shareMode.print}
        </button>
      </header>

      <div className="scene__body handoff__body">
        {isLoading && !data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : isError && !data ? (
          <GuestExpired />
        ) : (
          <>
            {/* D-19 — « Joindre un parent », atop Urgence: an opt-in number for
                mid-evening plan changes, distinct from the household's own emergency
                contacts below. */}
            {data?.reachParent && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="phone-bold" /> {t.guest.reachParentTitle}
                </h3>
                <ul className="handoff__rows">
                  <li className="handoff__row">
                    <span className="handoff__row-name">{data.reachParent.name}</span>
                    <a className="btn btn--ghost mono" href={`tel:${data.reachParent.phone}`}>
                      <InlineIcon name="phone-bold" /> {data.reachParent.phone}
                    </a>
                  </li>
                </ul>
              </section>
            )}

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

            {/* En cas de pépin — the house map: where's the shutoff, the breaker… */}
            {pins.length > 0 && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="key-bold" /> {t.carnets.enCasDePepin}
                </h3>
                <ul className="handoff__rows">
                  {pins.map((p, i) => (
                    <li key={i} className="handoff__note">
                      <span className="handoff__row-name">
                        <span aria-hidden="true">{PIN_EMOJI[p.kind]}</span> {p.label}
                        {multiHome && <span className="tag mono"> {p.home}</span>}
                      </span>
                      {p.detail && <span className="handoff__note-text">{p.detail}</span>}
                      {p.mediaKey && (
                        <img src={imgUrl(p.mediaKey)} alt="" className="handoff__pin-img" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Comment ça marche — the how-to pins (run the dishwasher, the thermostat). */}
            {howto.length > 0 && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="gear-six-bold" /> {t.shareMode.howItWorks}
                </h3>
                <ul className="handoff__rows">
                  {howto.map((p, i) => (
                    <li key={i} className="handoff__note">
                      <span className="handoff__row-name">
                        <span aria-hidden="true">{PIN_EMOJI[p.kind]}</span> {p.label}
                        {multiHome && <span className="tag mono"> {p.home}</span>}
                      </span>
                      {p.detail && <span className="handoff__note-text">{p.detail}</span>}
                      {p.mediaKey && (
                        <img src={imgUrl(p.mediaKey)} alt="" className="handoff__pin-img" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      )}
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

            {!isLoading && !data?.reachParent && events.length === 0 && meals.length === 0 && routines.length === 0 && toKnow.length === 0 && emergency.length === 0 && allPins.length === 0 && !wifi?.ssid && !data?.houseRules && !data?.binDay && (
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
        <button type="button" className="btn btn--ghost mono handoff__wifi-pw" onClick={copy} aria-label={t.shareMode.copy}>
          {password} <InlineIcon name="link-bold" />
        </button>
      )}
    </div>
  )
}
