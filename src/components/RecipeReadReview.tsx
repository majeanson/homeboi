import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Modal } from './Modal'
import { PanZoom } from './PanZoom'
import { findMeasures, measuresDisagree } from '../lib/measure'
import type { PhotoWarningKind } from '../lib/photoCheck'
import { isSectionHeading, SECTION_PREFIX } from '../lib/recipeSections'
import { Icon, InlineIcon } from './Icon'
import { Chip } from './Chip'
import { Cluster } from './Layout'
import { Disclosure } from './Disclosure'
import { EditField } from './EditField'

// Verify-against-the-photo gate for a recipe read (Pillar 3 of the faithful-import
// work). No capture is 100%, so instead of dropping a read straight into the form
// we show the SOURCE photo beside the parsed lines and flag the spots most likely to
// be mis-read — measurements ("3/4 tasse"), bare fractions, and any word the OCR
// engine itself returned with low confidence. The cook glances at the card, fixes a
// flagged digit, and confirms. Editing here is line-in-place; the full editor (the
// recipe form) still opens afterwards for anything bigger.
//
// The source is a PHOTO (the photo read) or the PAGE TEXT (a link or a paste the AI
// had to organise, 2026-10-27): same panel, same flags — the left pane shows the
// text instead of the picture, and `onRetry` adds « Guider l'IA » to re-run the read
// with the cook's one-line hint.

export interface ReadReviewDraft {
  title: string | null
  ingredients: string[]
  steps: string[]
  // Carried through untouched to applyDraft — the review only edits the text lines.
  servings?: number | null
  servingsUnit?: string | null
  times?: { prep: number | null; cook: number | null; total: number | null }
  lang?: 'fr' | 'en' | null
  source?: string | null
  notes?: string | null
}

// What the pipeline actually DID with this photo, shown to the cook under the
// « Rapport » tab: which reader ran (and which model), how the text got organized
// (deterministic headings vs a generative model), what was auto-corrected, which
// numbers could not be traced back to the photo, how many words the OCR itself
// hesitated on. Built by RecipeForm.readPhoto as the read progresses — honesty
// about the machine, so "it hallucinated" stops being a mystery.
export interface ReadReport {
  reader: 'device' | 'cloud' | 'vision' | 'page' | null
  readerModel: string | null
  /** Mean OCR page confidence 0–100 (device reader only). */
  confidence: number | null
  pages: number
  /** The multi-column un-merge ran (device reader, columnizeOcrPage). */
  columnized: boolean
  structuring: 'headings' | 'ai' | 'heuristic' | 'vision' | 'jsonld' | 'microdata' | null
  structuringModel: string | null
  /** Metric→fraction rescues applied client-side (repairImperialFromMetric). */
  repairs: { before: string; after: string }[]
  /** What the server's audit found (functions/_lib/recipeAudit) — a step count short
   *  of the page's, a measured phrase no ingredient names, a junk title… A flag that
   *  names a line marks that line 'audit' in the verify list. */
  audit: AuditFlagView[]
  /** Distinct words the OCR engine read with low confidence (device reader). */
  shakyCount: number
  /** Wall-clock milliseconds, as measured on the device: the read (all pages) and the
   *  structuring pass — so a slow read says WHICH half was slow (Marc, 2026-10-27:
   *  « about 1–2 min » for one photo, with no way to tell where the time went). */
  timings?: { read?: number; structure?: number }
  /** Readers TRIED before the one that answered, and why each did not (the day's AI
   *  budget, an error, nothing usable, « I see no image ») — a fallback reader is said
   *  out loud, never silent (Marc, 2026-10-30). */
  readerAttempts: AiAttemptView[]
  /** The structuring model tried and did not answer → the draft is the shape read's. */
  structuringAttempts: AiAttemptView[]
  /** What the photos themselves looked like before any reader ran (lib/photoCheck). */
  photoWarnings: { page: number; kind: PhotoWarningKind }[]
}

/** One model tried and not answering, as the endpoints send it. */
export interface AiAttemptView {
  model: string
  reason: 'budget' | 'error' | 'empty' | 'blind'
}

