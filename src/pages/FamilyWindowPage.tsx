import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { guestWindowKey } from '../lib/queryKeys'
import { imgUrl } from '../lib/image'
import { EmptyState } from '../components/EmptyState'
import { InlineIcon } from '../components/Icon'
import { SharePreviewBar, useSharePreview } from '../components/SharePreviewBar'

// #36 — the grandparents' window. The terminal view a `family` share link lands on:
// the grandkids' upcoming dates, the family's birthdays, and the latest photos.
// Read-only, warm, cross-household — no settings, no list, no wifi (the server
// allowlist keeps a family link to /api/guest/window). No close button — this IS
// the guest's whole app.

interface FamilyData {
  kind: 'family'
  householdName: string
  upcoming: { id: string; title: string; start_at: number; all_day: number; who: string | null }[]
  birthdays: { name: string; at: number; age: number | null }[]
  photos: string[]
}

export function FamilyWindowPage() {
  const t = useT()
  const { lang } = useLang()
  // ?preview=family lets the operator see the grandparents' window from Réglages.
  const preview = useSharePreview()
  const { data, isLoading } = useQuery({
    queryKey: guestWindowKey(preview),
    queryFn: () => api<FamilyData>(`guest/window${preview ? `?kind=${preview}` : ''}`),
  })
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'

  const dayLabel = (at: number) =>
    new Date(at * 1000).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' })
  const timeLabel = (at: number, allDay: number) =>
    allDay ? '' : new Date(at * 1000).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })

  const upcoming = data?.upcoming ?? []
  const birthdays = data?.birthdays ?? []
  const photos = data?.photos ?? []
  const has = upcoming.length || birthdays.length || photos.length

  return (
    <div className="scene family-window" aria-label={t.shareMode.familyTitle}>
      {preview && <SharePreviewBar />}
      <header className="scene__head">
        <div className="scene__head-titles">
          <h2 className="pm-sheet__title">
            <InlineIcon name="hand-heart-bold" /> {t.shareMode.familyTitle}
          </h2>
          {data?.householdName && <span className="scene__head-sub mono">{data.householdName}</span>}
        </div>
      </header>

      <div className="scene__body welcome__body">
        {isLoading && !data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : !has ? (
          <EmptyState>{t.shareMode.empty}</EmptyState>
        ) : (
          <>
            {/* Birthdays — the warm heart of the window. */}
            {birthdays.length > 0 && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="cake-bold" /> {t.shareMode.birthdays}
                </h3>
                <ul className="handoff__rows">
                  {birthdays.map((b, i) => (
                    <li key={i} className="handoff__row">
                      <span className="handoff__row-name">
                        {b.name}
                        {b.age != null && (
                          <span className="handoff__ev-who mono">
                            {' '}
                            {t.shareMode.turns} {b.age}
                            {t.shareMode.years ? ` ${t.shareMode.years}` : ''}
                          </span>
                        )}
                      </span>
                      <span className="handoff__ev-time mono">{dayLabel(b.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* The grandkids' upcoming dates. */}
            {upcoming.length > 0 && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="sun-bold" /> {t.shareMode.upcoming}
                </h3>
                <ul className="handoff__agenda">
                  {upcoming.map((e) => (
                    <li key={e.id} className="handoff__ev">
                      <span className="handoff__ev-time mono">
                        {dayLabel(e.start_at)}
                        {timeLabel(e.start_at, e.all_day) && ` · ${timeLabel(e.start_at, e.all_day)}`}
                      </span>
                      <span className="handoff__ev-title">{e.title}</span>
                      {e.who && <span className="handoff__ev-who mono">{e.who}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Latest photos — a little wall frame. */}
            {photos.length > 0 && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="image-square-bold" /> {t.shareMode.photos}
                </h3>
                <div className="family-window__photos">
                  {photos.map((key) => (
                    <img key={key} className="family-window__photo" src={imgUrl(key)} alt="" loading="lazy" />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
