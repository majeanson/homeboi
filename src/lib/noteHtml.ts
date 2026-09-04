// Markdown inline formatting (**bold** *italic* ~~strike~~) → sanitized HTML, shared
// by the rich note editor (lib/noteTiptap, which seeds a ProseMirror document from
// this note's stored Markdown). Escapes first so a note can never inject markup.

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function inlineMdToHtml(text: string): string {
  let s = escHtml(text ?? '')
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>') // bold before single-star italic
  s = s.replace(/~~([^~]+?)~~/g, '<s>$1</s>')
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
  s = s.replace(/_([^_\n]+?)_/g, '<em>$1</em>')
  return s
}
