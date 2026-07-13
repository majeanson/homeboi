import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang, useT, type Lang } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { RecentsPanel } from '../RecentsPanel'
import { useAudience } from '../../lib/audience'
import { useApodEnabled, setApodEnabled } from '../../lib/apod'
import { useCanvasEnabled, setCanvasEnabled } from '../../lib/canvas'
import { useKeepAwake, setKeepAwake } from '../../lib/keepAwake'
import { useOcrEngine, setOcrEngine, useCloudOcrAvailable } from '../../lib/ocrPref'
import { useCalm } from '../../lib/calm'
import { useHelp } from '../../lib/help'
import { isGuest } from '../../lib/device'
import {
  getTheme,
  toggleTheme,
  type Theme,
  isDaypartAuto,
  setDaypartAuto,
  setDayPart,
  themeForPart,
  applyThemeAttr,
  getStoredTheme,
} from '../../lib/theme'
import {
  getContrast,
  setContrast,
  getTextScale,
  setTextScale,
  type Contrast,
  type TextScale,
} from '../../lib/accessibility'
import { computeDayPart } from '../../lib/timeofday'
import { MEASURE_SWATCHES, swatchColor, useMeasureColorsEditor } from '../../lib/measurePrefs'
import { useTapToHear, setTapToHear } from '../../lib/tapToHear'
import { useHolidaysEnabled, setHolidaysEnabled } from '../../lib/year'
import { useChoreAnnounceEnabled, setChoreAnnounceEnabled } from '../../lib/choreAnnounce'
import { IngredientLine } from '../IngredientLine'
import { InlineIcon } from '../Icon'
import { Toggle } from '../Toggle'
import {
  getRate,
  getVoicePref,
  hasVoiceFor,
  setRate,
  setVoicePref,
  setReadLang,
  useReadLang,
  useSpeak,
  useVoiceList,
} from '../../lib/speak'
import { Chip } from '../Chip'

