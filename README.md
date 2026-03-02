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

---

## Where do I set environment variables?

There are **two separate places** — don't mix them up:

### 1. Inside your Convex project (convex.dev dashboard)

This is for any secrets your **Convex backend functions** need.  
👉 Go to [dashboard.convex.dev](https://dashboard.convex.dev) → your project → **Settings → Environment Variables**.

**The Convex functions in this project do not need any environment variables**, so you don't need to add anything here unless you extend the backend.

### 2. Inside your SvelteKit / Vercel project

This is for variables your **SvelteKit server** (the `svelte-src/` code) needs — including the URL to reach Convex.

- **Local development** → `.env.local` file at the repo root (see [Quick Start](#quick-start))
- **Vercel production** → your Vercel project → **Settings → Environment Variables**

| Variable | Example value | Required | Description |
|---|---|---|---|
| `CONVEX_URL` | `https://happy-animal-123.convex.cloud` | ✅ Yes | The URL of your Convex deployment. Get it from the Convex dashboard or by running `npx convex deploy`. |
| `AUTH_COOKIE_SECURE` | `true` | ✅ Yes (production) | Set to `true` on Vercel so session cookies use the `Secure` flag. Use `false` for local HTTP dev. |

> `NODE_ENV` and `VERCEL` are injected automatically by Vercel — do **not** add them yourself.

---

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Log in to Convex and start the dev backend (this prints your `CONVEX_URL`):

```bash
npx convex dev
```

3. Copy the example env file and fill in your `CONVEX_URL`:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
CONVEX_URL=https://your-deployment.convex.cloud   # printed by `npx convex dev`
AUTH_COOKIE_SECURE=false                           # false for local HTTP dev
```

4. Start the SvelteKit app (in a second terminal):

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

1. Run `npx convex deploy` — this pushes your Convex functions and prints the deployment URL.
2. Import this repository in [vercel.com](https://vercel.com).
3. In your Vercel project go to **Settings → Environment Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `CONVEX_URL` | `https://your-deployment.convex.cloud` | **Required.** From `npx convex deploy` output or the Convex dashboard. |
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
