import { useT } from '../i18n'
import { EntityShareModal } from './EntityShareModal'
import type { Recipe } from '../lib/recipes'

// « Partager cette recette » — the recipe wrapper over the generic EntityShareModal.
// The public page (src/pages/PartagePage) renders the recipe for anyone; a signed-in
// Babillard visitor can add it to their book.
export function RecipeShareModal({ recipe, open, onClose }: { recipe: Recipe; open: boolean; onClose: () => void }) {
  const t = useT()
  return (
    <EntityShareModal
      open={open}
      onClose={onClose}
      title={`${t.shareLink.action} · ${recipe.title}`}
      intro={t.shareLink.recipeIntro}
      body={{ kind: 'recipe', recipeId: recipe.id }}
    />
  )
}
