import { useEffect, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useAudience } from '../../lib/audience'
import { useCalm } from '../../lib/calm'
import { useHelp } from '../../lib/help'
import { getTheme, toggleTheme, type Theme } from '../../lib/theme'
import { InlineIcon } from '../Icon'
import {
  getRate,
  getVoicePref,
  hasVoiceFor,
  setRate,
  setVoicePref,
  useSpeak,
  useVoiceList,
} from '../../lib/speak'

// Display: theme, language, and the Parent/Toddler view — the chrome that used
// to live in the top header. Moved here so the hub pages stay calm and headerless.
export function DisplaySection() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { audience, setAudience } = useAudience()
  const { tutorial, setTutorial } = useHelp()
  const [theme, setThemeState] = useState<Theme>(() => getTheme())

  return (
    <section className="surface operator__section">
      <h2>{t.operator.display}</h2>
      <p className="lead">{t.operator.displayHint}</p>
      <div className="operator__display">
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.themeLabel}</span>
          <button type="button" className="btn" onClick={() => setThemeState(toggleTheme())}>
            <InlineIcon
              name={theme === 'night' ? 'moon-stars-bold' : 'sun-bold'}
              size={16}
              color={theme === 'night' ? 'var(--berry-deep)' : 'var(--marigold-deep)'}
            />{' '}
            {theme === 'night' ? t.operator.themeNight : t.operator.themeDay}
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
              <InlineIcon name="user-bold" /> {t.audience.parent}
            </button>
            <button
              type="button"
              className={`audience-switch__opt${audience === 'toddler' ? ' is-active' : ''}`}
              onClick={() => setAudience('toddler')}
              aria-pressed={audience === 'toddler'}
            >
              <InlineIcon name="baby-bold" /> {t.audience.kid}
            </button>
          </div>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.tutorialLabel}</span>
          <div className="audience-switch mono" role="group" aria-label={t.operator.tutorialTitle}>
            <button
              type="button"
              className={`audience-switch__opt${tutorial ? ' is-active' : ''}`}
              onClick={() => setTutorial(true)}
              aria-pressed={tutorial}
            >
              {t.operator.tutorialOn}
            </button>
            <button
              type="button"
              className={`audience-switch__opt${!tutorial ? ' is-active' : ''}`}
              onClick={() => setTutorial(false)}
              aria-pressed={!tutorial}
            >
              {t.operator.tutorialOff}
            </button>
          </div>
        </div>
      </div>
      <p className="operator__hint mono">{t.operator.tutorialHint}</p>
    </section>
  )
}

// On-device read-aloud voice: pick the FR-CA (or EN-CA) voice the narration
// uses, set the speaking speed, and hear a sample. Pure browser SpeechSynthesis
// — no Workers AI, nothing leaves the device (see lib/speak.ts). The override is
// per-language; the speed is shared. Hidden behavior when the OS has no voice
// for the current language: we say so and point at the system settings.
export function VoiceSection() {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  const voicesForLang = useVoiceList(lang)
  const [voice, setVoice] = useState<string>(() => getVoicePref(lang))
  const [rate, setRateState] = useState<number>(() => getRate())

  // The override is stored per language; when the UI language flips, show that
  // language's saved pick (and its installed voices) instead of the stale one.
  useEffect(() => {
    setVoice(getVoicePref(lang))
  }, [lang])

  const available = hasVoiceFor(lang) || voicesForLang.length > 0

  return (
    <section className="surface operator__section">
      <h2>{t.operator.voiceTitle}</h2>
      <p className="lead">{t.operator.voiceHint}</p>

      {!available ? (
        <p className="operator__hint mono">{t.operator.voiceNone}</p>
      ) : (
        <div className="operator__voice">
          <label className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.voiceLabel}</span>
            <select
              className="input"
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value)
                setVoicePref(lang, e.target.value)
              }}
            >
              <option value="">{t.operator.voiceAuto}</option>
              {voicesForLang.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>

          <label className="operator__seg">
            <span className="operator__seg-label mono">
              {t.operator.voiceSpeedLabel} · {rate.toFixed(1)}×
            </span>
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.1}
              value={rate}
              onChange={(e) => {
                const r = Number(e.target.value)
                setRateState(r)
                setRate(r)
              }}
            />
          </label>

          <button type="button" className="btn" onClick={() => speak(t.operator.voiceSample)}>
            {t.operator.voiceTest}
          </button>
        </div>
      )}
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
