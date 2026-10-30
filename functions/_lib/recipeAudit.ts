import { STEP_MARKED, normLoose } from './recipeImport'
import { ingredientsFromMethod } from './recipeRepair'

// THE AUDIT BEFORE THE FORM (E, 2026-10-27). A read that looks complete is not always:
// a page numbered « Étape 1 … Étape 9 » whose draft holds six steps, a method that pours
// « 125 ml de crème » nobody listed, a title that is the site's date line. Each of those
// used to land straight in the form, unannounced. `auditDraft` names them — pure, no
// model — and the client opens the verify panel (RecipeReadReview) whenever it finds one,
// with the reason beside the line. A clean read lands directly, as before.
//
// Conservative ON PURPOSE: a flag that cries wolf on a good read teaches the cook to
// ignore the panel. `recipeCorpus.test` holds every corpus page — hand-verified correct —
// at ZERO flags, so a rule that fires on a real good page fails the build.

export type AuditKind = 'step-count' | 'step-gap' | 'missing-ingredient' | 'title-junk' | 'dup-step' | 'empty-section' | 'no-quantity'

export interface AuditFlag {
  kind: AuditKind
  // The line (or the phrase) the flag is about, when there is one — the panel marks it.
  line?: string
}

interface Auditable {
  title: string | null
  ingredients: string[]
  steps: string[]
}

const isHeading = (l: string) => l.startsWith('## ')
const real = (ls: string[]) => ls.filter((l) => !isHeading(l))

// « Étape 7 » / « Step 7 » at the head of a line in the SOURCE, or a cookbook's bare
// step number (« 7. Déposer… », « 7 Déposer… » with a sentence behind it — STEP_MARKED):
// the numbers the page printed, in reading order.
function printedStepNumbers(source: string): number[] {
  const out: number[] = []
  for (const line of source.split(/\r?\n/)) {
    const m = line.match(/^[ \t]*(?:[ée]tape|step)\s*(\d{1,2})\b/i) ?? (STEP_MARKED.test(line.trim()) ? line.trim().match(/^(\d{1,2})/) : null)
    if (m) out.push(+m[1])
  }
  return out
}
// The highest number printed is how many steps the page has.
const printedStepCount = (source: string): number => Math.max(0, ...printedStepNumbers(source))
// A page that numbers « 1, 2, 3, 5 » lost its 4 somewhere between the photo and the
// text — the reader dropped a step at a column break (the coquilles' step 5, photo
// corpus 2026-10-30). The first number missing from 1..max, when the run starts at 1.
function printedStepGap(source: string): number | null {
  const nums = new Set(printedStepNumbers(source))
  const max = Math.max(0, ...nums)
  if (!nums.has(1) || max < 3) return null
  for (let n = 2; n < max; n++) if (!nums.has(n)) return n
  return null
}

// Words that say nothing about WHICH ingredient: units, sizes, connectors.
const FILLER = new Set(
  'autre autres minute minutes heure heures seconde secondes litre litres pouce pouces degre degres fois portion portions hour hours second seconds inch inches times serving servings tasse tasses cuillere cuilleres soupe the cafe table pincee gousse gousses boite boites paquet sachet tranche tranches gros grosse petit petite moyen moyenne environ plus avec pour dans sans cup cups tbsp tsp tablespoon tablespoons teaspoon teaspoons large small medium about with into from'.split(
    ' ',
  ),
)
const contentWords = (s: string) =>
  normLoose(s)
    .split(' ')
    .filter((w) => w.length >= 4 && !/^\d/.test(w) && !FILLER.has(w))

const MEASURED =
  /^\S+(?:\s+\d+\/\d+)?\s*(?:\([^)]*\)\s*)?(?:ml|cl|l|g|kg|oz|lb|lbs|tasses?|cups?|tbsp|tsp|tablespoons?|teaspoons?|c\.\s*à\s*(?:soupe|thé|café|s|c)\.?)\s*(?:\([^)]*\)\s*)?(?:de\s+|d['’]\s*|of\s+)(?!(?:la|le|les|l['’]|the|a|an)\b)\p{L}/iu
