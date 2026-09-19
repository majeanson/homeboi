/// <reference types="vite/client" />

// Injected at build time by vite.config.ts `define` — ISO timestamp of the build.
declare const __BUILD_TIME__: string

// …and the commit it was built from (short), or 'dev' outside a git checkout.
// « Les remarques » stamps this on every report so a fix reads THAT code.
declare const __BUILD_SHA__: string
