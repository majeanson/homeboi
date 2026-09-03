import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Shared plumbing for this repo's fail-closed, build-gating GREP TESTS — the ones
// CLAUDE.md calls "the best thing in this codebase": write-rule.test.ts,
// parallel-array-rule.test.ts, and (in spirit, not this file — see below)
// nested-interactive.test.ts. Each scans src/ for a pattern a prose rule alone
// couldn't hold in place.
//
// Extracted 2026-09-03: a third guard (parallel-array-rule.test.ts) had just
// reimplemented write-rule.test.ts's tree-walk and comment-blanking byte-for-byte —
// the exact "prose rule drifts" failure these guards exist to prevent, reproduced
// in their own shared plumbing. Converging is safe here because the two
// implementations were IDENTICAL; nested-interactive.test.ts's version genuinely
// differs (it scans only .tsx, and its comment-strip also blanks jsdoc `*`
// continuation lines for JSX-adjacent prose), so it is deliberately left as its own
// — retrofitting a shared helper onto an already-trusted guard for cosmetic reuse,
// with no bug behind it, is not a trade worth the risk of changing what it catches.

// Every non-test .ts/.tsx file under `dir`, recursively.
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sourceFiles(p)
    if (/\.test\.tsx?$/.test(name)) return []
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

// Blank out /* … */ block comments — STRING-AWARE, so `"image/*"` or a URL
// fragment inside a quoted literal can't be mistaken for a comment opener. A naive
// `/\/\*[\s\S]*?\*\//` regex genuinely did this once (IntakeForm.tsx's file-input
// `accept="image/*"` swallowed everything up to the next JSX `{/* … */}`, hiding a
// real api() write in between — caught by write-rule's own "every exception still
// exists" self-check, the standing rule that a guard must prove itself against real
// code, not just a passing test). Block comment bodies are replaced with newlines
// only, so line COUNT survives and a reported line number still matches the file.
// Line comments are then blanked only when the WHOLE trimmed line is one (a
// trailing `// note` after real code is left alone) — unchanged from before.
export function blankComments(s: string): string {
  let stripped = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      let j = i + 1
      while (j < s.length && s[j] !== quote) j += s[j] === '\\' ? 2 : 1
      stripped += s.slice(i, Math.min(j + 1, s.length))
      i = j + 1
      continue
    }
    if (c === '/' && s[i + 1] === '*') {
      let j = i + 2
      while (j < s.length && !(s[j] === '*' && s[j + 1] === '/')) j++
      stripped += s.slice(i, j).replace(/[^\n]/g, '')
      i = j + 2
      continue
    }
    stripped += c
    i++
  }
  return stripped
    .split('\n')
    .map((l) => (l.trim().startsWith('//') ? '' : l))
    .join('\n')
}

// Read one file's text with comments already blanked — the shape every call site
// wants (`sources().map(readScanned)` or per-file inside a loop).
export function readScanned(file: string): string {
  return blankComments(readFileSync(file, 'utf8'))
}
