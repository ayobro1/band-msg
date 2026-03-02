# Next.js → SvelteKit + Convex Migration Map

This repository now contains a SvelteKit + Convex rewrite scaffold.

## Runtime Architecture

- Frontend: SvelteKit routes in `svelte-src/routes`
- Server API boundary: SvelteKit server routes in `svelte-src/routes/api/**`
- Data/auth backend: Convex functions in `convex/**`
- Hosting target: Vercel via adapter-vercel (`svelte.config.js`, `vercel.json`)

## Endpoint Mapping

- `POST /api/auth/register` (Next) → `POST /api/auth/register` (Svelte route) → `auth:register` (Convex mutation)
- `POST /api/auth/login` (Next) → `POST /api/auth/login` (Svelte route) → `auth:getLoginSalt` + `auth:login` (Convex query/mutation)
- `POST /api/auth/logout` (Next) → `POST /api/auth/logout` (Svelte route) → `auth:logout` (Convex mutation)
- `GET /api/auth/me` (Next) → `GET /api/auth/me` (Svelte route) → `auth:me` (Convex query)
- `GET /api/channels` (Next) → `GET /api/channels` (Svelte route) → `chat:listChannels` (Convex query)
- `POST /api/channels` (Next) → `POST /api/channels` (Svelte route) → `chat:createChannel` (Convex mutation)
- `GET /api/messages?channelId=` (Next) → `GET /api/messages?channelId=` (Svelte route) → `chat:listMessages` (Convex query)
- `POST /api/messages` (Next) → `POST /api/messages` (Svelte route) → `chat:sendMessage` (Convex mutation)
- `GET /api/admin/users` (Next admin equivalent) → `GET /api/admin/users` (Svelte route) → `auth:listPendingUsers` (Convex query)
- `POST /api/admin/users/approve` → `auth:approveUser` (Convex mutation)
- `POST /api/admin/users/promote` → `auth:promoteUser` (Convex mutation)
- `POST /api/admin/users/demote` → `auth:demoteUser` (Convex mutation)

## Data Model Mapping

- `users` (SQLite) → `users` (Convex table)
- `sessions` (SQLite, mostly unused) → `sessions` (Convex table, actively used)
- `channels` (SQLite) → `channels` (Convex table)
- `messages` (SQLite) → `messages` (Convex table)

## Not Yet Migrated (Legacy still in `src/**`)

Legacy source was removed. Remaining feature gaps against the old app:

- File uploads and media lifecycle
- Threads, reactions, events/practice calendar, push notifications
- SSE stream path (`/api/messages/stream`)

## Recommended Next Migrations

1. Add Convex file storage integration for upload/download parity.
2. Replace polling in `+page.svelte` with Convex realtime subscriptions.
3. Add admin approval and role mutation endpoints to Convex.
4. Migrate audit logs to Convex table + admin report route.
5. Remove the old Next/Bun runtime files after parity is complete.

Status: step 5 is complete.
