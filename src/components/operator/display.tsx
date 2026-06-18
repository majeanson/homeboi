import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang, useT } from '../../i18n'
import { useAudience } from '../../lib/audience'
import { useCalm } from '../../lib/calm'
import { useHelp } from '../../lib/help'
import { isGuest } from '../../lib/device'
import { getTheme, toggleTheme, type Theme, isDaypartAuto, setDaypartAuto, setDayPart } from '../../lib/theme'
import { computeDayPart } from '../../lib/timeofday'
import { MEASURE_SWATCHES, swatchColor, useMeasureColorsEditor } from '../../lib/measurePrefs'
import { IngredientLine } from '../IngredientLine'
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
  const { audience, setAudience, guestPreview, setGuestPreview } = useAudience()
  const { tutorial, setTutorial } = useHelp()
  // Read-only guest: hide every device-preference control EXCEPT the audience
  // switch, which is the operator's way back out of the Guest preview.
  const ro = isGuest()
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  // Ambient day-part drift (feature #1) — calm furniture, default ON, opt-out here.
  const [ambient, setAmbientState] = useState<boolean>(() => isDaypartAuto())
  function toggleAmbient() {
    const next = !ambient
    setAmbientState(next)
    setDaypartAuto(next) // persists the flag; pins 'manual' when turning OFF
    if (next) setDayPart(computeDayPart(Date.now())) // resume drift immediately
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.display}</h2>
      <p className="lead">{t.operator.displayHint}</p>
      <div className="operator__display">
        {!ro && (
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
        )}
        {!ro && (
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.ambientLabel}</span>
            <button
              type="button"
              className={`btn${ambient ? ' btn--primary' : ''}`}
              onClick={toggleAmbient}
              aria-pressed={ambient}
            >
              <InlineIcon name={ambient ? 'sun-horizon-bold' : 'sun-bold'} size={16} />{' '}
              {ambient ? t.operator.ambientOn : t.operator.ambientOff}
            </button>
          </div>
        )}
        {!ro && (
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.langLabel}</span>
            <button type="button" className="btn" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
              {lang === 'fr' ? 'Français' : 'English'}
            </button>
          </div>
        )}
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.viewLabel}</span>
          <div
            className="audience-switch mono"
            role="group"
            aria-label={t.audience.parent + ' / ' + t.audience.kid + ' / ' + t.audience.guest}
          >
            <button
              type="button"
              className={`audience-switch__opt${audience === 'parent' && !guestPreview ? ' is-active' : ''}`}
              onClick={() => {
                setGuestPreview(false)
                setAudience('parent')
              }}
              aria-pressed={audience === 'parent' && !guestPreview}
            >
              <InlineIcon name="user-bold" /> {t.audience.parent}
            </button>
            <button
              type="button"
              className={`audience-switch__opt${audience === 'toddler' && !guestPreview ? ' is-active' : ''}`}
              onClick={() => {
                setGuestPreview(false)
                setAudience('toddler')
              }}
              aria-pressed={audience === 'toddler' && !guestPreview}
            >
              <InlineIcon name="baby-bold" /> {t.audience.kid}
            </button>
            <button
              type="button"
              className={`audience-switch__opt${guestPreview ? ' is-active' : ''}`}
              onClick={() => setGuestPreview(true)}
              aria-pressed={guestPreview}
            >
              <InlineIcon name="user-bold" /> {t.audience.guest}
            </button>
          </div>
          {guestPreview && <p className="operator__seg-hint mono">{t.audience.guestPreviewHint}</p>}
        </div>
        {!ro && (
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.tutorialLabel}</span>
            <div className="audience-switch mono" role="group" aria-label={t.operator.tutorialTitle}>
              <button
                type="button"
                className={`audience-switch__opt${tutorial ? ' is-active' : ''}`}
                onClick={() => setTutorial(true)}
                aria-pressed={tutorial}
              >
                <InlineIcon name="graduation-cap-bold" /> {t.operator.tutorialOn}
              </button>
              <button
                type="button"
                className={`audience-switch__opt${!tutorial ? ' is-active' : ''}`}
                onClick={() => setTutorial(false)}
                aria-pressed={!tutorial}
              >
                <InlineIcon name="lightning-bold" /> {t.operator.tutorialOff}
              </button>
            </div>
          </div>
        )}
      </div>
      {!ro && <p className="operator__hint mono">{t.operator.tutorialHint}</p>}
      {/* Dev-only: the live component catalogue. Searchable, collapsed — handy to
          keep open alongside while building. Settings is operator-only already. */}
      <p className="operator__hint mono">
        <Link to="/dev/kit" className="devkit__link">
          <InlineIcon name="gear-six-bold" size={14} /> Kit de composants (dev)
        </Link>
      </p>
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
  // Read-only guest: voice prefs are write-ish device controls — hide the whole
  // section (the test button + select + slider all mutate the saved pref).
  const ro = isGuest()

  return (
    <section className="surface operator__section">
      <h2>{t.operator.voiceTitle}</h2>
      <p className="lead">{t.operator.voiceHint}</p>

      {ro ? null : !available ? (
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
            <InlineIcon name="speaker-high-bold" /> {t.operator.voiceTest}
          </button>
        </div>
      )}
    </section>
  )
}

