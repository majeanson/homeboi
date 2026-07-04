import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { ShareModal } from './ShareModal'
import { createShare } from '../lib/share'
import { SHARES_KEY } from '../lib/queryKeys'
import type { Recipe } from '../lib/recipes'

// « Partager cette recette » — the recipe-specific wrapper over the generic ShareModal.
// Mints a /partage/<id> link the moment it opens (autoCreate: the tap already said "share
// this one"), then shows the copyable link + QR. The public page (src/pages/PartagePage)
// renders the recipe for anyone; a signed-in Babillard visitor can add it to their book.
export function RecipeShareModal({ recipe, open, onClose }: { recipe: Recipe; open: boolean; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  return (
    <ShareModal
      open={open}
      onClose={onClose}
      title={`${t.shareLink.action} · ${recipe.title}`}
      intro={t.shareLink.recipeIntro}
      linkHint={t.shareLink.linkHint}
      autoCreate
      onCreate={async () => {
        const res = await createShare({ kind: 'recipe', recipeId: recipe.id })
        void qc.invalidateQueries({ queryKey: SHARES_KEY })
        return { url: res.url }
      }}
    />
  )
}
