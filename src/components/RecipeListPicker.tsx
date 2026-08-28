import { Modal } from './Modal'
import { useT } from '../i18n'
import { useWrite } from '../lib/write'
import { useUndoToast } from '../lib/toast'
import { BOARD_KEY } from '../lib/queryKeys'
import { RecipeIngredientPick } from './RecipeIngredientPick'
import type { Recipe } from '../lib/recipes'

// The MODAL door onto the « quels ingrédients ? » checklist, for a surface that only
// has the recipe (the Kitchen recipe-peek). The checklist body itself is shared with
// `RecipeSheet`'s inline copy — see `RecipeIngredientPick`, which also explains why
// the commit stays here rather than moving down into it.
//
// This host CLOSES before it commits, so the undo toast (z-index 40) lands on the
// page with nothing painted over it: the POST is DEFERRED behind « Annuler » (mirrors
// ReserveSection.addToList). Nothing lands until the window passes, so undo is
// conflict-free — there is no inverse write to run.
export function RecipeListPicker({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const t = useT()
  const write = useWrite()
  const undo = useUndoToast()

  function commit(items: string[]) {
    onClose() // close FIRST — an undo offered under an open modal is unreachable
    undo({
      message: t.undo.addedToList(recipe.title),
      onUndo: () => {},
      onCommit: () =>
        void write('recipe-to-list', { method: 'POST', body: { items }, affectedKeys: [BOARD_KEY] }).catch(() => {}),
    })
  }

  return (
    <Modal open onClose={onClose} title={recipe.title}>
      <RecipeIngredientPick lines={recipe.ingredients ?? []} onCancel={onClose} onConfirm={commit} />
    </Modal>
  )
}
