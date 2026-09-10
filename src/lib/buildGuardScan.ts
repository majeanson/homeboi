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
  // LINE COMMENTS GO FIRST, and the order is load-bearing — it was the other way round
  // until 2026-09-09 and that made this helper destroy French files. The string walk
  // below treats any `'` as a string opener, including the apostrophe in « pour
  // l'instant » inside a `//` comment: from there the walk is desynchronised and eats
  // real code up to the next apostrophe. On `src/i18n.ts` that turned 171 488 chars into
  // 3 673 — 98 % of the file gone — so every guard scanning it was reading almost
  // nothing and passing for that reason. The breadcrumb rule in settingsNav.test.ts saw
  // ZERO « Réglages ▸ » crumbs where the file has seven.
  // Blanking whole-line comments first is safe (a `//` inside a string never starts a
  // line, and the rule was already "only when the WHOLE trimmed line is a comment"), and
  // it leaves the string-aware block-comment pass below exactly as it was.
  const s2 = s
    .split('\n')
    .map((l) => (l.trim().startsWith('//') ? '' : l))
    .join('\n')
  let stripped = ''
  let i = 0
  while (i < s2.length) {
    const c = s2[i]
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      let j = i + 1
      while (j < s2.length && s2[j] !== quote) j += s2[j] === '\\' ? 2 : 1
      stripped += s2.slice(i, Math.min(j + 1, s2.length))
      i = j + 1
      continue
    }
    if (c === '/' && s2[i + 1] === '*') {
      let j = i + 2
      while (j < s2.length && !(s2[j] === '*' && s2[j + 1] === '/')) j++
      stripped += s2.slice(i, j).replace(/[^\n]/g, '')
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

// ── Two SHAPE readers, because three guards walked the wrong shape ────────────
//
// A grep guard is only as honest as the shape it walks, and this repo keeps proving
// it the hard way — a scan that reads the wrong shape reports the wrong thing with
// total confidence, and its green is worth nothing:
//
//   · nested-interactive.test.ts once walked JSX by INDENTATION and reported green
//     over the exact defect it was written for (prettier breaks a multi-attribute
//     open tag after the tag name, so `<div` was the whole line and the walk ended
//     on the element's own first line). Re-counted by tag depth it went red — and
//     found a third case nobody had reported.
//   · tour-rule.test.ts's first draft scanned only literal `data-tour="…"` and
//     reported three orphans that were all passed as `tour="…"` to SubTabs. It
//     nearly "fixed" three anchors that were already there.
//   · docCounts' first list reader split an array on commas WITHOUT blanking the
//     comments, so every name sitting under a `//` line went uncounted: it read 29
//     where the truth was 39 (2026-09-10).
//
// So the two shapes that keep coming up live here, once, with `buildGuardScan.test.ts`
// pinning each against a fixture that carries the exact trap. Adding a third guard
// that needs either one: import it, don't re-walk it.

/**
 * Every OPEN TAG of `<Name …>` in `src`, brace-aware.
 *
 * The trap: a naive slice to the first `>` is wrong, because attribute values hold
 * arrow functions and whole JSX subtrees — `action={<button onClick={() => …}>…}`
 * carries several `>` that are not the tag's. Depth counts `{ [ (`, so the tag ends
 * at the first `>` seen at depth 0.
 *
 * The name must END where it is asked for: `<Chip` is not `<ChipGroup`, and a prefix
 * match counts a container as one of the things it contains. This file's own test
 * caught that in the first version, which is the entire argument for the file.
 */
export function openTags(src: string, name: string): string[] {
  const out: string[] = []
  let i = 0
  for (;;) {
    const at = src.indexOf('<' + name, i)
    if (at < 0) break
    const after = src[at + name.length + 1]
    // a real tag ends the name here: whitespace, a self-close, or the tag's own >
    if (after !== undefined && /[A-Za-z0-9_$.-]/.test(after)) {
      i = at + name.length + 1
      continue
    }
    let depth = 0
    let j = at + name.length + 1
    for (; j < src.length; j++) {
      const c = src[j]
      if (c === '{' || c === '[' || c === '(') depth++
      else if (c === '}' || c === ']' || c === ')') depth--
      else if (c === '>' && depth === 0) break
    }
    out.push(src.slice(at, j + 1))
    i = j + 1
  }
  return out
}

/**
 * The quoted string items of `const <name> = [ … ]`.
 *
 * The trap: comments. Split the array text on commas and any item written under a
 * `// …` line arrives glued to that comment, so it no longer starts with a quote and
 * silently vanishes from the count. Blank the comments first, then read the quotes.
 */
export function arrayStrings(src: string, name: string): string[] {
  const at = src.indexOf('const ' + name + ' = [')
  if (at < 0) throw new Error(`arrayStrings: no \`const ${name} = [\` in this source`)
  const open = src.indexOf('[', at)
  const body = blankComments(src.slice(open + 1, src.indexOf(']', open)))
  return [...body.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2])
}
