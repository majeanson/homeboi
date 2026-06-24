import type { Page } from '@playwright/test'
import type { AppState } from '../../e2e/mocks'

// A promo "script" drives the video. The Playwright recorder (promo/capture) plays each
// beat's choreography while RECORDING the live app (real cursor, real clicks, the app's
// own animations) to a .webm, and writes a manifest.json the Remotion project composites.

export type Bi = { fr: string; en: string }

// Output surface name → device role + viewport at record time:
//   wall  → kiosk  @ 1280×800  (the 16:9 landscape video)
//   phone → mobile @ 390×844   (the 9:16 vertical video)
export type SurfaceName = 'wall' | 'phone'

export type MockOpts = { signedIn?: boolean; unauthorized?: boolean; fresh?: boolean; longText?: boolean }

// Helper passed to a beat's play() — drives the visible cursor + real interactions while
// the page is being recorded. Coordinates resolve from selectors (first match).
export interface Driver {
  page: Page
  surface: SurfaceName
  lang: 'fr' | 'en'
  /** Glide the cursor to an element (or point) without clicking. */
  move(target: string | { x: number; y: number }): Promise<void>
  /** Glide to an element and click it (real mousedown/up → real app animation). */
  click(target: string): Promise<void>
  /** Glide to + click the first element whose visible text matches the active language. */
  clickText(text: Bi): Promise<void>
  /** Click a field, then type with a natural per-key delay. */
  type(target: string, text: string): Promise<void>
  /** Smoothly scroll an element into view. */
  scrollTo(target: string): Promise<void>
  /** Scroll a scroll-container by a pixel delta (wheel), for a calm content pan. */
  wheel(target: string, dy: number): Promise<void>
  /** Pause (ms). */
  wait(ms: number): Promise<void>
}

// A punch-in on the live footage: ease a zoom toward a region over part of the clip.
export interface Punch {
  rect: { x: number; y: number; w: number; h: number } // normalized 0..1
  to?: number // target scale, default 1.5
  start?: number // 0..1 of the clip, default 0.15
  end?: number // 0..1, default 1
}

export interface Beat {
  /** Stable id — used in the clip filenames. */
  id: string
  /** SPA route to record. Omit for a branded title/closing card (no recording). */
  route?: string
  /** Output surfaces to record this beat in. Title cards: []. */
  surfaces: SurfaceName[]
  /** seedState overrides (theme/audience/boardView…). lang + surface set by the rig. */
  seed?: Partial<AppState>
  /** mockApi overrides (e.g. { signedIn:false }). */
  mock?: MockOpts
  /** Render as a full-bleed branded card instead of footage. */
  titleCard?: boolean
  /** Short caption (a few words — the footage carries the story). Optional. */
  caption?: Bi
  /** Tiny kicker label above the caption. Optional. */
  kicker?: Bi
  /** Title-card duration in seconds (clips derive length from the recording). Default 3. */
  hold?: number
  /** Transition INTO this beat. Default 'fade'. */
  transition?: 'fade' | 'slide' | 'dip'
  /** Optional punch-in zoom on the footage. */
  punch?: Punch
  /** Backdrop behind the footage/card. Default: title cards 'dark', clips 'cream'. */
  surround?: 'dark' | 'cream'
  /** Also record this route in kid (toddler) mode and inset it as a small PiP window. */
  pip?: { seed?: Partial<AppState> }
  /** Extra settle ms after navigation before the take starts. Default 700. */
  settle?: number
  /** Choreography: drive the cursor + interactions. Its wall-clock length sets the clip length. */
  play?: (d: Driver) => Promise<void>
  /** Include this beat in the auto-trimmed short cut. */
  short?: boolean
}

export interface PromoScript {
  id: string
  kind: 'showcase' | 'howto'
  title: Bi
  fps?: number
  music?: string
  cuts?: ('full' | 'short')[]
  beats: Beat[]
}
