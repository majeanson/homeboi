import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// Setup file for vitest.d1.config.ts: every migration under functions/db/migrations,
// applied to the harness's D1 before any test file runs. Setup files run outside the
// per-file storage isolation and may run more than once; applyD1Migrations() only
// applies what the `d1_migrations` table has not seen, so that is safe.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