// Display: theme, language, and the Parent/Toddler view — the chrome that used
// to live in the top header. Moved here so the hub pages stay calm and headerless.
export function DisplaySection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang, setLang } = useLang()
  const { audience, setAudience, guestPreview, setGuestPreview } = useAudience()
  const { tutorial, setTutorial } = useHelp()
  // Nothing in this section is gated on `isGuest()`: theme, day-part drift, the photo
  // band, language, contrast, text size, the audience lens and the tutorial hints are
  // all DEVICE-LOCAL prefs (localStorage), not household writes. A babysitter — or a
  // visitor on the public demo — flipping this device to English, to Night, or to the
  // toddler lens changes nothing for the household, and being able to is most of what
  // makes the demo worth looking at. See the note on isGuest() in lib/device.
  // (MeasureColorsSection below IS gated: it PATCHes /api/household.)
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  // Ambient day-part drift (feature #1) — calm furniture, default ON, opt-out here.
  const [ambient, setAmbientState] = useState<boolean>(() => isDaypartAuto())
  // "Photo du jour" (NASA APOD) band — calm furniture, default ON, opt-out here.
  // Read live from the localStorage store so the board reacts without a reload.
  const apod = useApodEnabled()
  const canvas = useCanvasEnabled()
  // A-2 (bmad/09): the derived fêtes QC/CA announce lines — all on by default,
  // this device can opt out (lib/year).
  const fetes = useHolidaysEnabled()
  // D-21 (bmad/10): the flagged-chore "evening before" announce line — same
  // per-device opt-out pattern (lib/choreAnnounce).
  const binAnnounce = useChoreAnnounceEnabled()
  // Per-device Screen Wake Lock (HubLayout holds it): keep a wall tablet lit on the
  // board. Read live so the toggle engages/releases the lock without a reload.
  const keepAwake = useKeepAwake()
  // Recipe-photo reader (per device): on-device vs the high-accuracy cloud OCR. The
  // choice only appears when the deployment actually has a Mistral key wired.
  const ocrEngine = useOcrEngine()
  const cloudOcrAvailable = useCloudOcrAvailable()
  function toggleAmbient() {
    const next = !ambient
    setAmbientState(next)
    setDaypartAuto(next) // persists the flag; pins 'manual' when turning OFF
    if (next) {
      // Resume the drift now AND engage auto day/night for the current part, so
      // flipping it on at night goes dark immediately.
      const part = computeDayPart(Date.now())
      setDayPart(part)
      const autoTheme = themeForPart(part)
      applyThemeAttr(autoTheme)
      // The day/night pip is binary; the intermediate twilight tiers read as day.
      setThemeState(autoTheme === 'night' ? 'night' : 'day')
    } else {
      // Back to fixed colours: restore the operator's manual day/night choice.
      const manual = getStoredTheme()
      applyThemeAttr(manual)
      setThemeState(manual)
    }
  }
  // Accessibility profile (#36): high-contrast + larger text. CSS-driven on
  // <html> (lib/accessibility); local mirrors re-render the active pip.
  const [contrast, setContrastState] = useState<Contrast>(() => getContrast())
  const [textScale, setTextScaleState] = useState<TextScale>(() => getTextScale())
  function pickContrast(c: Contrast) {
    setContrastState(c)
    setContrast(c)
  }
  function pickTextScale(s: TextScale) {
    setTextScaleState(s)
    setTextScale(s)
  }

  return (
    <OperatorSection title={t.operator.display} help={help} helpKey="display">
      <div className="operator__display">
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.themeLabel}</span>
          {/* While ambient is on, day/night follows the time (auto day/night) —
              the manual toggle is governed by it, so show it disabled with a
              hint rather than letting a tap be silently re-asserted next tick. */}
          <button
            type="button"
            className="btn"
            onClick={() => setThemeState(toggleTheme())}
            disabled={ambient}
            aria-disabled={ambient}
          >
            <InlineIcon
              name={theme === 'night' ? 'moon-stars-bold' : 'sun-bold'}
              size={16}
              color={theme === 'night' ? 'var(--berry-deep)' : 'var(--marigold-deep)'}
            />{' '}
            {theme === 'night' ? t.operator.themeNight : t.operator.themeDay}
          </button>
          {ambient && <p className="operator__seg-hint mono">{t.operator.themeFollowsTime}</p>}
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.ambientLabel}</span>
          <Toggle
            on={ambient}
            icon={ambient ? 'sun-horizon-bold' : 'sun-bold'}
            label={ambient ? t.operator.ambientOn : t.operator.ambientOff}
            onClick={toggleAmbient}
          />
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.apodLabel}</span>
          <Toggle
            on={apod}
            icon="moon-stars-bold"
            label={apod ? t.operator.apodOn : t.operator.apodOff}
            onClick={() => setApodEnabled(!apod)}
          />
          <p className="operator__seg-hint mono">{t.operator.apodHint}</p>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.canvasLabel}</span>
          <Toggle
            on={canvas}
            icon={canvas ? 'sun-horizon-bold' : 'sun-bold'}
            label={canvas ? t.operator.canvasOn : t.operator.canvasOff}
            onClick={() => setCanvasEnabled(!canvas)}
          />
          <p className="operator__seg-hint mono">{t.operator.canvasHint}</p>
        </div>
        {/* A-2 (bmad/09): the derived QC/CA fêtes announce lines on the board —
            all on by default (zero-impact), this device can opt out. */}
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.fetesLabel}</span>
          <Toggle
            on={fetes}
            icon="calendar-dots-bold"
            label={fetes ? t.operator.ambientOnWord : t.operator.ambientOffWord}
            onClick={() => setHolidaysEnabled(!fetes)}
          />
          <p className="operator__seg-hint mono">{t.operator.fetesHint}</p>
        </div>
        {/* D-21 (bmad/10) « Sortir le bac »: a flagged recurring chore's own
            "evening before" announce line — all on by default, this device can
            opt out (lib/choreAnnounce), same shape as the fêtes toggle above. */}
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.binAnnounceLabel}</span>
          <Toggle
            on={binAnnounce}
            icon="hand-heart-bold"
            label={binAnnounce ? t.operator.ambientOnWord : t.operator.ambientOffWord}
            onClick={() => setChoreAnnounceEnabled(!binAnnounce)}
          />
          <p className="operator__seg-hint mono">{t.operator.binAnnounceHint}</p>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.keepAwakeLabel}</span>
          <Toggle
            on={keepAwake}
            icon="device-tablet-bold"
            label={keepAwake ? t.operator.keepAwakeOn : t.operator.keepAwakeOff}
            onClick={() => setKeepAwake(!keepAwake)}
          />
          <p className="operator__seg-hint mono">{t.operator.keepAwakeHint}</p>
        </div>
        {cloudOcrAvailable && (
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.ocrLabel}</span>
            <div className="audience-switch mono" role="group" aria-label={t.operator.ocrLabel}>
              <button
                type="button"
                className={`audience-switch__opt${ocrEngine === 'device' ? ' is-active' : ''}`}
                onClick={() => setOcrEngine('device')}
                aria-pressed={ocrEngine === 'device'}
              >
                <InlineIcon name="camera-bold" /> {t.operator.ocrDevice}
              </button>
              <button
                type="button"
                className={`audience-switch__opt${ocrEngine === 'cloud' ? ' is-active' : ''}`}
                onClick={() => setOcrEngine('cloud')}
                aria-pressed={ocrEngine === 'cloud'}
              >
                <InlineIcon name="sparkle-bold" /> {t.operator.ocrCloud}
              </button>
            </div>
            <p className="operator__seg-hint mono">
              {ocrEngine === 'cloud' ? t.operator.ocrCloudHint : t.operator.ocrDeviceHint}
            </p>
          </div>
        )}
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.langLabel}</span>
          <button type="button" className="btn" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
            {lang === 'fr' ? 'Français' : 'English'}
          </button>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.contrastLabel}</span>
          <div className="audience-switch mono" role="group" aria-label={t.operator.contrastLabel}>
            <button
              type="button"
              className={`audience-switch__opt${contrast === 'normal' ? ' is-active' : ''}`}
              onClick={() => pickContrast('normal')}
              aria-pressed={contrast === 'normal'}
            >
              <InlineIcon name="sparkle-bold" /> {t.operator.contrastNormal}
            </button>
            <button
              type="button"
              className={`audience-switch__opt${contrast === 'high' ? ' is-active' : ''}`}
              onClick={() => pickContrast('high')}
              aria-pressed={contrast === 'high'}
            >
              <InlineIcon name="sparkle-bold" /> {t.operator.contrastHigh}
            </button>
          </div>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.textScaleLabel}</span>
          <div className="audience-switch mono" role="group" aria-label={t.operator.textScaleLabel}>
            <button
              type="button"
              className={`audience-switch__opt${textScale === 'normal' ? ' is-active' : ''}`}
              onClick={() => pickTextScale('normal')}
              aria-pressed={textScale === 'normal'}
            >
              <InlineIcon name="magnifying-glass-bold" /> {t.operator.textScaleNormal}
            </button>
            <button
              type="button"
              className={`audience-switch__opt${textScale === 'large' ? ' is-active' : ''}`}
              onClick={() => pickTextScale('large')}
              aria-pressed={textScale === 'large'}
            >
              <InlineIcon name="magnifying-glass-bold" /> {t.operator.textScaleLarge}
            </button>
          </div>
        </div>
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.operator.viewLabel}</span>
          <div
            className="audience-switch mono"
            role="group"
            aria-label={t.audience.parent + ' / ' + t.audience.kid + ' / ' + t.audience.simple + ' / ' + t.audience.guest}
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
            {/* bmad/08 A-1 — the post-reader « Simple » lens (grandma). */}
            <button
              type="button"
              className={`audience-switch__opt${audience === 'simple' && !guestPreview ? ' is-active' : ''}`}
              onClick={() => {
                setGuestPreview(false)
                setAudience('simple')
              }}
              aria-pressed={audience === 'simple' && !guestPreview}
            >
              <InlineIcon name="hand-heart-bold" /> {t.audience.simple}
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
          {audience === 'simple' && !guestPreview && <p className="operator__seg-hint mono">{t.audience.simpleHint}</p>}
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
        {/* The calm "Récents" session log (#38) — a quiet look back at what just
            happened, with a late Annuler. Reachable here even after the toast fades. */}
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.recents.title}</span>
          <RecentsPanel />
        </div>
      </div>
      {/* Dev-only: the live component catalogue. Searchable, collapsed — handy to
          keep open alongside while building. Settings is operator-only already. */}
      <p className="operator__hint mono">
        <Link to="/dev/kit" className="devkit__link">
          <InlineIcon name="gear-six-bold" size={14} /> Kit de composants (dev)
        </Link>
      </p>
    </OperatorSection>
  )
}

