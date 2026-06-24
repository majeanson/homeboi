import type { PromoScript } from './types'
import { tour } from './tour'

// Every script the recorder captures. (howto-kitchen.ts is parked while the showcase is
// rebuilt on the new clip-based engine; it'll be re-authored as a clip how-to.)
export const SCRIPTS: PromoScript[] = [tour]
