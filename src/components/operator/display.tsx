import { useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useAudience } from '../../lib/audience'
import { useCalm } from '../../lib/calm'
import { getTheme, toggleTheme, type Theme } from '../../lib/theme'

// Display: theme, language, and the Parent/Toddler view — the chrome that used
// to live in the top header. Moved here so the hub pages stay calm and headerless.
export function DisplaySection() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { audience, setAudience } = useAudience()
  const [theme, setThemeState] = useState<Theme>(() => getTheme())

  return (
    <section className="surface operator__section">
      <h2>{t.operator.display}</h2>
      <p className="lead">{t.operator.displayHint}</p>
      <div className="operator__display">
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.themeLabel}</span>
          <button type="button" className="btn" onClick={() => setThemeState(toggleTheme())}>
            {theme === 'night' ? `🌙 ${t.operator.themeNight}` : `☀️ ${t.operator.themeDay}`}
          </button>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.langLabel}</span>
          <button type="button" className="btn" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
            {lang === 'fr' ? 'Français' : 'English'}
          </button>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.viewLabel}</span>
          <div className="audience-switch mono" role="group" aria-label={t.audience.parent + ' / ' + t.audience.kid}>
            <button
              type="button"
              className={`audience-switch__opt${audience === 'parent' ? ' is-active' : ''}`}
              onClick={() => setAudience('parent')}
              aria-pressed={audience === 'parent'}
            >
              🧑 {t.audience.parent}
            </button>
            <button
              type="button"
              className={`audience-switch__opt${audience === 'toddler' ? ' is-active' : ''}`}
              onClick={() => setAudience('toddler')}
              aria-pressed={audience === 'toddler'}
            >
              👶 {t.audience.kid}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// The "anti-addiction" opt-out. Default ON (the calm tenet holds); a parent can
// switch it off to stop the kid routine from dead-ending. Only governs that
// interaction friction — the structural guarantees aren't toggleable. Stored in
// localStorage for now (see bmad/04, OD-1).
export function CalmSection() {
  const t = useT()
  const { calm, setCalm } = useCalm()
  return (
    <section className="surface operator__section">
      <h2>{t.operator.calmTitle}</h2>
      <p className="lead">{t.operator.calmHint}</p>
      <button
        type="button"
        className={`btn${calm ? ' btn--primary' : ''}`}
        onClick={() => setCalm(!calm)}
        aria-pressed={calm}
      >
        {t.operator.calmTitle} : {calm ? t.operator.calmOn : t.operator.calmOff}
      </button>
    </section>
  )
}
