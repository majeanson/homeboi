import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { useModal } from '../lib/useModal'
import { findMeasures } from '../lib/measure'
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

// Why a line is worth a second look, or null when it's plain text. A measurement or
// a fraction is a number-flip risk; a low-confidence word is an OCR-read risk.
function flagReason(line: string, lowSet: Set<string>): 'number' | 'shaky' | null {
  if (findMeasures(line).length > 0 || FRACTION.test(line)) return 'number'
  if (lowSet.size) {
    for (const w of line.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (w && lowSet.has(w)) return 'shaky'
    }
  }
  return null
}

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
    onConfirm({
      ...draft,
      title: title.trim() || null,
      ingredients: ingredients.map((s) => s.trim()).filter(Boolean),
      steps: steps.map((s) => s.trim()).filter(Boolean),
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
          <span className="read-review__flag" title={reason === 'number' ? t.recipes.reviewCheckNumber : t.recipes.reviewCheckWord}>
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
