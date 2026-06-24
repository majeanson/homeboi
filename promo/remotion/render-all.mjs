// Render every captured script × orientation × language × cut to promo/remotion/out/.
// Discovers script ids from public/captures/* and reads each manifest's `cuts` so it
// only renders the cuts a script declares.
//
//   node render-all.mjs            # render everything
//   node render-all.mjs tour       # render only ids matching "tour"
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'

const ORIENTATIONS = ['landscape', 'vertical']
const LANGS = ['fr', 'en']
const filter = process.argv[2] // optional substring filter on script id

// Memory safety. Remotion defaults concurrency to ~half the logical cores; on a
// many-core but RAM-light box each parallel worker decodes the OffthreadVideo clips
// into multi-MB RGB buffers and the Rust compositor OOMs ("memory allocation of N
// bytes failed", code 3221226505) / Chrome rejects fetches (ERR_INSUFFICIENT_RESOURCES).
// Default to fully serial; override up via env on a beefier machine, e.g.
// PROMO_CONCURRENCY=4. (The OffthreadVideo cache cap lives in remotion.config.ts —
// the CLI flag is kebab-case and silently ignored if passed camelCase.)
const CONCURRENCY = process.env.PROMO_CONCURRENCY || '1'

const capturesDir = 'public/captures'
if (!existsSync(capturesDir)) {
  console.error(`No captures found at ${capturesDir}. Run "npm run promo:capture" at the repo root first.`)
  process.exit(1)
}

const scripts = readdirSync(capturesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`${capturesDir}/${d.name}/manifest.json`))
  .map((d) => d.name)
  .filter((id) => (filter ? id.includes(filter) : true))
  .map((id) => {
    let cuts = ['full']
    try {
      const m = JSON.parse(readFileSync(`${capturesDir}/${id}/manifest.json`, 'utf8'))
      if (Array.isArray(m.cuts) && m.cuts.length) cuts = m.cuts
    } catch {
      /* default cuts */
    }
    return { id, cuts }
  })

if (scripts.length === 0) {
  console.error('No captured scripts to render (after filter).')
  process.exit(1)
}

mkdirSync('out', { recursive: true })

let failures = 0
for (const { id, cuts } of scripts) {
  for (const orientation of ORIENTATIONS) {
    for (const lang of LANGS) {
      for (const cut of cuts) {
        const comp = `${id}-${orientation}-${lang}-${cut}`
        const out = `out/${comp}.mp4`
        console.log(`\n▶ rendering ${comp} → ${out} (concurrency=${CONCURRENCY})`)
        const res = spawnSync('npx', ['remotion', 'render', comp, out, `--concurrency=${CONCURRENCY}`], {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        })
        if (res.status !== 0) {
          failures++
          console.error(`✗ ${comp} failed (exit ${res.status})`)
        }
      }
    }
  }
}

console.log(failures ? `\nDone with ${failures} failure(s).` : '\n✓ All renders complete → out/')
process.exit(failures ? 1 : 0)
