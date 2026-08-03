import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useT } from '../../i18n'
import { caretIntoView } from '../../lib/viewportVars'
import { mdToTiptapHtml, tiptapDocToMd, type TiptapNode } from '../../lib/noteTiptap'
import { Icon, type IconName } from '../Icon'

// The BETA editing surface for « Le cercle » Notes — a real ProseMirror document
// (TipTap StarterKit + task lists) behind the NoteEditor's « BETA » toggle, for
// the list/checkbox editing the flat classic model fights (Enter mid-item, native
// selection handling, list merging). Storage stays the SAME Markdown: seed via
// mdToTiptapHtml, read back via tiptapDocToMd (lib/noteTiptap), so a note opens
// identically in either editor and the row list / search / read view never know
// which one wrote it.
//
// Lazy-loaded (React.lazy in NoteEditor) — TipTap is a real dependency and only
// beta devices pay for it; the default editor ships without it.
//
// It renders the SAME chrome slots as the classic editor (a .note-editor__toolbar
// row + the .note-editor__body scroller), so the keyboard-fit CSS (core.css
// « Keyboard fit »: --kb padding + the 120px trailing slack on the body) and the
// global caret-follow (viewportVars watches any contentEditable) apply unchanged.
export default function NoteEditorTiptap({
  initialMd,
  getMdRef,
  ariaLabel,
}: {
  initialMd: string
  /** NoteEditor's commit reads the body through this — set to a live serializer. */
  getMdRef: React.MutableRefObject<(() => string) | null>
  ariaLabel: string
}) {
  const t = useT()
  const fn = t.cercle.familyNotes

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // The note grammar stores two heading depths ('# ' / '## ').
        heading: { levels: [1, 2] },
        // No links/underline round-trip in the grammar — keep the surface to what
        // saves faithfully. (Text pasted with them keeps its characters.)
        link: false,
        underline: false,
      }),
      TaskList,
      TaskItem.configure({ nested: false }),
    ],
    content: mdToTiptapHtml(initialMd),
    editorProps: {
      attributes: { class: 'note-tiptap', 'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true' },
    },
    // v3 defaults this OFF; the toolbar's isActive() highlights need the re-render.
    shouldRerenderOnTransaction: true,
  })

  // NoteEditor's auto-save commit pulls the body through this ref (it owns the
  // POST/PATCH; we only own the surface). Cleared on unmount so a stale serializer
  // can't outlive its editor.
  useEffect(() => {
    if (!editor) return
    getMdRef.current = () => tiptapDocToMd(editor.getJSON() as TiptapNode)
    return () => {
      getMdRef.current = null
    }
  }, [editor, getMdRef])

  // The classic editor funnels every edit through afterInput → caretIntoView; here
  // ProseMirror owns the DOM, so follow the caret from its update event instead
  // (the global input/selectionchange follow still covers typing with the OSK up).
  useEffect(() => {
    if (!editor) return
    const follow = () => {
      const scroller = document.querySelector<HTMLElement>('.note-editor__body')
      if (scroller) caretIntoView(scroller)
    }
    editor.on('update', follow)
    return () => {
      editor.off('update', follow)
    }
  }, [editor])

  const FORMATS: { kind: string; label: string; glyph?: string; mod?: string; icon?: IconName; run: () => void; active: () => boolean }[] = editor
    ? [
        { kind: 'bold', glyph: 'B', mod: 'b', label: fn.fmtBold, run: () => editor.chain().focus().toggleBold().run(), active: () => editor.isActive('bold') },
        { kind: 'italic', glyph: 'I', mod: 'i', label: fn.fmtItalic, run: () => editor.chain().focus().toggleItalic().run(), active: () => editor.isActive('italic') },
        { kind: 'strike', glyph: 'S', mod: 's', label: fn.fmtStrike, run: () => editor.chain().focus().toggleStrike().run(), active: () => editor.isActive('strike') },
        { kind: 'heading', glyph: 'H', mod: 'h', label: fn.fmtHeading, run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor.isActive('heading') },
        { kind: 'bullet', glyph: '•', label: fn.fmtBullet, run: () => editor.chain().focus().toggleBulletList().run(), active: () => editor.isActive('bulletList') },
        { kind: 'numbered', glyph: '1.', label: fn.fmtNumbered, run: () => editor.chain().focus().toggleOrderedList().run(), active: () => editor.isActive('orderedList') },
        { kind: 'check', icon: 'check-square-bold', label: fn.fmtCheck, run: () => editor.chain().focus().toggleTaskList().run(), active: () => editor.isActive('taskList') },
        { kind: 'quote', glyph: '❝', label: fn.fmtQuote, run: () => editor.chain().focus().toggleBlockquote().run(), active: () => editor.isActive('blockquote') },
      ]
    : []

  return (
    <>
      <div className="note-editor__toolbar" role="group" aria-label={fn.format}>
        {FORMATS.map((f) => (
          <button
            key={f.kind}
            type="button"
            className={'note-editor__fmt' + (f.active() ? ' is-on' : '')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={f.run}
            aria-label={f.label}
            aria-pressed={f.active()}
            title={f.label}
          >
            {f.icon ? (
              <Icon name={f.icon} size={18} />
            ) : (
              <span className={'note-editor__glyph' + (f.mod ? ' note-editor__glyph--' + f.mod : '')} aria-hidden="true">
                {f.glyph}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="note-editor__stage">
        <EditorContent editor={editor} className="note-editor__body note-editor__body--tiptap" />
      </div>
    </>
  )
}
