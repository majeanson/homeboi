// Wrap a journey file's MAIN body (between the header and the first « folded from ») in its own
// describe, so the main spec's file-level hooks (beforeEach, test.use) stop reaching the folded
// blocks. Idempotent: a file whose main body is already wrapped is left alone.
import fs from 'fs'
for (const f of process.argv.slice(2)) {
  const s = fs.readFileSync(f, 'utf8')
  const fold = s.indexOf('\n// ── folded from ')
  if (fold < 0) continue
  const hdr = /^\/\/ JOURNEY — .*\(review #43; was ([^.]+)\.spec\.ts/m.exec(s)
  if (!hdr) throw new Error(`${f}: no journey header`)
  const mainName = hdr[1]
  // The main body starts after the header's comment block that follows the imports.
  const lines = s.slice(0, fold).split('\n')
  let i = lines.findIndex((l) => l.startsWith('// JOURNEY — '))
  while (i < lines.length && /^\/\/|^\s*$/.test(lines[i])) i++
  // …but keep the main spec's own leading comment above the wrapper too.
  const head = lines.slice(0, i).join('\n')
  const main = lines.slice(i).join('\n').trimEnd()
  if (/^test\d*\.describe\(/.test(main.trimStart()) && main.trimEnd().endsWith('})') && main.includes(`'${mainName}'`)) continue
  const wrapped = `test.describe('${mainName}', () => {\n${main.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n')}\n})\n`
  fs.writeFileSync(f, `${head}\n${wrapped}${s.slice(fold)}`)
  console.log('wrapped', f)
}
