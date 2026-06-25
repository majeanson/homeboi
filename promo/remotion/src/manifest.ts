// The capture→compose contract. The Playwright recorder (promo/capture) writes this to
// promo/remotion/public/captures/<id>/manifest.json; the compositions read it.

export type Lang = 'fr' | 'en'
export type SurfaceName = 'wall' | 'phone'
export type Orientation = 'landscape' | 'vertical'
export type Cut = 'full' | 'short'

export interface Bi {
  fr: string
  en: string
}

export interface Punch {
  rect: { x: number; y: number; w: number; h: number }
  to?: number
  start?: number
  end?: number
}

export interface ClipInfo {
  file: string
  /** ms of leading footage (navigation + settle) to trim before the take. */
  leadMs: number
  /** ms of usable footage after the lead (the interaction + end hold). */
  clipMs: number
}

export interface ManifestBeat {
  id: string
  kind: 'title' | 'clip'
  short: boolean
  caption: Bi | null
  kicker: Bi | null
  /** Title-card duration in seconds. */
  hold: number
  transition: 'fade' | 'slide' | 'dip'
  punch: Punch | null
  /** 'dark' | 'cream' backdrop. */
  surround: 'dark' | 'cream'
  /** clips[surface][lang] = recorded clip. Empty for title cards. */
  clips: Partial<Record<SurfaceName, Partial<Record<Lang, ClipInfo>>>>
  /** Optional kid-mode clip inset as a small PiP window. */
  pip: Partial<Record<SurfaceName, Partial<Record<Lang, ClipInfo>>>> | null
}

export interface Manifest {
  id: string
  kind: string
  title: Bi
  fps: number
  music: string | null
  cuts: Cut[]
  beats: ManifestBeat[]
}

export const TRANSITION_FRAMES = 9
// Safety margin (frames) shaved off the trim so a slightly-late lead estimate never cuts
// into the first frames of the interaction.
export const TRIM_SAFETY_FRAMES = 8

export const surfaceFor = (o: Orientation): SurfaceName => (o === 'landscape' ? 'wall' : 'phone')

export function beatsForCut(m: Manifest, cut: Cut): ManifestBeat[] {
  if (cut === 'full') return m.beats
  const short = m.beats.filter((b) => b.short)
  return short.length ? short : m.beats
}

// Frames a beat occupies for a given surface/lang (clip length, or title hold).
export function beatDurationFrames(beat: ManifestBeat, surface: SurfaceName, lang: Lang, fps: number): number {
  if (beat.kind === 'clip') {
    const info = beat.clips?.[surface]?.[lang]
    const ms = info?.clipMs ?? beat.hold * 1000
    return Math.max(1, Math.round((ms / 1000) * fps))
  }
  return Math.max(1, Math.round(beat.hold * fps))
}

export function totalDurationInFrames(beats: ManifestBeat[], surface: SurfaceName, lang: Lang, fps: number): number {
  const sum = beats.reduce((acc, b) => acc + beatDurationFrames(b, surface, lang, fps), 0)
  const overlap = TRANSITION_FRAMES * Math.max(0, beats.length - 1)
  return Math.max(1, sum - overlap)
}
