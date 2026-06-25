import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { useModal } from '../lib/useModal'
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

// A bare fraction (ASCII "3/4" or a vulgar-fraction glyph) — the exact OCR flip
// risk, flagged even when no cup/spoon unit follows.
const FRACTION = /[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚⅕⅖⅗⅘⅐⅑⅒]|\b\d+\s*\/\s*\d+\b/

// Why a line is worth a second look, or null when it's plain text, most-serious
// first: a 'mismatch' is two units on the line that DISAGREE by conversion (one was
// mis-read); 'number' is a measurement/fraction/"%" (a "%" is the classic OCR misread
// of ¾/½/¼); 'shaky' is a word the OCR engine itself read with low confidence.
// A unit word (cup/spoon), so we can tell "a measurement whose amount didn't read"
// from plain prose. Paired with a metric ml on the line, an unreadable amount is the
// garbled-fraction signature ("125 ml (A de c. à thé)").
const UNIT_WORD = /\b(?:tasses?|cups?|cuill[èe]res?|tbsp|tbs|tsp)\b|c\.?\s*(?:à|a)\b/i

// Why a line is worth a second look, or null when it's clean. We flag the RISKY
// lines (a number that doesn't add up, a "%", a measurement whose amount is garbled,
// a low-confidence word) — NOT every measurement, so a correctly-read "60 ml (1/4 de
// tasse)" stays calm while "125 ml (A de c. à thé)" stands out.
type FlagReason = 'mismatch' | 'number' | 'shaky'
function flagReason(line: string, lowSet: Set<string>): FlagReason | null {
  if (measuresDisagree(line)) return 'mismatch'
  if (line.includes('%') || FRACTION.test(line)) return 'number' // a stray fraction glyph the repair couldn't place
  // A "<n> ml ( … unit … )" line whose imperial amount we can't read = a fraction the
  // OCR mangled (and the metric repair couldn't rescue) — exactly what to double-check.
  if (/\d\s*ml\b/i.test(line) && UNIT_WORD.test(line) && findMeasures(line).length === 0) return 'number'
  if (lowSet.size) {
    for (const w of line.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (w && lowSet.has(w)) return 'shaky'
    }
  }
  return null
}
const reasonTip = (r: FlagReason, t: ReturnType<typeof useT>): string =>
  r === 'mismatch' ? t.recipes.reviewCheckMismatch : r === 'number' ? t.recipes.reviewCheckNumber : t.recipes.reviewCheckWord

export function RecipeReadReview({
  photoUrl,
  draft,
  lowConfidenceWords,
  busy,
  onConfirm,
  onCancel,
}: {
  photoUrl: string
  draft: ReadReviewDraft
  lowConfidenceWords: string[]
  busy?: boolean
  onConfirm: (d: ReadReviewDraft) => void
  onCancel: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref, onCancel)

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
  // How many lines we're asking the cook to glance at — drives the header hint so a
  // clean read ("rien à confirmer") feels calm rather than alarming.
  const flaggedCount = useMemo(
    () => [...ingredients, ...steps].filter((l) => !isSectionHeading(l) && flagReason(l, lowSet)).length,
    [ingredients, steps, lowSet],
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
    onConfirm({
      ...draft,
      title: title.trim() || null,
      ingredients: ingredients.map((s) => s.trim()).filter(Boolean),
      steps: steps.map((s) => s.trim()).filter(Boolean),
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
    const reason = sec ? null : flagReason(value, lowSet)
    return (
      <div key={i} className={'read-review__line' + (reason ? ' is-flagged' : '') + (sec ? ' is-sec' : '')}>
        {reason && (
          <span className="read-review__flag" title={reasonTip(reason, t)}>
            <Icon name="warning-bold" size={14} />
          </span>
        )}
        <input
          className="input"
          value={shown}
          onChange={(e) => editLine(set, i, sec ? SECTION_PREFIX + e.target.value : e.target.value)}
          aria-label={kind === 'ingredients' ? t.recipes.ingredients : t.recipes.steps}
        />
        {reason && <span className="chip read-review__chiptag">{t.recipes.reviewConfirm}</span>}
      </div>
    )
  }

  return createPortal(
    <div ref={ref} className="read-review" role="dialog" aria-modal="true" aria-label={t.recipes.reviewTitle}>
      <div className="read-review__scrim" onClick={onCancel} aria-hidden="true" />
      <div className="read-review__card surface">
        <div className="read-review__bar">
          <h2>{t.recipes.reviewTitle}</h2>
          <button type="button" className="btn btn--ghost mono" onClick={onCancel} aria-label={t.common.cancel}>
            <Icon name="x-bold" size={18} />
          </button>
        </div>

        <p className="read-review__hint mono">
          {flaggedCount > 0 ? t.recipes.reviewHint : t.recipes.reviewHintClean}
        </p>

        <div className="read-review__body">
          {/* The source card — tap to zoom and read a price/fraction up close. */}
          <div className="read-review__photo">
            <ZoomableImg src={photoUrl} alt={t.recipes.reviewPhotoAlt} />
          </div>

          {/* The parsed lines, editable in place against the photo. */}
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
        </div>

        <div className="read-review__foot">
          <button type="button" className="btn btn--ghost mono" onClick={onCancel} disabled={busy}>
            {t.recipes.reviewRetake}
          </button>
          <button type="button" className="btn btn--primary" onClick={confirm} disabled={busy}>
            <InlineIcon name="check-bold" /> {busy ? t.recipes.reviewSaving : t.recipes.reviewConfirmBtn}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
