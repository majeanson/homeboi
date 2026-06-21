import { useState } from 'react'
import { imgUrl } from './image'
import type { DrawEditMode } from '../components/DrawEditChoice'

// Anything re-openable in DrawPad: it only needs the two R2 keys.
export interface DrawEditable {
  media_key?: string | null
  scene_key?: string | null
}

// Shared orchestration for "tap an existing drawing → choose how to continue → open
// the pad" (#14), so no surface (board notes, gallery, cercle notes, …) re-implements
// the modify/copy/calquer mapping. Holds the chooser + edit state + resolved mode and
// derives the DrawPad load props:
//   • modify → edit the real drawing IN PLACE (rebuild its editable scene)
//   • copy   → an identical, fully-editable copy, saved as a NEW entry (isNew)
//   • trace  → the original as a faded « filigrane », saved as a NEW entry (isNew)
// The SAVE TARGET differs per surface (note PATCH vs gallery POST/PATCH vs family-note),
// so the hook only reports `isNew`; the caller maps that to in-place vs a new row.
export function useDrawEdit<T extends DrawEditable>() {
  const [choosing, setChoosing] = useState<T | null>(null)
  const [editing, setEditing] = useState<T | null>(null)
  const [mode, setMode] = useState<DrawEditMode>('modify')

  return {
    /** Tap a drawing → show the choice dialog. */
    begin: (item: T) => setChoosing(item),
    /** Props for <DrawEditChoice>. */
    chooserOpen: !!choosing,
    cancelChoice: () => setChoosing(null),
    pick: (m: DrawEditMode) => {
      setMode(m)
      setEditing(choosing)
      setChoosing(null)
    },
    /** The drawing currently open in the pad (null = pad closed). */
    editing,
    /** copy/trace save a NEW entry; modify edits in place. */
    isNew: mode !== 'modify',
    /** Close the pad. */
    close: () => setEditing(null),
    /** Spread onto <DrawPad> (null when nothing is open). */
    padProps: editing
      ? {
          initial: editing.media_key ? imgUrl(editing.media_key) : undefined,
          // Trace loads the original as a faded guide, not editable layers.
          initialSceneUrl: mode === 'trace' || !editing.scene_key ? undefined : imgUrl(editing.scene_key),
          filigrane: mode === 'trace',
        }
      : null,
  }
}
