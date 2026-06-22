import { type Recipe } from './recipes'

// The plain-text body we hand the platform share sheet for a recipe: ingredients
// (• bullets; an inline "## " section marker becomes a blank-line break), then
// numbered steps (numbering skips section markers), then optional notes. Labels
// are passed in so this stays i18n-correct without importing the `t` object —
// shared by the recipe view's "Partager" action (the one home for sharing).
export function recipeShareText(
  recipe: Recipe,
  labels: { ingredients: string; steps: string; notes: string },
): string {
  let n = 0
  const ingredients = recipe.ingredients
    .map((s) => (s.startsWith('## ') ? '\n' + s.slice(3) : `• ${s}`))
    .join('\n')
  const steps = recipe.steps
    .map((s) => (s.startsWith('## ') ? '\n' + s.slice(3) : `${++n}. ${s}`))
    .join('\n')
  return [
    labels.ingredients + ':\n' + ingredients,
    labels.steps + ':\n' + steps,
    recipe.notes ? labels.notes + ':\n' + recipe.notes : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

// Fire the platform share sheet for a recipe; a no-op where Web Share is absent
// (callers gate the button on `navigator.share` so it never shows there).
export function shareRecipe(
  recipe: Recipe,
  labels: { ingredients: string; steps: string; notes: string },
): void {
  if (typeof navigator === 'undefined' || !navigator.share) return
  void navigator.share({ title: recipe.title, text: recipeShareText(recipe, labels) })
}