// On-device read-aloud voice: pick the FR-CA (or EN-CA) voice the narration
// uses, set the speaking speed, and hear a sample. Pure browser SpeechSynthesis
// — no Workers AI, nothing leaves the device (see lib/speak.ts). The override is
// per-language; the speed is shared. Hidden behavior when the OS has no voice
// for the current language: we say so and point at the system settings.
export function VoiceSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  // Tap-to-hear (bmad/08 A-2): the per-device long-press-to-speak pref for the
  // toddler/simple lenses (lib/tapToHear). Default ON.
  const tapToHear = useTapToHear()
  // The GLOBAL read-aloud language — applies to ALL narration everywhere (#TTS).
  const readLang = useReadLang()
  // Which language's VOICE we're configuring. A French app can read recipes in
  // English (read-aloud language / a recipe's own language), so you must be able to
  // pick a voice for EITHER language — not just the UI one. Defaults to the
  // read-aloud language when forced, else the UI language; the FR/EN toggle below
  // switches it. The pref is stored per language and the engine reads the matching
  // voice whenever it speaks that language (#TTS).
  const [voiceLang, setVoiceLang] = useState<Lang>(() => (readLang === 'auto' ? lang : readLang))
  const voicesForLang = useVoiceList(voiceLang)
  const [voice, setVoice] = useState<string>(() => getVoicePref(voiceLang))
  const [rate, setRateState] = useState<number>(() => getRate())

  // Show the saved pick (and installed voices) for whichever language is selected.
  useEffect(() => {
    setVoice(getVoicePref(voiceLang))
  }, [voiceLang])

  // The section is useful whenever the device can speak EITHER language; the
  // per-language "no voice installed" hint below guides installing the missing one.
  const available = hasVoiceFor('fr') || hasVoiceFor('en')

  return (
    <OperatorSection title={t.operator.voiceTitle} help={help} helpKey="voice">
      {!available ? (
        <p className="operator__hint mono">{t.operator.voiceNone}</p>
      ) : (
        <div className="operator__voice">
          {/* #TTS — the GLOBAL read-aloud language, used everywhere narration plays
              (cook mode, routines, toddler tiles…). Auto follows the app language; a
              recipe's own language still wins for that recipe. */}
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.readLangLabel}</span>
            <div className="picker-chips mono">
              <Chip selected={readLang === 'auto'} onClick={() => setReadLang('auto')}>{t.recipes.readLangAuto}</Chip>
              <Chip selected={readLang === 'fr'} onClick={() => setReadLang('fr')}>{t.recipes.readLangFr}</Chip>
              <Chip selected={readLang === 'en'} onClick={() => setReadLang('en')}>{t.recipes.readLangEn}</Chip>
            </div>
          </div>

          {/* Pick the voice for EACH language independently — a French app can still
              choose a good English voice for recipes read in English. */}
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.voiceLabel}</span>
            <div className="picker-chips mono">
              <Chip selected={voiceLang === 'fr'} onClick={() => setVoiceLang('fr')}>{t.recipes.readLangFr}</Chip>
              <Chip selected={voiceLang === 'en'} onClick={() => setVoiceLang('en')}>{t.recipes.readLangEn}</Chip>
            </div>
          </div>
          {voicesForLang.length === 0 ? (
            <p className="operator__hint mono">{t.operator.voiceNoneLang}</p>
          ) : (
            <select
              className="input"
              aria-label={t.operator.voiceLabel}
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value)
                setVoicePref(voiceLang, e.target.value)
              }}
            >
              <option value="">{t.operator.voiceAuto}</option>
              {voicesForLang.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          )}

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

          {/* Tap-to-hear (A-2): in the Enfant / Simple lenses, holding a finger
              ~½ s on any row reads it aloud. Per-device, opt-out here. */}
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.operator.tapToHearLabel}</span>
            <Toggle
              on={tapToHear}
              icon="speaker-high-bold"
              label={tapToHear ? t.operator.ambientOnWord : t.operator.ambientOffWord}
              onClick={() => setTapToHear(!tapToHear)}
            />
          </div>
          <p className="operator__hint mono">{t.operator.tapToHearHint}</p>

          {/* Test in the SELECTED voice language, with a phrase in that language —
              so a French app testing the English voice hears English (the point). */}
          <button
            type="button"
            className="btn"
            onClick={() => speak(voiceLang === 'fr' ? 'Allô ! Voici la voix de lecture.' : 'Hello! This is the reading voice.', voiceLang)}
          >
            <InlineIcon name="speaker-high-bold" /> {t.operator.voiceTest}
          </button>
        </div>
      )}
    </OperatorSection>
  )
}

