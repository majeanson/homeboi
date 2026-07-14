import { useLang, useT } from '../../i18n'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ Debug ▸ Version — when this build was made. `__BUILD_TIME__` is an ISO
// string stamped into the bundle by vite.config.ts at build start; since CI builds +
// deploys on every push to main, it's an easy read of "when was the last push". In
// the dev loop it's the dev-server start instead. The date itself IS the content, so
// it renders as the section body (not a removable hint).
export function BuildInfoSection() {
  const t = useT()
  const { lang } = useLang()
  const iso = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''
  const when = iso ? new Date(iso) : null
  const formatted =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'long', timeStyle: 'short' })
      : t.operator.buildNever
  // The ?kbdebug=1 overlay (lib/viewportVars) has no reachable URL bar in an
  // installed PWA — this button is its switch. Session-scoped on purpose: closing
  // the app clears it, so a diagnostic never sticks on a kiosk. Reload so the
  // overlay mounts/unmounts (it's created once at boot).
  const kbDebugOn = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('bbKbDebug') === '1'
  const toggleKbDebug = () => {
    try {
      if (kbDebugOn) sessionStorage.removeItem('bbKbDebug')
      else sessionStorage.setItem('bbKbDebug', '1')
    } catch {
      /* private mode — nothing to toggle */
    }
    location.reload()
  }
  return (
    <OperatorSection title={t.operator.buildTitle}>
      <p className="lead">
        {t.operator.buildBuilt} : {formatted}
      </p>
      <p className="lead">{t.operator.kbDebugHint}</p>
      <button type="button" className="btn btn--ghost" onClick={toggleKbDebug}>
        {kbDebugOn ? t.operator.kbDebugOff : t.operator.kbDebugOn}
      </button>
    </OperatorSection>
  )
}
