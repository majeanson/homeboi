import { loadFont as loadBaloo } from '@remotion/google-fonts/Baloo2'
import { loadFont as loadHanken } from '@remotion/google-fonts/HankenGrotesk'
import type { Orientation } from './manifest'

export type Surround = 'dark' | 'cream'

// Reuse the app's "Pip" brand exactly (src/styles/core.css): warm paper, marigold
// primary, riso-ink member palette, Baloo 2 (display) + Hanken Grotesk (sans).
// Load only the weights/subsets we use — otherwise google-fonts fetches dozens of
// files per render tab (slow + flaky). Latin only; display 600/700, body 400/700.
const baloo = loadBaloo('normal', { weights: ['600', '700'], subsets: ['latin'], ignoreTooManyRequestsWarning: true })
const hanken = loadHanken('normal', { weights: ['400', '700'], subsets: ['latin'], ignoreTooManyRequestsWarning: true })
export const DISPLAY = baloo.fontFamily // 'Baloo 2'
export const FONT = hanken.fontFamily // 'Hanken Grotesk'

export const COLORS = {
  paper: '#fbf3e4',
  card: '#fffcf5',
  ink: '#2c2722',
  inkSoft: '#6b6258',
  marigold: '#f2a03d',
  marigoldDeep: '#d9842a',
  terracotta: '#e0724e',
  sage: '#88a36f',
  sky: '#7bb0c9',
  skyDeep: '#5891ac',
  berry: '#b06a93',
  teal: '#34b3a6',
  screen: '#0c0a08',
  // promo-only convenience aliases
  accent: '#f2a03d',
  accentVivid: '#f2a03d',
  cursor: '#5891ac',
  warm: '#b06a93',
}

export const SURROUND: Record<Surround, string> = {
  // warm dark bookend (matches the app's night paper family)
  dark: 'radial-gradient(130% 120% at 50% 8%, #241e17 0%, #120f0b 72%)',
  // the app's warm paper for the body — a deeper outer stop so the dark device bezel
  // always separates from the surround (the app's content is also cream; without this
  // the tablet edge vanishes on a sparse screen).
  cream: 'radial-gradient(120% 118% at 50% 2%, #fcf4e6 0%, #ecdcbe 62%, #e2cfac 100%)',
}

export const INK: Record<Surround, { fg: string; dim: string; kicker: string; shadow: string }> = {
  dark: { fg: '#fbf3e4', dim: 'rgba(251,243,228,0.66)', kicker: '#f2a03d', shadow: '0 2px 20px rgba(0,0,0,0.45)' },
  cream: { fg: '#2c2722', dim: '#6b6258', kicker: '#d9842a', shadow: '0 1px 2px rgba(255,255,255,0.45)' },
}

// Device "screen" pixel box per orientation. Sized to MATCH the 1× capture source
// (wall 1280×800, phone 390×844) as closely as the output allows, so the footage
// shows ~1:1 (no base upscale → sharp) and a moderate punch zooms from there. Wall is
// 1:1 with its source; the phone is necessarily scaled up to read in a 1080-wide frame.
export function screenSize(orientation: Orientation): { w: number; h: number } {
  if (orientation === 'landscape') return { w: 1280, h: 800 }
  return { w: 650, h: 1407 }
}
