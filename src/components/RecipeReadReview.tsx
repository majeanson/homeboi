import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Modal } from './Modal'
import { SubTabs } from './SubTabs'
import { findMeasures, measuresDisagree } from '../lib/measure'
import { isSectionHeading, SECTION_PREFIX } from '../lib/recipeSections'
import { Icon, InlineIcon } from './Icon'
import { ZoomableImg } from './ZoomableImg'

// Verify-against-the-photo gate for a recipe read (Pillar 3 of the faithful-import
// work). No capture is 100%, so instead of dropping a read straight into the form
// we show the SOURCE photo beside the parsed lines and flag the spots most likely to
// be mis-read — measurements ("3/4 tasse"), bare fractions, and any word the OCR
// engine itself returned with low confidence. The cook glances at the card, fixes a
// flagged digit, and confirms. Editing here is line-in-place; the full editor (the
// recipe form) still opens afterwards for anything bigger.

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
}

// What the pipeline actually DID with this photo, shown to the cook under the
// « Rapport » tab: which reader ran (and which model), how the text got organized
// (deterministic headings vs a generative model), what was auto-corrected, which
// numbers could not be traced back to the photo, how many words the OCR itself
// hesitated on. Built by RecipeForm.readPhoto as the read progresses — honesty
// about the machine, so "it hallucinated" stops being a mystery.
export interface ReadReport {
  reader: 'device' | 'cloud' | 'vision' | null
  readerModel: string | null
  /** Mean OCR page confidence 0–100 (device reader only). */
  confidence: number | null
  pages: number
  /** The multi-column un-merge ran (device reader, columnizeOcrPage). */
  columnized: boolean
  structuring: 'headings' | 'ai' | 'heuristic' | 'vision' | null
  structuringModel: string | null
  /** Metric→fraction rescues applied client-side (repairImperialFromMetric). */
  repairs: { before: string; after: string }[]
  /** Lines whose numbers do not exist in the OCR transcript — the structuring
   *  model changed or invented them. Flagged 'ai' in the verify list. */
  suspect: string[]
  /** Distinct words the OCR engine read with low confidence (device reader). */
  shakyCount: number
}

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
// 'ai' = the structuring model put a number here the photo never printed;
// 'number' = a "%" (the classic OCR misread of ¾/½/¼) or an amount beside a unit
// word that doesn't parse; 'shaky' = the OCR engine itself hesitated on a word.
//
// We flag RISKY lines only — NOT every fraction. The panel used to flag every
// line containing any fraction (most of a recipe), which trained the eye to skim
// past the warnings; the one real flip then sailed through with the noise. A
// clean "3/4 tasse de farine" now stays calm; the risky shapes stand out alone.
type FlagReason = 'mismatch' | 'ai' | 'number' | 'shaky'
function flagReason(line: string, lowSet: Set<string>, aiSet: Set<string>): FlagReason | null {
  if (measuresDisagree(line)) return 'mismatch'
  if (aiSet.has(line)) return 'ai'
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
    : r === 'ai'
      ? t.recipes.reviewCheckAi
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
  draft,
  lowConfidenceWords,
  report,
  busy,
  onConfirm,
  onCancel,
}: {
  photoUrl: string
  draft: ReadReviewDraft
  lowConfidenceWords: string[]
  // The pipeline honesty report (« Rapport » tab). Optional so older callers /
  // the DevKit specimen without one simply hide the tab row.
  report?: ReadReport | null
  busy?: boolean
  onConfirm: (d: ReadReviewDraft) => void
  onCancel: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<'verify' | 'report'>('verify')

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
  // Lines the structuring model changed (numbers with no source in the photo) —
  // matched by exact text; an edited line drops its flag, which is right (the
  // cook just verified it by hand).
  const aiSet = useMemo(() => new Set(report?.suspect ?? []), [report])
  // How many lines we're asking the cook to glance at — drives the header hint so a
  // clean read ("rien à confirmer") feels calm rather than alarming.
  const flaggedCount = useMemo(
    () => [...ingredients, ...steps].filter((l) => !isSectionHeading(l) && flagReason(l, lowSet, aiSet)).length,
    [ingredients, steps, lowSet, aiSet],
  )

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
  const lineRow = (kind: 'ingredients' | 'steps', value: string, i: number) => {
    const set = kind === 'ingredients' ? setIngredients : setSteps
    const sec = isSectionHeading(value)
    const shown = sec ? value.replace(/^##\s?/, '') : value
    const reason = sec ? null : flagReason(value, lowSet, aiSet)
    return (
      <div key={i} className={'read-review__line' + (reason ? ' is-flagged' : '') + (sec ? ' is-sec' : '')}>
        {reason && (
          <span className="read-review__flag" title={reasonTip(reason, t)}>
            <Icon name="warning-bold" size={14} />
          </span>
        )}
        <GrowingLine
          value={shown}
          onChange={(v) => editLine(set, i, sec ? SECTION_PREFIX + v : v)}
          ariaLabel={kind === 'ingredients' ? t.recipes.ingredients : t.recipes.steps}
        />
        {reason && <span className="chip read-review__chiptag">{t.recipes.reviewConfirm}</span>}
      </div>
    )
  }

  return (
    <Modal open onClose={onCancel} className="read-review" title={t.recipes.reviewTitle}>
        <p className="read-review__hint mono">
          {flaggedCount > 0 ? t.recipes.reviewHint : t.recipes.reviewHintClean}
        </p>

        {/* Vérifier ↔ Rapport: the second face is the pipeline honesty report —
            what read the photo, what organized the text, what was corrected or
            couldn't be traced back. Only offered when the caller built one. */}
        {report && (
          <SubTabs<'verify' | 'report'>
            options={[
              { key: 'verify', label: t.recipes.reviewTabVerify },
              { key: 'report', label: t.recipes.reviewTabReport },
            ]}
            value={tab}
            onSelect={setTab}
            ariaLabel={t.recipes.reviewTitle}
          />
        )}

        <div className="read-review__body">
          {/* The source card — tap to zoom and read a price/fraction up close.
              Stays visible on BOTH tabs: the report's flagged lines are checked
              against the same photo. */}
          <div className="read-review__photo">
            <ZoomableImg src={photoUrl} alt={t.recipes.reviewPhotoAlt} />
          </div>

          {report && tab === 'report' ? (
            <ReadReportPanel report={report} />
          ) : (
          /* The parsed lines, editable in place against the photo. */
          <div className="read-review__fields">
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
              steps.map((v, i) => lineRow('steps', v, i))
            ) : (
              <p className="read-review__empty mono">{t.recipes.reviewNone}</p>
            )}
          </div>
          )}
        </div>

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
function ReadReportPanel({ report }: { report: ReadReport }) {
  const t = useT()
  const readerLabel =
    report.reader === 'device'
      ? t.recipes.reportReaderDevice
      : report.reader === 'cloud'
        ? t.recipes.reportReaderCloud
        : report.reader === 'vision'
          ? t.recipes.reportReaderVision
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
        t.recipes.reportReader,
        <>
          <p>{readerLabel}</p>
          <p className="mono read-review__report-meta">
            {[
              report.readerModel,
              report.confidence != null ? `${t.recipes.reportConfidence} ${Math.round(report.confidence)} %` : null,
              t.recipes.reportPages(report.pages),
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
      {/* Only meaningful when a generative model touched the text. */}
      {(report.structuring === 'ai' || report.structuring === 'vision') &&
        row(
          t.recipes.reportSuspect,
          report.suspect.length ? (
            report.suspect.map((l, i) => <p key={i}>⚠ {l}</p>)
          ) : (
            <p>{t.recipes.reportSuspectNone}</p>
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