/** One audit finding, as the import endpoints send it (`audit` on every response). */
export interface AuditFlagView {
  kind: 'step-count' | 'step-gap' | 'missing-ingredient' | 'title-junk' | 'dup-step' | 'empty-section' | 'no-quantity'
  line?: string
}

// A model id as a cook reads it: « mistral-small-3.1-24b-instruct » → « Mistral Small 3.1 ».
export const modelLabel = (id: string): string => {
  const base = id.replace(/^@cf\//, '').split('/').pop() ?? id
  const m = base.match(/^([a-z]+)(?:-([a-z]+))?(?:-?(\d+(?:\.\d+)?))?/i)
  if (!m) return base
  const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : '')
  return [cap(m[1]), m[2] && !/^\d/.test(m[2]) ? cap(m[2]) : '', m[3] ?? ''].filter(Boolean).join(' ')
}
const reasonText = (r: AiAttemptView['reason'], t: ReturnType<typeof useT>): string =>
  r === 'budget' ? t.recipes.aiReasonBudget : r === 'error' ? t.recipes.aiReasonError : r === 'blind' ? t.recipes.aiReasonBlind : t.recipes.aiReasonEmpty
const attemptsText = (a: AiAttemptView[], t: ReturnType<typeof useT>): string =>
  a.map((x) => `${modelLabel(x.model)} : ${reasonText(x.reason, t)}`).join(' · ')
const photoWarnText = (k: PhotoWarningKind, t: ReturnType<typeof useT>): string =>
  k === 'blur' ? t.recipes.photoWarnBlur : k === 'shadow' ? t.recipes.photoWarnShadow : t.recipes.photoWarnEdge

// The audit finding, in words — the panel's hint line and the « Rapport » tab.
const auditText = (f: AuditFlagView, t: ReturnType<typeof useT>): string =>
  f.kind === 'step-count'
    ? t.recipes.auditStepCount(f.line ?? '')
    : f.kind === 'step-gap'
      ? t.recipes.auditStepGap(f.line ?? '')
    : f.kind === 'missing-ingredient'
      ? t.recipes.auditMissing(f.line ?? '')
      : f.kind === 'title-junk'
        ? t.recipes.auditTitle
        : f.kind === 'dup-step'
          ? t.recipes.auditDup
          : f.kind === 'empty-section'
            ? t.recipes.auditEmpty
            : t.recipes.auditNoQty

// A fraction (ASCII "3/4" or a vulgar-fraction glyph) — the exact OCR flip risk;
// flagged only when it sits beside a unit word yet doesn't parse (see flagReason).
const FRACTION = /[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚⅕⅖⅗⅘⅐⅑⅒]|\b\d+\s*\/\s*\d+\b/

// A unit word (cup/spoon), so we can tell "a measurement whose amount didn't read"
// from plain prose. Paired with a metric ml on the line, an unreadable amount is the
// garbled-fraction signature ("125 ml (A de c. à thé)"). NOT `\b` after the à: JS \b
// is ASCII-only, so `à\b` never matches and the whole "c. à" branch was silently dead
// (same gotcha measure.ts documents) — a letter-lookahead does the boundary's job.
const UNIT_WORD = /\b(?:tasses?|cups?|cuill[èe]res?|tbsp|tbs|tsp)\b|c\.?\s*(?:à|a)(?![a-zà-ÿ])/i

