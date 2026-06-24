import { test, type Browser, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { type Lang } from '../../e2e/mocks'
import { SCRIPTS } from '../scripts'
import type { Beat, SurfaceName } from '../scripts/types'
import { installCursor } from './cursor'
import { makeDriver } from './driver'
import { preparePage } from './setup'

const VIEWPORT: Record<SurfaceName, { width: number; height: number }> = {
  wall: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
}
const LANGS: Lang[] = ['fr', 'en']
const OUT_ROOT = path.join(process.cwd(), 'promo', 'remotion', 'public', 'captures')
const TMP = path.join(process.cwd(), 'promo', '.pw-output', 'video')

type ClipInfo = { file: string; leadMs: number; clipMs: number }

async function settle(page: Page, extraMs: number) {
  await page
    .locator('.hub, .page, .home__title, .scene, main, #root > *')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => {})
  await page.evaluate(() => (document as Document & { fonts?: FontFaceSet }).fonts?.ready).catch(() => {})
  await page.waitForTimeout(extraMs)
}

// Record one take → a .webm + timing. `variant` distinguishes the main clip from a
// kid-mode PiP recording (different filename + toddler seed + cursor only on main).
async function recordClip(
  browser: Browser,
  beat: Beat,
  surface: SurfaceName,
  lang: Lang,
  scriptId: string,
  variant: 'main' | 'pip',
): Promise<ClipInfo> {
  const size = VIEWPORT[surface]
  const isPip = variant === 'pip'
  const ctxStart = Date.now()
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: TMP, size } })
  const page = await ctx.newPage()
  let clipMs = 1000
  let leadMs = 1000
  try {
    await preparePage(page, beat, surface, lang, { pip: isPip })
    await page.goto(beat.route!)
    await settle(page, beat.settle ?? 700)
    await page.mouse.move(size.width * 0.5, size.height * 0.72)
    leadMs = Date.now() - ctxStart
    await page.waitForTimeout(300)
    if (isPip) {
      // A calm kid-mode hold (no cursor choreography) — it's a small glance window.
      await page.waitForTimeout(3200)
    } else {
      await page.evaluate(installCursor)
      if (beat.play) {
        try {
          await beat.play(makeDriver(page, surface, lang))
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`  ⚠ ${beat.id} [${surface}/${lang}] play() failed: ${(e as Error).message}`)
        }
      }
      await page.waitForTimeout(700)
    }
    clipMs = Date.now() - (ctxStart + leadMs)
  } finally {
    const video = page.video()
    await ctx.close()
    if (video) {
      const file = `${beat.id}-${variant === 'pip' ? 'pip-' : ''}${surface}-${lang}.webm`
      await video.saveAs(path.join(OUT_ROOT, scriptId, file))
      await video.delete().catch(() => {})
    }
  }
  return { file: `${beat.id}-${isPip ? 'pip-' : ''}${surface}-${lang}.webm`, leadMs, clipMs }
}

for (const script of SCRIPTS) {
  test(`capture:${script.id}`, async ({ browser }) => {
    test.setTimeout(600_000)
    const dir = path.join(OUT_ROOT, script.id)
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(TMP, { recursive: true })

    const beats = []
    for (const beat of script.beats) {
      const clips: Partial<Record<SurfaceName, Partial<Record<Lang, ClipInfo>>>> = {}
      const pip: Partial<Record<SurfaceName, Partial<Record<Lang, ClipInfo>>>> = {}
      if (!beat.titleCard && beat.route) {
        for (const surface of beat.surfaces) {
          clips[surface] = {}
          if (beat.pip) pip[surface] = {}
          for (const lang of LANGS) {
            clips[surface]![lang] = await recordClip(browser, beat, surface, lang, script.id, 'main')
            if (beat.pip) pip[surface]![lang] = await recordClip(browser, beat, surface, lang, script.id, 'pip')
          }
        }
      }
      beats.push({
        id: beat.id,
        kind: beat.titleCard ? 'title' : 'clip',
        short: !!beat.short,
        caption: beat.caption ?? null,
        kicker: beat.kicker ?? null,
        hold: beat.hold ?? 3,
        transition: beat.transition ?? 'fade',
        punch: beat.punch ?? null,
        surround: beat.surround ?? (beat.titleCard ? 'dark' : 'cream'),
        clips,
        pip: beat.pip ? pip : null,
      })
    }

    const cuts = script.cuts ?? ['full']
    const manifest = { id: script.id, kind: script.kind, title: script.title, fps: script.fps ?? 30, music: script.music ?? null, cuts, beats }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    const clipCount = beats.filter((b) => b.kind === 'clip').length
    // eslint-disable-next-line no-console
    console.log(`✓ ${script.id}: ${beats.length} beats (${clipCount} clips) cuts=[${cuts}] → ${path.relative(process.cwd(), dir)}`)
  })
}
