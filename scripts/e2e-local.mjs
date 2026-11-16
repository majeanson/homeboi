#!/usr/bin/env node
// THE WHOLE E2E SUITE, IN CI'S SHAPE, ON A MACHINE THAT CANNOT HOLD IT IN ONE GO.
//
//   npm run e2e:local                     # 8 shards, one after the other
//   npm run e2e:local -- --shards 12      # smaller pieces on a tighter day
//   npm run e2e:local -- --from 5         # resume: skip shards 1–4
//   npm run e2e:local -- --grep cercle    # anything else goes to Playwright as-is
//
// `npm run e2e:ci` in one process died twice on 2026-09-22 (a V8 heap OOM, then Vite
// refusing connections mid-run): one dev server transforms and keeps every module of
// every route for 200 spec files, and the runner keeps every result. CI never meets it
// because it splits the suite into four machines. This does the same thing in time
// instead of space: each shard is a fresh `playwright test --shard=i/N` with its OWN
// Vite (Playwright's webServer starts it and tears it down with the shard), so the memory
// a shard grew is handed back before the next one starts.
//
// Each shard is exactly CI's strictness — `--workers=1 --retries=0 --forbid-only` — and
// every shard runs even after a red one: the point is the whole list, as in CI
// (`fail-fast: false`). Each gets its own port (a free one, asked of the OS) so it can
// neither reuse nor collide with a Vite another session already holds on 5173
// (`reuseExistingServer` would test THAT server, silently), and its own report and
// trace folder (e2e/report/shard-i, e2e/test-results/shard-i), so a later shard does not
// erase the evidence of an earlier failure. Nothing here kills a process it did not start.
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'

const argv = process.argv.slice(2)
const take = (flag, fallback) => {
  const at = argv.indexOf(flag)
  if (at === -1) return fallback
  const [, value] = argv.splice(at, 2)
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} wants a positive integer, got ${value}`)
  return n
}
const shards = take('--shards', 8)
const from = take('--from', 1)
const passThrough = argv

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })

const results = []
const started = Date.now()
for (let i = from; i <= shards; i++) {
  const port = await freePort()
  const t0 = Date.now()
  console.log(`\n━━ shard ${i}/${shards} · port ${port} ━━`)
  const run = spawnSync(process.execPath, [cli, 'test', '--workers=1', '--retries=0', '--forbid-only', `--shard=${i}/${shards}`, ...passThrough], {
    stdio: 'inherit',
    env: { ...process.env, PW_PORT: String(port), PW_REPORT_DIR: `e2e/report/shard-${i}`, PW_OUTPUT_DIR: `e2e/test-results/shard-${i}` },
  })
  const minutes = ((Date.now() - t0) / 60_000).toFixed(1)
  results.push({ i, code: run.status ?? 1, minutes })
  // Ctrl-C reaches the child too; do not start the next shard behind the person's back.
  if (run.signal === 'SIGINT' || run.status === 130) break
}

console.log(`\n━━ e2e:local · ${((Date.now() - started) / 60_000).toFixed(1)} min ━━`)
for (const r of results) console.log(`  shard ${r.i}/${shards}  ${r.code === 0 ? 'ok ' : 'RED'}  ${r.minutes} min${r.code === 0 ? '' : `  → npx playwright show-report e2e/report/shard-${r.i}`}`)
const red = results.filter((r) => r.code !== 0)
if (results.length < shards - from + 1) console.log(`  stopped early — resume with: npm run e2e:local -- --shards ${shards} --from ${results.at(-1).i}`)
process.exit(red.length || results.length < shards - from + 1 ? 1 : 0)
