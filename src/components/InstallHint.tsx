import { useT } from '../i18n'
import { Icon } from './Icon'
import { useInstall, useInstallNudge, dismissInstallNudge } from '../lib/install'

// « Sur l'écran d'accueil » — the one quiet line that says the app installs.
//
// Two faces, one rule (lib/install):
//   · `nudge` — the board's ONE-TIME card, shown only while signup / claim left the
//     nudge pending on this device. « Plus tard » is forever; a successful install
//     spends it too. The `.section-intro` shell is the same card the first-visit
//     intros and « Quoi de neuf » wear, so it reads as a thing the app says once.
//   · settings — the standing door in Réglages ▸ Affichage: the same words, always
//     there, one line saying « déjà installé » once it is.
// Renders NOTHING where there is nothing to offer: a desktop that never fired the
// prompt, a wall tablet, a browser we cannot name a gesture for. iOS Safari has no
// prompt to call, so its face is the words for the share sheet and no button.
export function InstallHint({ nudge = false }: { nudge?: boolean }) {
  const t = useT()
  const { promptable, standalone, ios, prompt } = useInstall()
  const { nudge: state } = useInstallNudge()

  if (nudge && state !== 'pending') return null
  if (standalone) return nudge ? null : <p className="operator__hint mono install-hint__done">{t.install.installed}</p>
  if (!promptable && !ios) return null

  const body = ios ? t.install.ios : t.install.body

  if (!nudge) {
    return (
      <div className="operator__seg install-hint" data-face="settings">
        <span className="operator__seg-label mono">{t.install.settingsTitle}</span>
        <p className="operator__hint mono">{body}</p>
        {promptable && (
          <button type="button" className="btn btn--sm" onClick={() => void prompt()}>
            <Icon name="download-simple-bold" size={16} /> {t.install.cta}
          </button>
        )}
      </div>
    )
  }

  return (
    <aside className="section-intro install-hint" data-face="nudge" aria-label={t.install.title}>
      <div className="section-intro__head">
        <span className="section-intro__icon">
          <Icon name="device-mobile-bold" size={22} />
        </span>
        <span className="section-intro__title">{t.install.title}</span>
        <button type="button" className="section-intro__dismiss" onClick={dismissInstallNudge}>
          <Icon name="x-bold" size={14} />
          <span>{t.install.later}</span>
        </button>
      </div>
      <p className="section-intro__what">{body}</p>
      {promptable && (
        <div className="section-intro__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void prompt()}>
            <Icon name="download-simple-bold" size={16} /> {t.install.cta}
          </button>
        </div>
      )}
    </aside>
  )
}
