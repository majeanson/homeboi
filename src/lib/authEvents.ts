// Auth-lost broadcast. The query layer (lib/query) emits when ANY request comes
// back 401 mid-session; interested shells subscribe (AuthProvider re-checks the
// session, HubLayout decides whether this device just lost its pairing). A tiny
// hand-rolled pub/sub instead of an event bus dependency — two subscribers,
// boring-tech.
type Handler = () => void
const handlers = new Set<Handler>()

export function onAuthLost(h: Handler): () => void {
  handlers.add(h)
  return () => {
    handlers.delete(h)
  }
}

export function emitAuthLost(): void {
  for (const h of handlers) h()
}
