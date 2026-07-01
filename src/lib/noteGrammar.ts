// THE shared block-line grammar for « Le cercle » Notes' lightweight Markdown — the
// per-line regexes used by BOTH the read renderer (noteMarkdown.renderNoteBody) and the
// editor bridge (noteHtml.lineToHtml). Kept in one module so a marker tweak can't silently
// break round-trip fidelity between the two (a regex changed in one but not the other would
// drift). All non-global, used with `.exec`/`.test` → sharing the objects is stateless-safe.
//
// (The inline markers — **bold** *italic* _italic_ ~~strike~~ — are NOT shared here: the
// editor bridge applies them with a global `.replace` while the renderer walks them with a
// non-global `.exec`, so they legitimately differ by flag.)
export const HEAD_RE = /^(#{1,6})\s+(.*)$/
export const CHECK_RE = /^[-*]\s+\[([ xX])\]\s+(.*)$/
export const BULLET_RE = /^[-*]\s+(.*)$/
export const NUMBER_RE = /^\d+\.\s+(.*)$/
export const QUOTE_RE = /^>\s?(.*)$/
