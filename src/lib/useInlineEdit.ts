import { useState } from 'react'

// The tiny state machine behind every "tap a row → rename it in place" spot: which
// row is open (`editId`) and its draft text. Half a dozen list components hand-rolled
// the same `useState<string|null>(null)` + `useState('')` pair plus open/cancel; this
// bundles them. Pairs with <EditField> (the box) — the row renders the field when
// `editId === row.id`, a display button otherwise, and `open(id, currentText)` flips it.
//
// State only, on purpose: the COMMIT (optimistic write, undo, no-op guard) differs per
// entity, so the caller wires <EditField onSubmit> to its own rename + cancel().
export function useInlineEdit() {
  const [editId, setEditId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const open = (id: string, current: string) => {
    setEditId(id)
    setText(current)
  }
  const cancel = () => setEditId(null)
  return { editId, text, setText, open, cancel }
}
