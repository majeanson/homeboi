import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Merge the per-state fragments the matrix tests wrote (parallel workers can't
// append to one file without racing) into ONE manifest.json — the entry point
// for a review pass: read the manifest, open the failing/interesting PNGs.
export default function mergeManifest() {
  const dir = join(fileURLToPath(new URL('.', import.meta.url)), 'screenshots', 'matrix')
  if (!existsSync(dir)) return
  const frags = readdirSync(dir).filter((f) => f.startsWith('.frag-') && f.endsWith('.json'))
  const states = frags
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), total: states.length, failing: states.filter((s) => !s.pass).length, states }, null, 2),
  )
  for (const f of frags) rmSync(join(dir, f))
}
