// Transcode the Playwright .webm recordings to constant-frame-rate H.264 .mp4 — the
// raw VP8/VP9 webm trips Remotion's compositor ("Output changed"), while mp4 decodes
// cleanly. Also rewrites each manifest.json so clip/pip filenames point at the .mp4.
// Run after `npm run promo:capture`, before rendering. Uses Remotion's bundled ffmpeg.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = 'public/captures'
if (!existsSync(root)) {
  console.error(`No captures at ${root}. Run "npm run promo:capture" first.`)
  process.exit(1)
}

const ff = (args) => spawnSync('npx', ['remotion', 'ffmpeg', ...args], { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' })

let count = 0
for (const id of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const dir = join(root, id)
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.webm'))) {
    const inP = join(dir, f)
    const outP = join(dir, f.replace(/\.webm$/, '.mp4'))
    const res = ff(['-y', '-i', inP, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-an', '-movflags', '+faststart', outP])
    if (res.status === 0) {
      rmSync(inP)
      count++
    } else {
      console.error(`✗ transcode failed: ${inP}`)
    }
  }
  // Rewrite manifest filenames .webm → .mp4
  const mPath = join(dir, 'manifest.json')
  if (existsSync(mPath)) {
    const txt = readFileSync(mPath, 'utf8').replace(/\.webm"/g, '.mp4"')
    writeFileSync(mPath, txt)
  }
}
console.log(`✓ transcoded ${count} clip(s) → mp4`)