// Why a line is worth a second look, or null when it's clean, most-serious first:
// 'mismatch' = two units on the line DISAGREE by conversion (one was mis-read);
// 'audit' = the server's audit named this line (or a phrase inside it);
// 'number' = a "%" (the classic OCR misread of ¾/½/¼) or an amount beside a unit
// word that doesn't parse; 'shaky' = the OCR engine itself hesitated on a word.
//
// We flag RISKY lines only — NOT every fraction. The panel used to flag every
// line containing any fraction (most of a recipe), which trained the eye to skim
// past the warnings; the one real flip then sailed through with the noise. A
// clean "3/4 tasse de farine" now stays calm; the risky shapes stand out alone.
type FlagReason = 'mismatch' | 'audit' | 'number' | 'shaky'
function flagReason(line: string, lowSet: Set<string>, auditLines: string[]): FlagReason | null {
  if (measuresDisagree(line)) return 'mismatch'
  if (auditLines.some((p) => line === p || line.includes(p))) return 'audit'
  if (line.includes('%')) return 'number'
  // A fraction or ml amount right beside a unit word that findMeasures can't
  // parse = a garbled amount the metric repair couldn't rescue — double-check it.
  if ((FRACTION.test(line) || /\d\s*ml\b/i.test(line)) && UNIT_WORD.test(line) && findMeasures(line).length === 0)
    return 'number'
  if (lowSet.size) {
    for (const w of line.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (w && lowSet.has(w)) return 'shaky'
    }
  }
  return null
}
const reasonTip = (r: FlagReason, t: ReturnType<typeof useT>): string =>
  r === 'mismatch'
    ? t.recipes.reviewCheckMismatch
    : r === 'audit'
      ? t.recipes.reviewCheckAudit
      : r === 'number'
        ? t.recipes.reviewCheckNumber
        : t.recipes.reviewCheckWord

// Every line is a MEMO box, not a one-line input: verifying against the photo only
// works if the whole line is readable, and a step easily runs three lines. The
// textarea grows to fit its content (and re-fits as the cook types); Enter inside
// one splits it into separate lines on confirm — handy when the OCR merged two.
function GrowingLine({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight excludes the borders but .input is border-box — add them back
    // (offsetHeight − clientHeight) or the box sits a couple px short and scrolls.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="input read-review__memo"
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    />
  )
}

