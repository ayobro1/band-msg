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
cp .env.local.example .env.local
# Then set CONVEX_URL to your Convex deployment URL
CONVEX_URL=https://your-deployment.convex.cloud
AUTH_COOKIE_SECURE=false   # use false for local HTTP dev
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

1. Run `npx convex deploy` to get your **Convex deployment URL**.
2. Import this repository in [vercel.com](https://vercel.com).
3. In your Vercel project go to **Settings → Environment Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `CONVEX_URL` | `https://your-deployment.convex.cloud` | **Required.** From Convex dashboard or `npx convex deploy`. |
| `AUTH_COOKIE_SECURE` | `true` | **Required.** Enforces `Secure` cookie flag in production. |

> `NODE_ENV` and `VERCEL` are set automatically by Vercel — do **not** add them manually.

4. Build command: `npm run build` (auto-detected by Vercel).
5. Output directory is handled by the SvelteKit Vercel adapter — no manual config needed.

## Security

The detailed intensive audit is in `SECURITY_AUDIT.md`.

High-priority items found in the legacy implementation include:

- JWT fallback secret risk
- Upload hardening gaps
- Missing explicit CSRF strategy on cookie-authenticated mutations
- Proxy header trust weaknesses for rate limiting

## Legacy Code Note

Legacy Next/Bun runtime files were removed from the repository during migration.
