import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ Système — « Diagnostic clavier », the on-device switch for the
// ?kbdebug=1 overlay (lib/viewportVars): an installed PWA has no reachable URL
// bar, so this button is how a phone turns the overlay on. Its own tester-style
// section (the micTest/aiTest shape) rather than a ghost link inside Version.
// Session-scoped on purpose: closing the app clears it, so a diagnostic never
// sticks on a kiosk. Reload so the overlay mounts/unmounts (created once at boot).
export function KbDebugSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const on = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('bbKbDebug') === '1'
  const toggle = () => {
    try {
      if (on) sessionStorage.removeItem('bbKbDebug')
      else sessionStorage.setItem('bbKbDebug', '1')
    } catch {
      /* private mode — nothing to toggle */
    }
    location.reload()
  }
  return (
    <OperatorSection title={t.operator.kbDebugTitle} help={help} helpKey="kbDebug">
      <p className="lead">{t.operator.kbDebugHint}</p>
      <button type="button" className={on ? 'btn' : 'btn btn--primary'} onClick={toggle}>
        {on ? t.operator.kbDebugOff : t.operator.kbDebugOn}
      </button>
    </OperatorSection>
  )
}
