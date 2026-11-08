// Types for the real-runtime harness (vitest.d1.config.ts). `Cloudflare.Env` is what
// `import { env } from 'cloudflare:workers'` resolves to inside a test; it is our Env
// plus the one test-only binding the config injects.
import type { Env } from '../_lib/env'

declare global {
  namespace Cloudflare {
    interface Env extends Omit<import('../_lib/env').Env, never> {
      TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
      /** The task-merge drill's own database (vitest.d1.config.ts): never the Worker's. */
      DRILL_DB: D1Database
      ASSETS: Fetcher
      REALTIME_HUB?: DurableObjectNamespace
    }
  }
}

export type { Env }