export function RecipeReadReview({
  photoUrl,
  sourceText,
  draft,
  lowConfidenceWords,
  report,
  busy,
  onConfirm,
  onCancel,
  onRetry,
  retrying,
}: {
  /** The photo that was read — or null when the source is page text. */
  photoUrl?: string | null
  /** The page text the AI organised (link / paste path), shown when there is no photo. */
  sourceText?: string | null
  draft: ReadReviewDraft
  lowConfidenceWords: string[]
  // The pipeline honesty report (« Rapport » tab). Optional so older callers /
  // the DevKit specimen without one simply hide the tab row.
  report?: ReadReport | null
  busy?: boolean
  onConfirm: (d: ReadReviewDraft) => void
  onCancel: () => void
  /** Re-run the read with the cook's hint (« Guider l'IA »). Omit → no retry offered. */
  onRetry?: (hint: string) => void
  retrying?: boolean
}) {
  const t = useT()
  const [tab, setTab] = useState<'verify' | 'report'>('verify')
  const [hint, setHint] = useState('')
  // The page can be folded away for the lines' sake, and brought back.
  const [showPhoto, setShowPhoto] = useState(true)
  const fromText = !photoUrl

  const [title, setTitle] = useState(draft.title ?? '')
  const [ingredients, setIngredients] = useState<string[]>(draft.ingredients.length ? draft.ingredients : [])
  const [steps, setSteps] = useState<string[]>(draft.steps.length ? draft.steps : [])
  // Portions + times are read off the page too and easy to mis-read, so they're
  // checkable against the photo here (not just later in the form). Kept as strings
  // so the fields can be blanked; parsed back to numbers on confirm.
  const numStr = (n: number | null | undefined) => (n ? String(n) : '')
  const [servings, setServings] = useState(numStr(draft.servings))
  const [prep, setPrep] = useState(numStr(draft.times?.prep))
  const [cook, setCook] = useState(numStr(draft.times?.cook))

  const lowSet = useMemo(() => new Set(lowConfidenceWords.map((w) => w.toLowerCase())), [lowConfidenceWords])
  // The lines (or phrases) the server's audit named — matched by text; an edited line
  // drops its flag, which is right (the cook just verified it by hand).
  const auditLines = useMemo(
    () => (report?.audit ?? []).map((f) => (f.kind === 'step-count' ? '' : (f.line ?? ''))).filter(Boolean),
    [report],
  )
  // How many lines we're asking the cook to glance at — drives the header hint so a
  // clean read ("rien à confirmer") feels calm rather than alarming.
  // Lines the cook checked by eye and tapped « à vérifier » on (Marc, 2026-10-27): the
  // flag goes, a quiet « vérifié » chip stays and can be tapped back. Keyed by kind +
  // index; editing a line clears its flag anyway (the text no longer matches).
  const [verified, setVerified] = useState<Set<string>>(() => new Set())
  const toggleVerified = (key: string) =>
    setVerified((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  const flaggedCount = useMemo(
    () =>
      [...ingredients.map((l, i) => ({ l, k: `ingredients:${i}` })), ...steps.map((l, i) => ({ l, k: `steps:${i}` }))].filter(
        ({ l, k }) => !isSectionHeading(l) && !verified.has(k) && flagReason(l, lowSet, auditLines),
      ).length,
    [ingredients, steps, lowSet, auditLines, verified],
  )

  // The step's number as the recipe will show it (a section heading has none) — so the
  // page's « 1, 2, 3, 5 » is checked against a « 1, 2, 3, 4 » here by eye (Marc,
  // 2026-10-30: « in the verify page we can't see the step numbers »).
  const stepNos = useMemo(() => {
    let n = 0
    return steps.map((v) => (isSectionHeading(v) ? null : ++n))
  }, [steps])

  const editLine = (set: React.Dispatch<React.SetStateAction<string[]>>, i: number, v: string) =>
    set((xs) => xs.map((x, idx) => (idx === i ? v : x)))

  const confirm = () => {
    if (busy) return
    // A blank or non-positive field clears that value (parseInt → NaN → null).
    const num = (s: string): number | null => {
      const n = parseInt(s, 10)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    // A newline typed inside one memo box splits it into separate lines — the
    // in-place fix for a read that merged two printed lines into one.
    const flat = (xs: string[]) => xs.flatMap((s) => s.split('\n')).map((s) => s.trim()).filter(Boolean)
    onConfirm({
      ...draft,
      title: title.trim() || null,
      ingredients: flat(ingredients),
      steps: flat(steps),
      servings: num(servings),
      times: { prep: num(prep), cook: num(cook), total: draft.times?.total ?? null },
    })
  }

  // One editable line. A section heading ("## Glaçage") edits its title only; a
  // flagged line gets the warning rail + an "à confirmer" chip.
  const lineRow = (kind: 'ingredients' | 'steps', value: string, i: number, no: number | null = null) => {
    const set = kind === 'ingredients' ? setIngredients : setSteps
    const sec = isSectionHeading(value)
    const shown = sec ? value.replace(/^##\s?/, '') : value
    const key = `${kind}:${i}`
    const risky = sec ? null : flagReason(value, lowSet, auditLines)
    const checked = !!risky && verified.has(key)
    const reason = checked ? null : risky
    return (
      <div key={i} className={'read-review__line' + (reason ? ' is-flagged' : '') + (sec ? ' is-sec' : '')}>
        {no != null && (
          <span className="read-review__no mono" aria-hidden="true">
            {no}
          </span>
        )}
        {reason && (
          <span className="read-review__flag" title={reasonTip(reason, t)}>
            <Icon name="warning-bold" size={14} />
          </span>
        )}
        <GrowingLine
          value={shown}
          onChange={(v) => editLine(set, i, sec ? SECTION_PREFIX + v : v)}
          ariaLabel={kind === 'ingredients' ? t.recipes.ingredients : no != null ? `${t.recipes.steps} ${no}` : t.recipes.steps}
        />
        {/* « à vérifier » is a TAP: looked at the photo, it's right → « vérifié » (and
            back, if the eye was too quick). */}
        {risky && (
          <Chip className="read-review__chiptag" selected={checked} onClick={() => toggleVerified(key)} title={checked ? t.recipes.reviewVerifiedTip : reasonTip(risky, t)}>
            {checked ? t.recipes.reviewVerified : t.recipes.reviewConfirm}
          </Chip>
        )}
      </div>
    )
  }

  // The hints ride INSIDE the scrolling column, at its head — not pinned above it. The
  // photo is what stays put (below): a cook checking a line against the page needs the
  // page in view, not the sentence telling them to check (Marc, 2026-10-30).
  const hints = (
    <>
        <p className="read-review__hint mono">
          {fromText ? t.recipes.reviewHintText : flaggedCount > 0 ? t.recipes.reviewHint : t.recipes.reviewHintClean}
        </p>
        {/* Why the read waits here: what the audit found, one short line each. */}
        {report?.audit.length ? (
          <p className="read-review__hint read-review__audit mono" data-testid="read-review-audit">
            <Icon name="warning-bold" size={14} /> {report.audit.map((f) => auditText(f, t)).join(' · ')}
          </p>
        ) : null}
        {/* The machine's own confession, before the cook trusts a line: a fallback reader
            answered (and why the first did not), the structuring model did not answer,
            the photo itself was blurred / shaded / cut at the edge. */}
        {report?.readerAttempts.length ? (
          <p className="read-review__hint read-review__audit mono" data-testid="read-review-fallback">
            <Icon name="warning-bold" size={14} /> {t.recipes.readerFallback(report.readerModel ? modelLabel(report.readerModel) : t.recipes.reportReaderDevice)} — {attemptsText(report.readerAttempts, t)}
          </p>
        ) : null}
        {report?.structuringAttempts.length ? (
          <p className="read-review__hint read-review__audit mono" data-testid="read-review-structuring-fallback">
            <Icon name="warning-bold" size={14} /> {t.recipes.structuringFallback} — {attemptsText(report.structuringAttempts, t)}
          </p>
        ) : null}
        {report?.photoWarnings.length ? (
          <p className="read-review__hint read-review__audit mono" data-testid="read-review-photo">
            <Icon name="camera-bold" size={14} />{' '}
            {[...new Set(report.photoWarnings.map((w) => w.kind))].map((k) => photoWarnText(k, t)).join(' · ')}
          </p>
        ) : null}
        {report?.reader === 'vision' && !fromText ? <p className="read-review__hint mono">{t.recipes.columnsNudge}</p> : null}
    </>
  )

  return (
    <Modal open onClose={onCancel} className="read-review" title={t.recipes.reviewTitle}>
        {/* One row of two chips: show/hide the page, and « Rapport » — the pipeline
            honesty report (what read the photo, what organized the text, what was
            corrected or couldn't be traced back) as a toggle, not a tab row that took a
            whole band of a phone's height for two words (Marc, 2026-10-30). Only
            offered when the caller built one. */}
        {(photoUrl || report) && (
          <Cluster className="read-review__tools">
            {photoUrl && (
              <Chip selected={showPhoto} onClick={() => setShowPhoto((v) => !v)} icon="image-square-bold">
                {t.recipes.reviewPhotoToggle}
              </Chip>
            )}
            {report && (
              <Chip selected={tab === 'report'} onClick={() => setTab((x) => (x === 'report' ? 'verify' : 'report'))}>
                {t.recipes.reviewTabReport}
              </Chip>
            )}
          </Cluster>
        )}

        <div className="read-review__body">
          {/* The source card — tap to zoom and read a price/fraction up close. PINNED
              at the top of the scroll on every width (sticky): the lines, the hints and
              the title scroll under it, so a line is always read with the page in view.
              Stays on BOTH tabs: the report's flagged lines are checked against the
              same photo. */}
          {photoUrl ? (
            /* The page under a LOUPE, a third of the phone high — not the whole photo at
               full width, which left no room for the lines (Marc, 2026-10-30: « a
               zoomed-in picture we can drag up, down, left, right, and show where we are
               in the bigger picture »): the shared PanZoom opened at 2×, top-left first,
               with its minimap in the corner. */
            showPhoto && (
              <div className="read-review__photo">
                <PanZoom className="read-review__mag" ariaLabel={t.recipes.reviewPhotoAlt} initialScale={2} minimap={<img className="read-review__mag-img" src={photoUrl} alt="" draggable={false} />}>
                  <img className="read-review__mag-img" src={photoUrl} alt={t.recipes.reviewPhotoAlt} draggable={false} />
                </PanZoom>
              </div>
            )
          ) : (
            // The page text in the same sticky column — selectable, scrollable, never
            // editable (it is the SOURCE the lines are checked against).
            <pre className="read-review__photo read-review__source" tabIndex={0} aria-label={t.recipes.reviewSourceText}>
              {sourceText ?? ''}
            </pre>
          )}

          {report && tab === 'report' ? (
            <ReadReportPanel report={report} fromText={fromText} />
          ) : (
          /* The parsed lines, editable in place against the photo. */
          <div className="read-review__fields">
            {hints}
            <input
              className="input read-review__title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.recipes.titlePlaceholder}
            />

            {/* Portions + times — read off the page, checkable against the photo
                (blank = none). Numbers are in minutes; the form has the same fields. */}
            <div className="read-review__meta">
              <label className="read-review__num mono">
                {t.recipes.servings}
                <input
                  className="input"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </label>
              <label className="read-review__num mono">
                {t.recipes.timePrep}
                <input
                  className="input"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={prep}
                  onChange={(e) => setPrep(e.target.value)}
                />
              </label>
              <label className="read-review__num mono">
                {t.recipes.timeCook}
                <input
                  className="input"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={cook}
                  onChange={(e) => setCook(e.target.value)}
                />
              </label>
            </div>

            <h3 className="read-review__sec">
              <Icon name="carrot-bold" size={16} color="var(--terracotta-deep)" /> {t.recipes.ingredients}
            </h3>
            {ingredients.length ? (
              ingredients.map((v, i) => lineRow('ingredients', v, i))
            ) : (
              <p className="read-review__empty mono">{t.recipes.reviewNone}</p>
            )}

            <h3 className="read-review__sec">
              <Icon name="pencil-simple-bold" size={16} color="var(--berry-deep)" /> {t.recipes.steps}
            </h3>
            {steps.length ? (
              steps.map((v, i) => lineRow('steps', v, i, stepNos[i]))
            ) : (
              <p className="read-review__empty mono">{t.recipes.reviewNone}</p>
            )}
          </div>
          )}
        </div>

        {/* « Guider l'IA » — the cook says what the model got wrong (« c'est la 2e
            recette de la page ») and the read runs again. Folded: most reads are fine. */}
        {onRetry && (
          <Disclosure label={t.recipes.importHint} className="read-review__guide">
            <EditField
              value={hint}
              onChange={setHint}
              onSubmit={(v) => onRetry(v.trim())}
              submitLabel={retrying ? t.recipes.importing : t.recipes.reviewRetryHint}
              submitIcon={null}
              busy={retrying || busy}
              placeholder={t.recipes.importHintPlaceholder}
              ariaLabel={t.recipes.importHint}
              maxLength={200}
              allowEmpty
            />
          </Disclosure>
        )}

        <div className="read-review__foot">
          <button type="button" className="btn btn--ghost mono" onClick={onCancel} disabled={busy}>
            {t.recipes.reviewRetake}
          </button>
          <button type="button" className="btn btn--primary" onClick={confirm} disabled={busy}>
            <InlineIcon name="check-bold" /> {busy ? t.recipes.reviewSaving : t.recipes.reviewConfirmBtn}
          </button>
        </div>
    </Modal>
  )
}

// The « Rapport » tab body: plain stacked rows, no jargon beyond the model names
// themselves (naming the exact model IS the point — a wrong number has a named
// suspect). Read-only; everything actionable lives under « Vérifier ».
function ReadReportPanel({ report, fromText }: { report: ReadReport; fromText: boolean }) {
  const t = useT()
  const readerLabel =
    report.reader === 'device'
      ? t.recipes.reportReaderDevice
      : report.reader === 'cloud'
        ? t.recipes.reportReaderCloud
        : report.reader === 'vision'
          ? t.recipes.reportReaderVision
          : report.reader === 'page'
            ? t.recipes.reportReaderPage
            : t.recipes.reportReaderNone
  const structLabel =
    report.structuring === 'headings'
      ? t.recipes.reportStructHeadings
      : report.structuring === 'ai'
        ? t.recipes.reportStructAi
        : report.structuring === 'heuristic'
          ? t.recipes.reportStructHeuristic
          : report.structuring === 'vision'
            ? t.recipes.reportStructVision
            : report.structuring === 'jsonld' || report.structuring === 'microdata'
              ? t.recipes.reportStructSite
              : null
  const row = (label: string, children: React.ReactNode) => (
    <div className="read-review__report-row">
      <div className="read-review__report-label mono">{label}</div>
      <div className="read-review__report-value">{children}</div>
    </div>
  )
  return (
    <div className="read-review__fields read-review__report">
      {row(
        fromText ? t.recipes.reviewSourceText : t.recipes.reportReader,
        <>
          <p>{readerLabel}</p>
          <p className="mono read-review__report-meta">
            {[
              report.readerModel,
              report.confidence != null ? `${t.recipes.reportConfidence} ${Math.round(report.confidence)} %` : null,
              fromText ? null : t.recipes.reportPages(report.pages),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {report.columnized && <p className="mono read-review__report-meta">{t.recipes.reportColumns}</p>}
        </>,
      )}
      {structLabel &&
        row(
          t.recipes.reportStructuring,
          <>
            <p>{structLabel}</p>
            {report.structuringModel && (
              <p className="mono read-review__report-meta">
                {t.recipes.reportModel} : {report.structuringModel}
              </p>
            )}
          </>,
        )}
      {/* Where the seconds went — the read and the structuring, measured on the device. */}
      {(report.timings?.read != null || report.timings?.structure != null) &&
        row(
          t.recipes.reportTimings,
          <p className="mono read-review__report-meta">
            {[
              report.timings.read != null ? `${t.recipes.reportTimingRead} ${Math.max(1, Math.round(report.timings.read / 1000))} s` : null,
              report.timings.structure != null ? `${t.recipes.reportTimingStructure} ${Math.max(1, Math.round(report.timings.structure / 1000))} s` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>,
        )}
      {row(
        t.recipes.reportRepairs,
        report.repairs.length ? (
          <>
            {report.repairs.map((r, i) => (
              <p key={i} className="read-review__report-repair">
                <s>{r.before}</s>
                <br />
                <Icon name="arrow-right-bold" size={12} /> {r.after}
              </p>
            ))}
            <p className="mono read-review__report-meta">{t.recipes.reportRepairsWhy}</p>
          </>
        ) : (
          <p>{t.recipes.reportRepairsNone}</p>
        ),
      )}
      {row(
        t.recipes.reportAudit,
        report.audit.length ? (
          report.audit.map((f, i) => <p key={i}>⚠ {auditText(f, t)}</p>)
        ) : (
          <p>{t.recipes.reportAuditNone}</p>
        ),
      )}
      {/* Which models were tried and did not answer — the budget, an error, nothing. */}
      {row(
        t.recipes.reportAttempts,
        report.readerAttempts.length || report.structuringAttempts.length ? (
          <>
            {report.readerAttempts.map((a, i) => (
              <p key={`r${i}`}>⚠ {modelLabel(a.model)} : {reasonText(a.reason, t)}</p>
            ))}
            {report.structuringAttempts.map((a, i) => (
              <p key={`s${i}`}>⚠ {modelLabel(a.model)} : {reasonText(a.reason, t)}</p>
            ))}
          </>
        ) : (
          <p>{t.recipes.reportAttemptsNone}</p>
        ),
      )}
      {row(
        t.recipes.reportPhoto,
        report.photoWarnings.length ? (
          report.photoWarnings.map((w, i) => (
            <p key={i}>
              ⚠ {report.pages > 1 ? `${t.recipes.reportPhotoPage(w.page + 1)} — ` : ''}
              {photoWarnText(w.kind, t)}
            </p>
          ))
        ) : (
          <p>{t.recipes.reportPhotoNone}</p>
        ),
      )}
      {report.reader === 'device' &&
        row(
          t.recipes.reportShaky,
          <p>{report.shakyCount ? t.recipes.reportShakyCount(report.shakyCount) : t.recipes.reportShakyNone}</p>,
        )}
    </div>
  )
}
