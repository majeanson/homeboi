import { useEffect, useRef, useState, type ImgHTMLAttributes, type Ref } from 'react'

// THE image element. Every picture the app shows — an R2 blob by its key
// (`imgUrl`), a flyer clipping through `/api/flyer-img`, a store logo, a recipe
// photo from the web, a data-URL — renders through here, and a build guard
// (`src/lib/img-rule.test.ts`) fails a raw `<img>` anywhere else.
//
// WHY (2026-10-30, the « clear » drawings): on the phone the board's « Dessins »
// strip showed three tiles with nothing in them, and on another open the same
// three loaded fine. A bare <img> has exactly one shot at its bytes. When that
// shot fails — one bar of signal, iOS cancelling every in-flight request as the
// PWA goes to the background, the service worker answering a synthetic 504 for a
// dropped connection, a transient Worker error — the element fires `error` once
// and then sits there for the rest of the session: the board's polls never change
// its `src`, so nothing ever asks again. Pictures the service worker had already
// cached from an earlier visit showed instantly beside them, which is what made
// it look random. And while it travelled (a drawing is a PNG up to 3 MB) the
// element had no intrinsic size, so a slow load and a dead one collapsed to the
// same nothing.
//
// So this component owns the two things a picture needs and a bare <img> lacks:
//
//   · RETRY. A failed load re-asks after a short backoff (600 ms · 2.5 s · 6 s),
//     by remounting the element (key) — the same URL, no cache-buster, so a hit
//     the service worker meanwhile cached is honoured. Once exhausted it waits,
//     and re-asks ONCE more each time the device comes back online or the app
//     becomes visible again (the two moments the earlier failures were about).
//     A genuinely gone blob (a 404) therefore costs one request per such event,
//     never a loop. (This was FlyerViewer's private retry before — one site out
//     of sixty-six; now it is the default everywhere.)
//
//   · A LOADING STATE the CSS can see: `data-loaded` is '0' while it travels (and
//     during retries), '1' once a bitmap is on screen, 'x' only when every retry
//     is spent. A surface that knows the picture's SHAPE reserves it under '0'
//     with the shared `flyer-img-shimmer` keyframe (carnet docs, cercle photos,
//     the flyer grid, the board drawing tile) — so nothing jumps under a thumb,
//     and a slow load never reads as « there is nothing here ».
//
// `onError` reaches the caller only when the retries are SPENT — a caller that
// hides or swaps the picture on failure (HandoffPage's pins, CarnetDocs' PDF
// fallback) must not do so on the first hiccup. `onLoad` fires on every success.
// Everything else is a plain <img> prop, `ref` included.

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  ref?: Ref<HTMLImageElement>
}

const IMG_BACKOFF_MS = [600, 2500, 6000] as const

type State = 'loading' | 'ok' | 'fail'

export function Img({ ref, src, onLoad, onError, ...rest }: Props) {
  // `attempt` keys the element (monotonic — every retry is a fresh mount);
  // `fails` counts failures in a row, and decides whether a retry is still owed.
  const [attempt, setAttempt] = useState(0)
  const [fails, setFails] = useState(0)
  const [state, setState] = useState<State>('loading')
  const exhausted = state === 'fail' && fails > IMG_BACKOFF_MS.length

  // A new src starts over (the same element re-used for another picture). Guarded
  // against the mount run: the ref below may already have read a cached bitmap as
  // 'ok' during commit, and an effect resetting that to 'loading' would leave a
  // complete image stuck at '0' — no further load event is coming for it.
  const prevSrc = useRef(src)
  useEffect(() => {
    if (prevSrc.current === src) return
    prevSrc.current = src
    setFails(0)
    setState('loading')
  }, [src])

  // Backoff retry while attempts remain. Remounting re-fetches the same URL.
  useEffect(() => {
    if (state !== 'fail' || fails > IMG_BACKOFF_MS.length) return
    const id = setTimeout(() => {
      setAttempt((n) => n + 1)
      setState('loading')
    }, IMG_BACKOFF_MS[fails - 1])
    return () => clearTimeout(id)
  }, [state, fails])

  // Spent: wait for the world to change, then ask once more. `fails` stays at the
  // ceiling so a further failure is immediately exhausted again, and a success
  // resets it — one request per reconnection / foregrounding, never a storm.
  useEffect(() => {
    if (!exhausted) return
    const again = () => {
      if (document.visibilityState === 'hidden') return
      setAttempt((n) => n + 1)
      setState('loading')
    }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [exhausted])

  return (
    <img
      key={attempt}
      {...rest}
      src={src}
      data-loaded={state === 'ok' ? '1' : exhausted ? 'x' : '0'}
      // A cache-first hit can finish before React attaches onLoad (the element is
      // already `complete` with pixels) — the ref reveals it, else it would sit
      // hidden under a surface's `data-loaded='0'` rule for ever.
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) setState('ok')
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      onLoad={(e) => {
        setFails(0)
        setState('ok')
        onLoad?.(e)
      }}
      onError={(e) => {
        const n = fails + 1
        setFails(n)
        setState('fail')
        if (n > IMG_BACKOFF_MS.length) onError?.(e)
      }}
    />
  )
}