// Customizable measuring-tool colours. Each spoon/cup pill + scoop circle is tinted
// to the household's OWN physical tools, calibrated here once and shared across
// every device (everyone uses the same spoons). Persisted on /api/household via the
// editor hook (lib/measurePrefs); the picker previews live while open and commits
// one PATCH on close. A sample line below shows the change instantly.
export function MeasureColorsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const { overrides, preview, commit, reset } = useMeasureColorsEditor()
  // The ONE gated control in this file, and gated for the right reason: unlike the
  // device-local prefs above, measure colours are a HOUSEHOLD setting — the editor
  // PATCHes /api/household on close, so a read-only guest has nothing to commit.
  if (isGuest()) return null
  // A sample line that exercises every colour family + the scoop circles.
  const sample =
    lang === 'fr'
      ? '2 c. à soupe de beurre · ½ tasse de farine · ¼ c. à thé de sel'
      : '2 tbsp butter · ½ cup flour · ¼ tsp salt'
  return (
    <OperatorSection title={t.operator.measureColorsTitle} help={help} helpKey="measureColors">
      <div className="measure-colors">
        {MEASURE_SWATCHES.map((s) => {
          const color = swatchColor(s, overrides)
          return (
            <label key={s.id} className="measure-colors__row">
              {/* DELIBERATELY the free-form OS picker, NOT the shared ColorPicker (palette
                  dots): a household matches these to its PHYSICAL colour-coded spoons/cups
                  (leaf green, teal, golden yellow — see measureColors.ts defaults), none of
                  which live in the member `PALETTE`. Constraining to the app palette would
                  defeat the whole point (you couldn't match your real ¼ tsp spoon). */}
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
    </OperatorSection>
  )
}

// The "anti-addiction" opt-out. Default ON (the calm tenet holds); it decides ONE
// thing — the sticker a child places on their wall at the end of a routine (calm ON:
// the routine simply ends, reward-free). The structural guarantees (no points, no
// push, finite lists) aren't toggleable. Stored in localStorage for now (bmad/04, OD-1).
export function CalmSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { calm, setCalm } = useCalm()
  return (
    <OperatorSection title={t.operator.calmTitle} help={help} helpKey="calm">
      <button
        type="button"
        className={`btn${calm ? ' btn--primary' : ''}`}
        onClick={() => setCalm(!calm)}
        aria-pressed={calm}
      >
        {t.operator.calmTitle} : {calm ? t.operator.calmOn : t.operator.calmOff}
      </button>
    </OperatorSection>
  )
}
