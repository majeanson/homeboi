// Shared client-side mirror of the server intent union (functions/_lib/ai.ts).
// Kept in its own module so both the CaptureBar and the i18n type map import it
// without pulling in server code.
export type IntentType = 'event' | 'task' | 'list-item' | 'pantry-low' | 'meal' | 'note'
