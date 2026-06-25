// Google Cast WEB SENDER — Chrome (desktop + Android) ONLY. The sender SDK does not
// exist on iOS Safari/Chrome (Apple blocks it), so every export here is a no-op /
// "unavailable" on iOS; the settings card falls back to the Stage-1 "Cast tab"
// instructions there. This launches our registered Custom Receiver (public/
// cast-receiver.html) and hands it the read-only cast token over a custom channel, so
// the TV's iframe of /cast can read the household API from the Chromecast itself.
//
// To activate: paste the Application ID from the Google Cast SDK Developer Console
// (Custom Receiver → cast-receiver.html) into CAST_APP_ID below. While it's empty the
// sender stays hidden everywhere (castSenderPossible() === false), so Stage 2 ships
// dormant and turns on with this one line. See DEPLOY.md (« Diffuser au salon »).
// The registered Cast Application ID (Google Cast SDK Developer Console → Custom
// Receiver « Babillard salon » → cast-receiver.html). Typed as string so the guards
// below stay valid for tsc. Empty disables the sender entirely; set = button live.
const CAST_APP_ID: string = '9C2BB708'

// The custom channel the receiver listens on (must match cast-receiver.html NS).
const NS = 'urn:x-cast:com.babillard.cast'
// The official Cast Web Sender bootstrap (loads chrome.cast + cast.framework).
const SENDER_SRC = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js'

// A cheap synchronous heuristic for "could this browser cast at all?" — used to decide
// whether to even SHOW the « Diffuser » button (the real check is loadSender() below).
// True only on Chromium desktop/Android with an App ID configured; never on iOS.
export function castSenderPossible(): boolean {
  if (!CAST_APP_ID) return false
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false
  const ua = navigator.userAgent
  // CriOS = Chrome on iOS — Chromium-branded but still NO cast sender (Apple WebKit).
  if (/CriOS|FxiOS|EdgiOS/.test(ua)) return false
  if (/iPad|iPhone|iPod/.test(ua)) return false
  // iPadOS reports as "Macintosh" but is touch — exclude it too (no cast sender).
  if (ua.includes('Macintosh') && 'ontouchend' in document) return false
  return /\bChrome\/|\bCrMo\/|Edg\//.test(ua)
}

let senderPromise: Promise<boolean> | null = null

// Lazy-load + initialize the Cast sender SDK exactly once. Resolves false when the SDK
// reports unavailable (non-Chrome) or fails to load — callers degrade gracefully.
function loadSender(): Promise<boolean> {
  if (senderPromise) return senderPromise
  senderPromise = new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    const w = window as unknown as {
      cast?: { framework?: { CastContext: { getInstance(): { setOptions(o: unknown): void } } } }
      chrome?: { cast?: { AutoJoinPolicy: { ORIGIN_SCOPED: unknown } } }
      __onGCastApiAvailable?: (isAvailable: boolean) => void
    }
    const init = (): boolean => {
      try {
        w.cast!.framework!.CastContext.getInstance().setOptions({
          receiverApplicationId: CAST_APP_ID,
          autoJoinPolicy: w.chrome!.cast!.AutoJoinPolicy.ORIGIN_SCOPED,
        })
        return true
      } catch {
        return false
      }
    }
    if (w.cast?.framework && w.chrome?.cast) return resolve(init())
    // The SDK calls this global once it has loaded + decided availability.
    w.__onGCastApiAvailable = (isAvailable: boolean) => resolve(isAvailable ? init() : false)
    const s = document.createElement('script')
    s.src = SENDER_SRC
    s.async = true
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
  return senderPromise
}

// Open the device picker, launch the receiver on the chosen Chromecast, and hand it the
// read-only cast token. `scene` selects which TV face the receiver shows ('board' = the
// full board, 'ambient' = the screensaver, 'welcome' = the visitor window). `display`
// marks the token as a PERMANENT device credential (board/ambient) vs a time-boxed guest
// token (welcome): the receiver stashes a display token on its device path (so the puck
// holds the screen forever), passing `householdId` along. Throws 'cast-unavailable' when
// the sender SDK isn't usable here (non-Chrome) — the caller shows the cast-tab fallback.
// A user-cancelled picker rejects too; the caller treats any throw as "nothing changed".
export async function castToSalon(
  token: string,
  scene: string = 'board',
  display: boolean = false,
  householdId: string = '',
): Promise<void> {
  const ok = await loadSender()
  if (!ok) throw new Error('cast-unavailable')
  const ctx = (window as unknown as {
    cast: {
      framework: {
        CastContext: {
          getInstance(): {
            requestSession(): Promise<void>
            getCurrentSession(): { sendMessage(ns: string, msg: unknown): Promise<void> } | null
          }
        }
      }
    }
  }).cast.framework.CastContext.getInstance()
  await ctx.requestSession()
  const session = ctx.getCurrentSession()
  if (!session) throw new Error('cast-no-session')
  await session.sendMessage(NS, { token, scene, display, hh: householdId })
}