const TITLE_JUNK =
  /^(?:recettes?|recipes?|accueil|home|menu|ingr[ée]dients?|pr[ée]paration|\d{1,2}(?:er)?\s+[a-zéû]{3,10}\.?\s+\d{4}|[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})$/i

export function auditDraft(d: Auditable, sourceText: string | null): AuditFlag[] {
  const flags: AuditFlag[] = []
  const steps = real(d.steps)
  const ings = real(d.ingredients)

  // The page numbered more steps than the draft holds — or skipped a number.
  if (sourceText) {
    const printed = printedStepCount(sourceText)
    if (printed >= 2 && steps.length < printed) flags.push({ kind: 'step-count', line: `${steps.length}/${printed}` })
    const gap = printedStepGap(sourceText)
    if (gap != null) flags.push({ kind: 'step-gap', line: String(gap) })
  }

  // A measured phrase in the method that no ingredient line shares a word with.
  // The dish itself (« une tranche de gâteau » in a cake's method) is named by its title.
  if (ings.length) {
    const have = [...ings, d.title ?? ''].flatMap(contentWords)
    const listed = (w: string) => have.some((h) => h.startsWith(w.slice(0, 4)) || w.startsWith(h.slice(0, 4)))
    for (const lifted of ingredientsFromMethod(steps)) {
      // A phrase never runs past its sentence (« 1 c. à thé. Bien mélanger »).
      const phrase = lifted.split(/\.\s+(?=[A-ZÀ-ÖŒ])/)[0]
      // Only a MEASURE of something: an amount, a kitchen unit, then « de / d' / of » and
      // a word that is not an article (« 5 tablespoons of the hot liquid » is a gesture,
      // « 400 degrees F », « 65g each », « une feuille de papier » are not ingredients).
      if (!MEASURED.test(phrase)) continue
      const words = contentWords(phrase)
      if (words.length && !words.some(listed)) {
        flags.push({ kind: 'missing-ingredient', line: phrase })
        break // one is enough to send the read to the panel
      }
    }
  }

  // A title that is a label, a date or the site's chrome.
  const title = (d.title ?? '').trim()
  if (title && (TITLE_JUNK.test(title) || title.includes(' | '))) flags.push({ kind: 'title-junk', line: title })

  // The same step twice.
  const seen = new Set<string>()
  for (const s of steps) {
    const k = normLoose(s)
    if (k && seen.has(k)) {
      flags.push({ kind: 'dup-step', line: s })
      break
    }
    seen.add(k)
  }

  // A part heading with nothing under it.
  for (const list of [d.ingredients, d.steps]) {
    const at = list.findIndex((l, i) => isHeading(l) && (i === list.length - 1 || isHeading(list[i + 1])))
    if (at >= 0) {
      flags.push({ kind: 'empty-section', line: list[at] })
      break
    }
  }

  // Most ingredient lines carry no amount — the amounts were lost (a site's cells, a
  // names-only structured list).
  if (ings.length >= 3) {
    const bare = ings.filter((l) => !/[\d¼½¾⅓⅔⅛]|\b(?:une?|deux|trois|quatre|a|an|one|two|three)\b/i.test(l)).length
    if (bare * 10 >= ings.length * 6) flags.push({ kind: 'no-quantity' })
  }
  return flags
}

// A draft with its audit attached (the 'audit' field of every import response): an empty draft
// has nothing to audit. A flagged read goes to the verify panel, which shows its SOURCE
// beside the lines — so a flagged draft carries that source ('transcript') when it has none.
export function withAudit<D extends Auditable & { empty?: boolean; transcript?: string }>(
  d: D,
  sourceText: string | null,
): D & { audit: AuditFlag[]; transcript?: string } {
  const audit = d.empty ? [] : auditDraft(d, sourceText)
  return { ...d, audit, ...(audit.length && !d.transcript && sourceText ? { transcript: sourceText.slice(0, 16_000) } : {}) }
}
