# Band Chat (SvelteKit + Convex Rewrite)

This repository has been migrated to a **SvelteKit + Convex + Vercel** architecture.

- UI and server routes: `svelte-src/**`
- Convex backend: `convex/**`
- Migration notes: `MIGRATION_MAP.md`
- Security review: `SECURITY_AUDIT.md`

## Stack

- SvelteKit 2
- Svelte 5
- Convex (database + backend functions)
- Vercel adapter for deployment

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment values in `.env.local` (copy from `.env.local.example`):

```bash
CONVEX_URL=...
AUTH_COOKIE_SECURE=auto
```

3. Start Convex dev backend (in one terminal):

```bash
npm run convex:dev
```

4. Start SvelteKit app (in another terminal):

```bash
npm run dev
```

## API Surface (Current Rewrite Scope)

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/channels`
- `POST /api/channels`
- `GET /api/messages?channelId=...`
- `POST /api/messages`
- `GET /api/admin/users`
- `POST /api/admin/users/approve`
- `POST /api/admin/users/promote`
- `POST /api/admin/users/demote`

## Security Hardening Included

- Explicit origin checks for mutating `/api/*` requests
- CSRF token cookie + `x-csrf-token` validation for authenticated mutations
- Convex-backed login and registration rate limits
- Admin-only user moderation endpoints

## Deployment (Vercel)

1. Import the repository in Vercel.
2. Set environment variables:
   - `CONVEX_URL`
   - `AUTH_COOKIE_SECURE=true`
3. Build command: `npm run build`
4. Output handled by SvelteKit adapter-vercel.

## Security

The detailed intensive audit is in `SECURITY_AUDIT.md`.

High-priority items found in the legacy implementation include:

- JWT fallback secret risk
- Upload hardening gaps
- Missing explicit CSRF strategy on cookie-authenticated mutations
- Proxy header trust weaknesses for rate limiting

## Legacy Code Note

Legacy Next/Bun runtime files were removed from the repository during migration.
