# Intensive Security Audit (Legacy Next/Bun Codebase)

Date: 2026-03-02
Scope: Existing implementation under `src/**`, `server.ts`, and `src/lib/**`.

## Executive Summary

The legacy app has strong baseline controls (HTTP-only cookie, password hashing, role checks), but several high-risk gaps remain around secret defaults, upload handling, CSRF posture, and trust boundaries around proxy headers.

## Findings

### 1) Critical: Weak JWT fallback secret in production-adjacent code

- Evidence: `src/lib/jwt.ts` sets `JWT_SECRET` to `"change-me-in-production"` when unset.
- Risk: If environment configuration drifts, tokens become forgeable with a known key.
- Impact: Full account compromise and privilege escalation.
- Fix:
  - Hard-fail process boot when `JWT_SECRET` is missing.
  - Remove static fallback completely.
  - Rotate all existing sessions immediately after fix.

### 2) High: Upload attack surface enables XSS/content abuse and resource exhaustion

- Evidence:
  - `src/app/api/upload/route.ts` accepts `image/svg+xml`.
  - `MAX_FILE_SIZE` is `500 MB`.
  - `src/app/api/upload/[id]/route.ts` serves untrusted file names in `Content-Disposition: inline`.
- Risk:
  - SVG can execute active content in some rendering contexts.
  - Large files can be abused for disk/memory exhaustion.
  - Inline rendering of user-controlled content increases exposure.
- Fix:
  - Remove SVG from allowed upload MIME list unless fully sanitized server-side.
  - Lower max upload size drastically (e.g., 10–25 MB depending on use case).
  - Force download for non-image-safe types and sanitize filenames.
  - Add per-user and per-IP upload rate limits.

### 3) High: CSRF defense is not explicit for cookie-authenticated mutation routes

- Evidence: State-changing routes in `src/app/api/**` rely on cookie auth with no explicit Origin/CSRF token checks.
- Risk: Cross-site request forgery on endpoints that accept browser credentials.
- Fix:
  - Add explicit Origin allow-list checks for every non-GET endpoint.
  - Add anti-CSRF token validation for mutation APIs.
  - Keep `SameSite=Strict`, but do not treat it as the only control.

### 4) Medium: Rate-limit keying trusts spoofable proxy headers

- Evidence: `src/app/api/auth/login/route.ts` uses `cf-connecting-ip` and first value from `x-forwarded-for` without trusted proxy validation.
- Risk: Attacker can bypass per-IP throttling if upstream doesn’t sanitize headers.
- Fix:
  - Trust proxy headers only behind known reverse proxies.
  - Otherwise derive client IP from platform-provided trusted metadata.
  - Add username + IP + device fingerprint constraints with lockout telemetry.

### 5) Medium: SSE broadcasts to all connected clients without channel-level stream partitioning

- Evidence:
  - `src/lib/store.ts` stores global `sseClients` set.
  - `notifySubscribers` pushes all events to all clients.
- Risk: Metadata/event leakage risk if consumer-side filtering fails or regresses.
- Fix:
  - Partition streams by user/channel membership server-side.
  - Authorize on every event fanout, not just connection setup.

### 6) Medium: Session lifecycle inconsistency

- Evidence:
  - JWT auth is primary (`src/lib/auth.ts`, `src/lib/jwt.ts`), but `sessions` table exists and is not the active source of truth.
- Risk: Revocation semantics are unclear; logout may not invalidate all active JWTs.
- Fix:
  - Move to server-side session IDs or short-lived JWT + rotation + revocation list.
  - Enforce single consistent auth model.

### 7) Low/Medium: Security headers are incomplete in legacy runtime

- Evidence: `server.ts` enforces HTTPS redirect but no strict CSP/HSTS/header baseline is configured there.
- Risk: Increased XSS/clickjacking blast radius if client bug appears.
- Fix:
  - Add CSP, HSTS, X-Frame-Options/`frame-ancestors`, X-Content-Type-Options, Referrer-Policy.

## Positive Controls Already Present

- Password hashing uses PBKDF2 (`src/lib/store.ts`).
- Login delay and throttling are implemented (`src/app/api/auth/login/route.ts`).
- Cookie uses `HttpOnly` + `SameSite=Strict` (`src/app/api/auth/login/route.ts`).
- Authz checks (`requireApprovedUser`, `requireAdmin`) are consistently used across many routes.

## Priority Remediation Plan

1. Remove JWT fallback secret and enforce startup fail-fast.
2. Lock down upload pipeline (type, size, rate, disposition).
3. Add explicit CSRF protections for all mutating endpoints.
4. Harden rate-limit client IP trust model.
5. Partition SSE fanout by authorized audience.
6. Unify auth/session strategy and rotation policies.

## Migration Security Notes (SvelteKit + Convex)

The new scaffold introduces:

- HttpOnly session cookies with strict same-site policy.
- Server-only Convex access from SvelteKit API routes (browser never gets session token directly).
- Response hardening headers in `svelte-src/hooks.server.ts`.

Still required before production:

- Add per-route CSRF token/origin enforcement.
- Add Convex-side rate-limit tables and lockout policy.
- Add audit logging for auth events and admin actions.
- Replace polling with authenticated realtime channels.
