// Markup that leaks out of an import into a recipe's words (review #13, 2026-11-17).
// A model's or OCR's transcript is Markdown and LaTeX: « # Tarte au gruau » sat first in
// the A–Z book behind its hash and was read aloud as « dièse », and a step read
// `\(180^{\circ}C\)`, which TTS and the screen reader both spelled out as symbol soup.
//
// Pure. Applied where words come IN (repairRecipeRead, the save) and where they go OUT
// (recipeListItem), so rows imported before this rule read clean without a rewrite.

// A title's leading Markdown heading marks: « # Tarte » / « ### Tarte » → « Tarte ».
// Only a title: inside the ingredient and step arrays, `## Titre` IS the app's own
// section-heading convention (recipeSections) and must survive.
export function cleanRecipeTitle(title: string): string {
  return title.replace(/^\s*#{1,6}\s+/, '').trim()
}

// The few LaTeX commands a recipe transcript actually carries, as the character a cook
// would have typed.
const COMMANDS: Record<string, string> = {
  circ: '°',
  degree: '°',
  times: '×',
  div: '÷',
  pm: '±',
  approx: '≈',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  '%': '%',
  ',': ' ',
  ';': ' ',
  ' ': ' ',
}

// One math body → plain text: \frac{1}{2} → 1/2, \text{g} → g, ^{\circ} / ^\circ → °,
// the known commands above, then the braces and stray carets go.
function plainMath(tex: string): string {
  return tex
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\(?:text|mathrm|mathit|textrm)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\^\s*\{?\s*\\circ\s*\}?/g, '°')
    .replace(/\\([a-zA-Z]+|[%,; ])/g, (m, name: string) => COMMANDS[name] ?? m)
    .replace(/[{}^]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// A line's LaTeX, made plain: every \( … \) and \[ … \] segment, plus a bare ^{\circ}
// outside one. Anything else (a `$` price, a lone backslash) is left alone.
export function cleanRecipeMath(line: string): string {
  if (!line.includes('\\') && !line.includes('^')) return line
  return line
    .replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, (_m, a: string | undefined, b: string | undefined) => plainMath(a ?? b ?? ''))
    .replace(/\^\s*\{\s*\\circ\s*\}|\^\s*\\circ\b/g, '°')
}
