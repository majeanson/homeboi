// COMPONENTS.md is GENERATED (review #42, 2026-11-18): the inventory is the /dev/kit gallery
// (src/pages/DevKit.tsx), and each row's purpose is the first sentence of the component's own
// doc comment, so the description lives beside the code it describes and cannot drift from a
// second copy. What stays hand-written is the header above the marker line in COMPONENTS.md
// (the axes, the CSS design system, how to extend the gallery).
//
//   npm run components          rewrite COMPONENTS.md
//   src/lib/componentsDoc.test.ts fails the build when the file is not what this prints.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MARKER = '<!-- GENERATED BELOW by scripts/gen-components.mjs (npm run components) — edit the code, not this file -->'

// The gallery's categories, in the order the doc shows them.
const CATEGORY_ORDER = ['Fondations', 'Saisie', 'Rangées & actions', 'Affichage', 'Sections & pages', 'Overlays & chrome', 'Feedback', 'Cercle', 'Voyage', 'Toddler']

/** The gallery entries: { cat, name, files[] }, in source order. */
export function galleryEntries(devkit) {
  return [...devkit.matchAll(/\n\s+cat: '([^']+)',\n\s+name: '([^']+)',\n\s+file: '([^']+)',/g)].map((m) => ({
    cat: m[1],
    name: m[2],
    files: m[3].split(',').map((s) => s.trim()).filter(Boolean),
  }))
}

// The comment block that ends right above `line` (an index into `lines`), as plain text.
function commentAbove(lines, line) {
  const out = []
  let i = line - 1
  while (i >= 0 && /^\s*(\/\/|\*|\/\*\*?|\*\/)/.test(lines[i])) out.unshift(lines[i--])
  return out
    // A lint directive is not documentation (the review #41 disables sit above some exports).
    .filter((l) => !/(oxlint|eslint)-(disable|enable)/.test(l))
    .map((l) => l.replace(/^\s*(\/\*\*?|\*\/|\*|\/\/)\s?/, '').replace(/\*\/\s*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The first sentence, at most ~220 characters, with table-breaking pipes escaped.
function firstSentence(text) {
  if (!text) return ''
  // The first [.!?] + space that is not inside « … » (« quels ingrédients ? » is not an end).
  let s = text
  for (const m of text.matchAll(/[.!?](\s|$)/g)) {
    const head = text.slice(0, m.index + 1)
    if (head.length < 20 || (head.match(/«/g) ?? []).length > (head.match(/»/g) ?? []).length) continue
    s = head
    break
  }
  s = s.trim()
  if (s.length > 220) s = s.slice(0, 217).replace(/\s+\S*$/, '') + '…'
  return s.replace(/\|/g, '\\|')
}

/** What a component's own doc comment says it is: above its export, else the file's head. */
export function purposeOf(src, names) {
  const lines = src.split(/\r?\n/)
  for (const name of names) {
    const at = lines.findIndex((l) => new RegExp(`^export (default )?(function|const|class) ${name}\\b`).test(l))
    if (at >= 0) {
      const above = commentAbove(lines, at)
      if (above) return firstSentence(above)
    }
  }
  // Else the first top-level comment block in the file (the file's own header), wherever the
  // imports put it. A block that is only a lint directive is skipped.
  const isComment = (l) => /^(\/\/|\/\*|\s\*)/.test(l)
  for (let i = 0; i < lines.length; i++) {
    if (!isComment(lines[i])) continue
    let j = i
    while (j < lines.length && isComment(lines[j])) j++
    const text = commentAbove(lines, j)
    if (text) return firstSentence(text)
    i = j
  }
  return ''
}

/** Every exported top-level component in src/components (PascalCase function). */
function exportedComponents(root) {
  const dir = join(root, 'src/components')
  const out = []
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name), `${rel}${e.name}/`)
      else if (e.name.endsWith('.tsx') && !e.name.includes('.test.'))
        for (const m of readFileSync(join(d, e.name), 'utf8').matchAll(/^export (?:default )?function ([A-Z][A-Za-z0-9_]*)/gm)) out.push({ name: m[1], file: `components/${rel}${e.name}` })
    }
  }
  walk(dir, '')
  return out
}

export function renderComponents(root) {
  const header = readFileSync(join(root, 'COMPONENTS.md'), 'utf8').split(MARKER)[0].trimEnd()
  const entries = galleryEntries(readFileSync(join(root, 'src/pages/DevKit.tsx'), 'utf8'))
  const cats = [...new Set(entries.map((e) => e.cat))].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  const out = [header, '', MARKER, '', '## The gallery, by category', '']
  out.push(`${entries.length} entries in \`/dev/kit\`. Each purpose is the first sentence of the component's own doc comment; open the specimen to see it across theme, surface, lens and locale.`, '')
  for (const cat of cats) {
    out.push(`### ${cat}`, '', '| Component | File | Purpose |', '| --- | --- | --- |')
    for (const e of entries.filter((x) => x.cat === cat)) {
      const names = e.name.split('·').map((t) => t.trim()).filter((t) => /^[A-Z][A-Za-z0-9]*$/.test(t))
      let purpose = ''
      for (const f of e.files) {
        try {
          purpose = purposeOf(readFileSync(join(root, 'src', f), 'utf8'), names)
        } catch {
          purpose = ''
        }
        if (purpose) break
      }
      out.push(`| **${e.name.replace(/\|/g, '\\|')}** | ${e.files.map((f) => `\`${f}\``).join(', ')} | ${purpose || '—'} |`)
    }
    out.push('')
  }
  const inGallery = new Set(entries.flatMap((e) => e.files))
  const outside = exportedComponents(root).filter((c) => !inGallery.has(c.file))
  out.push('## Not in the gallery', '')
  out.push('Exported components with no specimen: routes, page orchestrators that need live household data, and parts that only make sense inside their parent. Listed so a search finds them before anyone rebuilds one.', '')
  const byFile = new Map()
  for (const c of outside) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c.name])
  for (const [file, names] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) out.push(`- \`${file}\`: ${names.join(', ')}`)
  out.push('')
  return out.join('\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(fileURLToPath(import.meta.url), '..', '..')
  writeFileSync(join(root, 'COMPONENTS.md'), renderComponents(root))
}