// Customizable measuring-tool colours. Each spoon/cup pill + scoop circle is tinted
// to the household's OWN physical tools, calibrated here once and shared across
// every device (everyone uses the same spoons). Persisted on /api/household via the
// editor hook (lib/measurePrefs); the picker previews live while open and commits
// one PATCH on close. A sample line below shows the change instantly.
export function MeasureColorsSection() {
  const t = useT()
  const { lang } = useLang()
  const { overrides, preview, commit, reset } = useMeasureColorsEditor()
  // Read-only guest: colour edits are writes — hide the whole section.
  if (isGuest()) return null
  // A sample line that exercises every colour family + the scoop circles.
  const sample =
    lang === 'fr'
      ? '2 c. à soupe de beurre · 1 ½ tasse de farine · ¼ c. à thé de sel'
      : '2 tbsp butter · 1 ½ cup flour · ¼ tsp salt'
  return (
    <section className="surface operator__section">
      <h2>{t.operator.measureColorsTitle}</h2>
      <p className="lead">{t.operator.measureColorsHint}</p>
      <div className="measure-colors">
        {MEASURE_SWATCHES.map((s) => {
          const color = swatchColor(s, overrides)
          return (
            <label key={s.id} className="measure-colors__row">
              <input
                type="color"
                className="measure-colors__pick"
                value={color}
                onChange={(e) => preview(s.id, e.target.value)}
                onBlur={(e) => commit(s.id, e.target.value)}
                aria-label={s.label[lang]}
              />
              <span className="measure-colors__name">{s.label[lang]}</span>
            </label>
          )
        })}
      </div>
      <div className="measure-colors__preview">
        <span className="measure-colors__preview-label mono">{t.operator.measureColorsPreview}</span>
        <span className="measure-colors__preview-line">
          <IngredientLine line={sample} size="lg" scoops />
        </span>
      </div>
      <button type="button" className="btn" onClick={reset}>
        <InlineIcon name="arrow-counter-clockwise-bold" /> {t.operator.measureColorsReset}
      </button>
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
  // Read-only guest: the calm toggle is a write — show the state as plain text only.
  const ro = isGuest()
  return (
    <section className="surface operator__section">
      <h2>{t.operator.calmTitle}</h2>
      <p className="lead">{t.operator.calmHint}</p>
      {ro ? (
        <p className="operator__hint mono">
          {t.operator.calmTitle} : {calm ? t.operator.calmOn : t.operator.calmOff}
        </p>
      ) : (
        <button
          type="button"
          className={`btn${calm ? ' btn--primary' : ''}`}
          onClick={() => setCalm(!calm)}
          aria-pressed={calm}
        >
          {t.operator.calmTitle} : {calm ? t.operator.calmOn : t.operator.calmOff}
        </button>
      )}
    </section>
  )
}
