// Which kind of device is reading — only to pick the right HOW-TO (where a bookmark is
// added and launched differs between iPhone Safari, Android Chrome and a desktop
// browser). Never a feature gate: every platform gets every feature; only the words
// change. iPadOS reports a Mac user agent since 13 — the touch count tells it apart.
export type Platform = 'ios' | 'android' | 'desktop'

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios' // iPadOS in desktop mode
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0)
}
