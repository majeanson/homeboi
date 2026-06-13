// AI-failure broadcast. lib/api emits when any /api/* response carries the
// X-AI-Error header (a Workers AI call quietly failed server-side); the
// AiErrorProvider subscribes and pops a notice the user acknowledges into the
// persistent log. A tiny hand-rolled pub/sub, same shape as authEvents — api()
// is a plain function with no React context, so this is the bridge to the tree.
export interface AiErrorEvent {
  // The endpoint path that failed (e.g. "suggest-meal"), shown for context.
  feature: string
  // The server-side error message, already decoded from the header.
  message: string
}

type Handler = (e: AiErrorEvent) => void
const handlers = new Set<Handler>()

export function onAiError(h: Handler): () => void {
  handlers.add(h)
  return () => {
    handlers.delete(h)
  }
}

export function emitAiError(e: AiErrorEvent): void {
  for (const h of handlers) h(e)
}
