import { useEffect, useState } from 'react'

// Are we online? navigator.onLine + the online/offline events. Coarse on purpose
// (the OS can claim online with no real connectivity) — it drives the calm "hors
// ligne" badge, so a glance at cached data is trusted, not a hard gate on writes.
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
