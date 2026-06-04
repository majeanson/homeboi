# Babillard

> Working name. A household command-center for a cheap wall tablet: today's
> agenda, shared lists, chore rotation, and "supper tonight," all glanceable
> from across the kitchen. A pre-reader can run their own morning routine on
> it. The kitchen module (Garde-manger) plans meals and fills the grocery
> list by itself.
>
> Built to be **useful at home first**, showcase-able second, and **calm by
> design** — no streaks, no points to hoard, no notifications pulling you
> back. The day's list empties and stays empty.

---

## Status

Planning. No code yet. The thinking lives in [`bmad/`](./bmad/):

1. [`01-brief.md`](./bmad/01-brief.md) — project brief: problem, vision, who it's for, the design tenets.
2. [`02-prd.md`](./bmad/02-prd.md) — PRD: the capture spine, features by surface, the v1 cut line, epics.
3. [`03-architecture.md`](./bmad/03-architecture.md) — stack, data model, AI/Neuron budget, open decisions.

## Stack (intended)

Mirrors the [marc-portal](../portal) stack on purpose, so patterns and
muscle memory carry over and the result slots into the portal's showcase:

- **React 19 + Vite** SPA → **Cloudflare Pages**
- **Pages Functions** for `/api/*`
- **D1** (SQLite) for state, **R2** (optional) for photos/avatars
- **Workers AI** (`[ai]` binding) for the one AI feature that matters: a
  capture bar that turns *"dentiste mardi 3h"* or *"pus de lait"* into the
  right kind of structured thing. Free-tier Neurons, in-network, nothing
  leaves Cloudflare (Loi 25).
- Multi-tenant at the host level, like the portal.

## The one-line pitch

A family planner that respects your attention instead of farming it, that a
toddler can use without reading, that keeps the grocery list full without
anyone maintaining a pantry inventory.
