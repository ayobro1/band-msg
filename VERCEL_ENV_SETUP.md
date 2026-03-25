# Vercel Environment Setup

This project is a hybrid SvelteKit app. Set environment variables based on the parts of the app you are actually using.

## Core App

- `DATABASE_URL`
- `AUTH_COOKIE_SECURE=true` in production

## Convex Bridge / Auth Flows

- `CONVEX_URL`
- `PUBLIC_CONVEX_URL`
- `AUTH_BRIDGE_SECRET`
- `AUTH_PASSWORD_RESET_ENABLED`

If password reset is not intentionally enabled, keep `AUTH_PASSWORD_RESET_ENABLED=false`.

## Web Push

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

## Notes

- The active app tree is `src/`
- `svelte-src/` is still in the repo but should not be treated as the primary deployment target
- Pusher is not required for the core `src` app request path described in the README
