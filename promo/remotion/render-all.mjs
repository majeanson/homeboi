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

// Reclaim memory BETWEEN comps. At 2× retina the per-frame footprint is ~4× and a
// lingering Chrome/compositor from the just-finished comp starves the next one — a
// single comp renders fine, but 8-in-a-row exhausted memory ("readFile"/resource
// errors mid-render). Kill any stray render child processes and pause so the OS
// reclaims the pages before the next render starts.
function reclaim() {
  if (process.platform === 'win32') {
    for (const im of ['chrome-headless-shell.exe', 'remotion.exe']) {
      spawnSync('taskkill', ['/F', '/T', '/IM', im], { stdio: 'ignore', shell: true })
    }
  } else {
    spawnSync('pkill', ['-f', 'chrome-headless-shell'], { stdio: 'ignore' })
  }
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 3000)'], { stdio: 'ignore' }) // settle
}

let failures = 0
const comps = []
for (const { id, cuts } of scripts)
  for (const orientation of ORIENTATIONS)
    for (const lang of LANGS) for (const cut of cuts) comps.push(`${id}-${orientation}-${lang}-${cut}`)

const renderOne = (comp, out) =>
  spawnSync('npx', ['remotion', 'render', comp, out, `--concurrency=${CONCURRENCY}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

comps.forEach((comp, i) => {
  const out = `out/${comp}.mp4`
  console.log(`\n▶ rendering ${comp} → ${out} (concurrency=${CONCURRENCY})`)
  let res = renderOne(comp, out)
  // The Rust compositor can crash mid-render under transient memory pressure (an
  // identical comp succeeds on a fresh start). Reclaim + retry once before giving up.
  if (res.status !== 0) {
    console.error(`… ${comp} failed (exit ${res.status}) — reclaiming + retrying once`)
    reclaim()
    res = renderOne(comp, out)
  }
  if (res.status !== 0) {
    failures++
    console.error(`✗ ${comp} failed after retry (exit ${res.status})`)
  }
  if (i < comps.length - 1) reclaim() // free memory before the next comp
})

console.log(failures ? `\nDone with ${failures} failure(s).` : '\n✓ All renders complete → out/')
process.exit(failures ? 1 : 0)
