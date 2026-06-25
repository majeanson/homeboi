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
  // Record at 1× the viewport (deviceScaleFactor 1). A higher dpr does NOT scale the
  // recorded video to fill — Playwright paints the dpr-1 page into the TOP-LEFT of a
  // larger recordVideo.size and greys the rest. So zoom sharpness comes from sizing the
  // Remotion device screen 1:1 with this source (theme.screenSize) + moderate punches,
  // not from a bigger capture.
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: TMP, size } })
  const page = await ctx.newPage()
  let clipMs = 1000
  let leadMs = 1000
  try {
    await preparePage(page, beat, surface, lang, { pip: isPip })
    // domcontentloaded (not the default 'load') + settle() — heavy routes (the cercle
    // constellation) can stall the full load event past the nav timeout; settle waits
    // for the real content + fonts anyway. Retry once: across 60+ sequential contexts the
    // browser bogs down and an occasional nav exceeds the timeout (a flaky full-capture).
    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(beat.route!, { waitUntil: 'domcontentloaded' })
        break
      } catch (e) {
        if (attempt >= 1) throw e
        await page.waitForTimeout(800)
      }
    }
    await settle(page, beat.settle ?? 700)
    await page.mouse.move(size.width * 0.5, size.height * 0.72)
    leadMs = Date.now() - ctxStart
    await page.waitForTimeout(300)
    if (isPip) {
      // A calm kid-mode hold (no cursor choreography) — it's a small glance window.
      await page.waitForTimeout(2000)
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
      // A short tail hold — keeps the reel snappy (was 700; the long end-hold was the
      // main "creep" between cuts).
      await page.waitForTimeout(320)
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
    // 20 min — 2× retina recording (deviceScaleFactor:2, double-size video) is ~2× slower
    // to save per clip; 60 clips overran the old 10-min cap and left the tail uncaptured.
    test.setTimeout(1_200_000)
    const dir = path.join(OUT_ROOT, script.id)
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(TMP, { recursive: true })

    // Warm up Vite's on-demand compilation. Lazy routes (e.g. CookPage = React.lazy)
    // compile their chunk on FIRST hit, which can take several seconds — long enough
    // that the first real take records only the "Chargement…" Suspense fallback (the
    // parent cook clip went blank while the toddler PiP, recorded right after against
    // the now-compiled chunk, loaded fine). Pre-visit every unique route once so all
    // chunks are built before any take.
    {
      const warm = await browser.newContext({ viewport: VIEWPORT.wall })
      const wp = await warm.newPage()
      await preparePage(wp, { id: 'warm', surfaces: ['wall'], route: '/board' } as Beat, 'wall', 'fr')
      const routes = [...new Set(script.beats.filter((b) => b.route).map((b) => b.route!))]
      for (const route of routes) {
        await wp.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => {})
        await wp.waitForTimeout(900)
      }
      await warm.close()
    }

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
