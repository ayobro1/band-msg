# Band Chat

Band Chat is a SvelteKit app with a hybrid backend. The active app tree is `src/`, not `svelte-src/`, and the repo is still carrying some migration-era duplication and legacy docs.

## Current Architecture

- Active web app: `src/`
- Legacy duplicate tree: `svelte-src/` remains in the repo, but it is not the authoritative source for current route work
- Primary application data path: Neon/Postgres through server-side helpers and SvelteKit API routes
- Convex: active, but not the sole backend; it currently supports bridged auth/account flows and migration-era backend pieces
- Pusher: dependencies and setup notes still exist in the repo, but it is not the primary request/data path for the active `src` app

In practical terms, the live architecture is a hybrid:

- SvelteKit routes in `src/routes/api` handle the active app surface
- SQL-backed helpers provide most core app persistence
- Convex is present alongside that SQL layer rather than replacing it completely

## What Lives Where

- Neon/Postgres currently backs most app data and rate limiting
- Convex is currently used for backend flows that have been moved there, especially auth-related bridging
- Web push is handled separately with VAPID/web-push configuration

The repository should not currently be described as "fully migrated to Convex" or as a single-backend app.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables for the features you are using:

- `DATABASE_URL` for the primary SQL-backed app data
- `CONVEX_URL` and `PUBLIC_CONVEX_URL` if you are using the Convex-backed bridge flows
- `AUTH_BRIDGE_SECRET` for SvelteKit-to-Convex auth bridging
- `AUTH_COOKIE_SECURE=true` in production
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` if you are using web push

3. Start the app:

```bash
npm run dev
```

4. Run the SvelteKit check when making code changes:

```bash
npm run check
```

## Repo Notes

- `src/` is the active application tree
- `convex/` contains the Convex backend used by the hybrid app
- `svelte-src/` contains older duplicated app code and should be treated as migration residue unless a specific task says otherwise
- Some scripts and old docs still reference legacy paths; prefer the current app behavior over older prose

## Related Docs

- [CONVEX_MIGRATION.md](./CONVEX_MIGRATION.md) for current migration-status notes
- [APPROVAL_FLOW_EXPLANATION.md](./APPROVAL_FLOW_EXPLANATION.md) for historical approval-flow context
- [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md) for production environment-variable guidance
