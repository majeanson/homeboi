import { Segmented } from '../Segmented'
import { SettingsRow } from './SettingsRow'
import { useEffect, useState } from 'react'
import { SoundToggle } from '../SoundToggle'
import { useSoundOn } from '../../lib/sound'
import { Link } from 'react-router-dom'
import { useLang, useT, type Lang } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { InstallHint } from '../InstallHint'
import { RecentsPanel } from '../RecentsPanel'
import { useAudience } from '../../lib/audience'
import { useApodEnabled, setApodEnabled } from '../../lib/apod'
import { useCanvasEnabled, setCanvasEnabled } from '../../lib/canvas'
import { useKeepAwake, setKeepAwake } from '../../lib/keepAwake'
import { useOcrChoice, useOcrEngine, setOcrEngine, useCloudOcrAvailable } from '../../lib/ocrPref'
import { useAi } from '../../lib/ai'
import { useCalm } from '../../lib/calm'
import { useHelp } from '../../lib/help'
import { isGuest } from '../../lib/device'
import { useConfirm } from '../../lib/confirm'
import {
  getTheme,
  toggleTheme,
  type Theme,
  isDaypartAuto,
  setDaypartAuto,
  applyThemeAttr,
  getStoredTheme,
} from '../../lib/theme'
import {
  getContrast,
  setContrast,
  getTextScale,
  setTextScale,
  TEXT_SCALES,
  type Contrast,
  type TextScale,
} from '../../lib/accessibility'
import { applyDaypartNow } from '../../lib/daypartDrift'
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
  const o18n = useOperatorT()
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
  // Recipe-photo reader (per device): Auto (the default — the cloud reader when it is
  // wired and AI is on, else Cloudflare's vision reader, else the device), on-device, or
  // the high-accuracy cloud OCR. Shown whenever there is a choice to make: a cloud key,
  // OR AI on (vision vs device). It used to show only with a cloud key — once that key
  // left prod, a phone that had once picked « Sur l'appareil » was stuck with it, no
  // switch in sight, reading every photo through the slow engine (Marc, 2026-10-27).
  const ocrChoice = useOcrChoice()
  const ocrEngine = useOcrEngine()
  const cloudOcrAvailable = useCloudOcrAvailable()
  const { enabled: aiOn } = useAi()
  function toggleAmbient() {
    const next = !ambient
    setAmbientState(next)
    setDaypartAuto(next) // persists the flag; pins 'manual' when turning OFF
    if (next) {
      // Resume the drift now AND engage auto day/night for the current part, so
      // flipping it on at night goes dark immediately. The 10-min loop in
      // lib/daypartDrift keeps running whatever this flag says, so the drift also
      // ADVANCES from here without a reload — it just re-reads the flag on its
      // next tick. Same helper the loop itself uses (one spelling of "apply now").
      const autoTheme = applyDaypartNow()
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
    <OperatorSection title={o18n.display} help={help} helpKey="display">
      <div className="operator__display">
        <SettingsRow label={o18n.themeLabel}>
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
            {theme === 'night' ? o18n.themeNight : o18n.themeDay}
          </button>
          {ambient && <p className="operator__seg-hint mono">{o18n.themeFollowsTime}</p>}
        </SettingsRow>
        <SettingsRow label={o18n.ambientLabel}>
          <Toggle
            on={ambient}
            icon={ambient ? 'sun-horizon-bold' : 'sun-bold'}
            label={ambient ? o18n.ambientOn : o18n.ambientOff}
            onClick={toggleAmbient}
          />
        </SettingsRow>
        <SettingsRow label={o18n.apodLabel}>
          <Toggle
            on={apod}
            icon="moon-stars-bold"
            label={apod ? o18n.apodOn : o18n.apodOff}
            onClick={() => setApodEnabled(!apod)}
          />
          <p className="operator__seg-hint mono">{o18n.apodHint}</p>
        </SettingsRow>
        <SettingsRow label={o18n.canvasLabel}>
          <Toggle
            on={canvas}
            icon={canvas ? 'sun-horizon-bold' : 'sun-bold'}
            label={canvas ? o18n.canvasOn : o18n.canvasOff}
            onClick={() => setCanvasEnabled(!canvas)}
          />
          <p className="operator__seg-hint mono">{o18n.canvasHint}</p>
        </SettingsRow>
        {/* A-2 (bmad/09): the derived QC/CA fêtes announce lines on the board —
            all on by default (zero-impact), this device can opt out. */}
        <SettingsRow label={o18n.fetesLabel}>
          <Toggle
            on={fetes}
            icon="calendar-dots-bold"
            label={fetes ? o18n.ambientOnWord : o18n.ambientOffWord}
            onClick={() => setHolidaysEnabled(!fetes)}
          />
          <p className="operator__seg-hint mono">{o18n.fetesHint}</p>
        </SettingsRow>
        {/* D-21 (bmad/10) « Sortir le bac »: a flagged recurring chore's own
            "evening before" announce line — all on by default, this device can
            opt out (lib/choreAnnounce), same shape as the fêtes toggle above. */}
        <SettingsRow label={o18n.binAnnounceLabel}>
          <Toggle
            on={binAnnounce}
            icon="hand-heart-bold"
            label={binAnnounce ? o18n.ambientOnWord : o18n.ambientOffWord}
            onClick={() => setChoreAnnounceEnabled(!binAnnounce)}
          />
          <p className="operator__seg-hint mono">{o18n.binAnnounceHint}</p>
        </SettingsRow>
        <SettingsRow label={o18n.keepAwakeLabel}>
          <Toggle
            on={keepAwake}
            icon="device-tablet-bold"
            label={keepAwake ? o18n.keepAwakeOn : o18n.keepAwakeOff}
            onClick={() => setKeepAwake(!keepAwake)}
          />
          <p className="operator__seg-hint mono">{o18n.keepAwakeHint}</p>
        </SettingsRow>
        {(cloudOcrAvailable || aiOn) && (
          <SettingsRow label={o18n.ocrLabel}>
            <Segmented
              ariaLabel={o18n.ocrLabel}
              value={ocrChoice === 'device' || ocrChoice === 'cloud' ? ocrChoice : 'auto'}
              onChange={setOcrEngine}
              options={[
                { key: 'auto' as const, icon: 'arrow-clockwise-bold' as const, label: o18n.ocrAuto },
                { key: 'device' as const, icon: 'camera-bold' as const, label: o18n.ocrDevice },
                ...(cloudOcrAvailable ? [{ key: 'cloud' as const, icon: 'sparkle-bold' as const, label: o18n.ocrCloud }] : []),
              ]}
            />
            <p className="operator__seg-hint mono">
              {ocrChoice !== 'device' && ocrChoice !== 'cloud' ? `${o18n.ocrAutoHint} ` : ''}
              {ocrEngine === 'cloud' ? o18n.ocrCloudHint : ocrEngine === 'vision' ? o18n.ocrVisionHint : o18n.ocrDeviceHint}
            </p>
          </SettingsRow>
        )}
        <SettingsRow label={o18n.langLabel}>
          <button type="button" className="btn" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
            {lang === 'fr' ? 'Français' : 'English'}
          </button>
        </SettingsRow>
        <SettingsRow label={o18n.contrastLabel}>
          <Segmented
            ariaLabel={o18n.contrastLabel}
            value={contrast}
            onChange={pickContrast}
            options={[
              { key: 'normal' as const, icon: 'sparkle-bold' as const, label: o18n.contrastNormal },
              { key: 'high' as const, icon: 'sparkle-bold' as const, label: o18n.contrastHigh },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={o18n.textScaleLabel}>
          <Segmented
            ariaLabel={o18n.textScaleLabel}
            value={textScale}
            onChange={pickTextScale}
            options={TEXT_SCALES.map((s) => ({ key: s, icon: 'magnifying-glass-bold' as const, label: o18n.textScale[s] }))}
          />
        </SettingsRow>
        <SettingsRow label={o18n.viewLabel}>
          {/* « Simple » (bmad/08 A-1) is the post-reader lens (grandma). */}
          <Segmented
            ariaLabel={t.audience.parent + ' / ' + t.audience.kid + ' / ' + t.audience.simple + ' / ' + t.audience.guest}
            value={guestPreview ? 'guest' : audience}
            onChange={(k) => {
              if (k === 'guest') {
                setGuestPreview(true)
                return
              }
              setGuestPreview(false)
              setAudience(k)
            }}
            options={[
              { key: 'parent' as const, icon: 'user-bold' as const, label: t.audience.parent },
              { key: 'toddler' as const, icon: 'baby-bold' as const, label: t.audience.kid },
              { key: 'simple' as const, icon: 'hand-heart-bold' as const, label: t.audience.simple },
              { key: 'guest' as const, icon: 'user-bold' as const, label: t.audience.guest },
            ]}
          />
          {guestPreview && <p className="operator__seg-hint mono">{t.audience.guestPreviewHint}</p>}
          {audience === 'simple' && !guestPreview && <p className="operator__seg-hint mono">{t.audience.simpleHint}</p>}
        </SettingsRow>
        <SettingsRow label={o18n.tutorialLabel}>
          <Segmented
            ariaLabel={o18n.tutorialTitle}
            value={tutorial ? 'on' : 'off'}
            onChange={(k) => setTutorial(k === 'on')}
            options={[
              { key: 'on' as const, icon: 'graduation-cap-bold' as const, label: o18n.tutorialOn },
              { key: 'off' as const, icon: 'lightning-bold' as const, label: o18n.tutorialOff },
            ]}
          />
        </SettingsRow>
        {/* The calm "Récents" session log (#38) — a quiet look back at what just
            happened, with a late Annuler. Reachable here even after the toast fades. */}
        <SettingsRow label={t.recents.title}>
          <RecentsPanel />
        </SettingsRow>
      </div>
      {/* « Sur l'écran d'accueil » — the standing install door (the board's one-time
          nudge is the other; lib/install). Renders nothing where there is nothing to
          offer, one line where the app is already installed. */}
      <InstallHint />
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
  const o18n = useOperatorT()
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  // Tap-to-hear (bmad/08 A-2): the per-device long-press-to-speak pref for the
  // toddler/simple lenses (lib/tapToHear). Default ON.
  const tapToHear = useTapToHear()
  const soundIsOn = useSoundOn()
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
    <OperatorSection title={o18n.voiceTitle} help={help} helpKey="voice">
      {/* « Le son » — the app's own silent switch, ABOVE the voice pickers and
          OUTSIDE the `available` guard, because it stays meaningful when no TTS voice
          is installed at all: it still mutes the timer chime and the vibration. It is
          also the reason the pickers below might do nothing, so it has to be the
          first thing read here.

          The same switch rides the routine player's and cook mode's bars — this is
          the calm mirror, not the primary door (you reach for it when something is
          already talking). Device-local, so a guest may flip it. */}
      <SettingsRow label={t.sound.label}>
        <div className="picker-chips mono">
          <SoundToggle />
          <span className="mono">{soundIsOn ? t.sound.on : t.sound.off}</span>
        </div>
      </SettingsRow>
      <p className="operator__hint mono">{t.sound.hint}</p>
      {!available ? (
        <p className="operator__hint mono">{o18n.voiceNone}</p>
      ) : (
        <div className="operator__voice">
          {/* #TTS — the GLOBAL read-aloud language, used everywhere narration plays
              (cook mode, routines, toddler tiles…). Auto follows the app language; a
              recipe's own language still wins for that recipe. */}
          <SettingsRow label={o18n.readLangLabel}>
            <div className="picker-chips mono">
              <Chip selected={readLang === 'auto'} onClick={() => setReadLang('auto')}>{t.recipes.readLangAuto}</Chip>
              <Chip selected={readLang === 'fr'} onClick={() => setReadLang('fr')}>{t.recipes.readLangFr}</Chip>
              <Chip selected={readLang === 'en'} onClick={() => setReadLang('en')}>{t.recipes.readLangEn}</Chip>
            </div>
          </SettingsRow>

          {/* Pick the voice for EACH language independently — a French app can still
              choose a good English voice for recipes read in English. */}
          <SettingsRow label={o18n.voiceLabel}>
            <div className="picker-chips mono">
              <Chip selected={voiceLang === 'fr'} onClick={() => setVoiceLang('fr')}>{t.recipes.readLangFr}</Chip>
              <Chip selected={voiceLang === 'en'} onClick={() => setVoiceLang('en')}>{t.recipes.readLangEn}</Chip>
            </div>
          </SettingsRow>
          {voicesForLang.length === 0 ? (
            <p className="operator__hint mono">{o18n.voiceNoneLang}</p>
          ) : (
            <select
              className="input"
              aria-label={o18n.voiceLabel}
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value)
                setVoicePref(voiceLang, e.target.value)
              }}
            >
              <option value="">{o18n.voiceAuto}</option>
              {voicesForLang.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          )}

          <SettingsRow as="label" label={<>{o18n.voiceSpeedLabel} · {rate.toFixed(1)}×</>}>
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
          </SettingsRow>

          {/* Tap-to-hear (A-2): in the Enfant / Simple lenses, holding a finger
              ~½ s on any row reads it aloud. Per-device, opt-out here. */}
          <SettingsRow label={o18n.tapToHearLabel}>
            <Toggle
              on={tapToHear}
              icon="speaker-high-bold"
              label={tapToHear ? o18n.ambientOnWord : o18n.ambientOffWord}
              onClick={() => setTapToHear(!tapToHear)}
            />
          </SettingsRow>
          <p className="operator__hint mono">{o18n.tapToHearHint}</p>

          {/* Test in the SELECTED voice language, with a phrase in that language —
              so a French app testing the English voice hears English (the point). */}
          <button
            type="button"
            className="btn"
            onClick={() => speak(voiceLang === 'fr' ? 'Allô ! Voici la voix de lecture.' : 'Hello! This is the reading voice.', voiceLang)}
          >
            <InlineIcon name="speaker-high-bold" /> {o18n.voiceTest}
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
  const o18n = useOperatorT()
  const { lang } = useLang()
  const confirm = useConfirm()
  const { overrides, preview, commit, reset } = useMeasureColorsEditor()
  // The ONE gated control in this file, and gated for the right reason: unlike the
  // device-local prefs above, measure colours are a HOUSEHOLD setting — the editor
  // PATCHes /api/household on close, so a read-only guest has nothing to commit.
  //
  // It used to `return null` and take the whole section with it. Two things about
  // that, both found by grepping rather than by reading the finding (2026-08-28):
  //
  //  • A LINK guest never saw either version. `kitchen ▸ apparence` is not in
  //    `GUEST_SUBS` (pages/Operator.tsx), so for them the kitchen tab has no Régler
  //    side at all — the sub list filters to empty one layer up. That allowlist, not
  //    this line, is what actually protects the household here; this is belt-and-braces.
  //  • Who DID see the hole is an operator in **guest preview** — `isGuest()` is true
  //    for them, `isGuestLocked()` (which drives GUEST_SUBS) is not. So the one
  //    audience for the gate got a section that silently vanished, in the very mode
  //    whose whole job is to show what read-only looks like.
  //
  // So it degrades like its siblings now (AisleOrderSection is the reference): the
  // swatches and the sample line stay — they ARE the household's colour coding, and
  // reading them is the point — while the OS pickers and « Réinitialiser » drop.
  const ro = isGuest()
  // A sample line that exercises every colour family + the scoop circles.
  const sample =
    lang === 'fr'
      ? '2 c. à soupe de beurre · ½ tasse de farine · ¼ c. à thé de sel'
      : '2 tbsp butter · ½ cup flour · ¼ tsp salt'
  return (
    <OperatorSection title={o18n.measureColorsTitle} help={help} helpKey="measureColors">
      <div className="measure-colors">
        {MEASURE_SWATCHES.map((s) => {
          const color = swatchColor(s, overrides)
          // Read-only: a plain swatch in the same box, no picker to open.
          return ro ? (
            <span key={s.id} className="measure-colors__row measure-colors__row--ro">
              <span className="measure-colors__swatch" style={{ background: color }} aria-hidden="true" />
              <span className="measure-colors__name">{s.label[lang]}</span>
            </span>
          ) : (
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
        <span className="measure-colors__preview-label mono">{o18n.measureColorsPreview}</span>
        <span className="measure-colors__preview-line">
          <IngredientLine line={sample} size="lg" scoops />
        </span>
      </div>
      {!ro && (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (await confirm({ message: o18n.resetConfirm, confirmLabel: o18n.measureColorsReset, tone: 'default' })) reset()
          }}
        >
          <InlineIcon name="arrows-counter-clockwise-bold" /> {o18n.measureColorsReset}
        </button>
      )}
    </OperatorSection>
  )
}

// The "anti-addiction" opt-out. Default ON (the calm tenet holds); it decides ONE
// thing — the sticker a child places on their wall at the end of a routine (calm ON:
// the routine simply ends, reward-free). The structural guarantees (no points, no
// push, finite lists) aren't toggleable. Stored in localStorage for now (bmad/04, OD-1).
export function CalmSection({ help }: { help?: HelpMode }) {
  const o18n = useOperatorT()
  const { calm, setCalm } = useCalm()
  return (
    <OperatorSection title={o18n.calmTitle} help={help} helpKey="calm">
      <button
        type="button"
        className={`btn${calm ? ' btn--primary' : ''}`}
        onClick={() => setCalm(!calm)}
        aria-pressed={calm}
      >
        {o18n.calmTitle} : {calm ? o18n.calmOn : o18n.calmOff}
      </button>
    </OperatorSection>
  )
}
