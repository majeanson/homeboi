import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { EmptyState } from '../components/EmptyState'
import { Icon, InlineIcon } from '../components/Icon'
import { WifiBlock } from './HandoffPage'

// #35 — the guest welcome card. The terminal view a `welcome` share link lands on:
// the few things a visitor needs — wifi, bin day, house rules — and nothing else
// (the server allowlist keeps a welcome link to /api/guest/window). A QR by the
// door can point straight here.

interface WelcomeData {
  householdName: string
  wifi: { ssid: string | null; password: string | null }
  houseRules: string | null
  binDay: string | null
}

export function WelcomePage() {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ['guest-window'], queryFn: () => api<WelcomeData>('guest/window') })
  const wifi = data?.wifi
  const has = !!(wifi?.ssid || data?.binDay || data?.houseRules)

  return (
    <div className="scene welcome" aria-label={t.shareMode.welcomeTitle}>
      <header className="scene__head">
        <div className="scene__head-titles">
          <h2 className="pm-sheet__title">
            <InlineIcon name="hand-heart-bold" /> {t.shareMode.welcomeTitle}
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
            {wifi?.ssid && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="wifi-high-bold" /> {t.shareMode.wifi}
                </h3>
                <WifiBlock ssid={wifi.ssid} password={wifi.password} />
              </section>
            )}
            {data?.binDay && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="sparkle-bold" /> {t.shareMode.binDay}
                </h3>
                <p className="handoff__line">
                  <Icon name="sparkle-bold" size={16} /> <strong>{data.binDay}</strong>
                </p>
              </section>
            )}
            {data?.houseRules && (
              <section className="handoff__sec">
                <h3 className="handoff__h mono">
                  <InlineIcon name="key-bold" /> {t.shareMode.houseRules}
                </h3>
                <p className="handoff__rules">{data.houseRules}</p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
