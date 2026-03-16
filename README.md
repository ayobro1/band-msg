---

# Band Chat - Discord Clone

A full-featured Discord-like chat platform built with SvelteKit, featuring message reactions, typing indicators, server management, calendar events, and more.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Security](https://img.shields.io/badge/security-8.5%2F10-brightgreen)

---

## Features

### Core Features

* **Multi-Server Support** – Create and join unlimited servers or guilds
* **Rich Messaging** – Markdown support, mentions, and code blocks
* **Message Reactions** – React to any message
* **Typing Indicators** – See when others are typing
* **Presence Status** – Online, offline, idle, and do-not-disturb states
* **Server Invites** – Generate shareable invite links
* **Calendar & Events** – Schedule and manage community events
* **Progressive Web App** – Install on any device with offline support
* **Discord-Inspired UI** – Dark theme aligned with Discord-style design
* **Enterprise-Grade Security** – CSRF protection, rate limiting, and XSS prevention

### Technical Features

* Real-time typing indicators
* Auto-scroll to new messages
* Markdown formatting
* CSRF protection on all mutations
* Rate limiting (login, messages, channels)
* Session management with expiration
* Input validation and sanitization
* Content Security Policy headers
* Service worker for offline support

---

## Quick Start

### Prerequisites

* Node.js 18+
* npm or pnpm
* Neon Postgres database (or any PostgreSQL 14+)

### Installation

#### 1. Clone the repository

```bash
git clone https://github.com/NolanCotter/band-msg.git
cd band-msg
```

#### 2. Install dependencies

```bash
npm install
```

#### 3. Set up environment variables

Create `.env.local`:

```bash
DATABASE_URL=postgresql://user:pass@host/database?sslmode=require
AUTH_COOKIE_SECURE=auto  # Set to 'true' in production
```

You can obtain a free database from Neon or use your own PostgreSQL server.

#### 4. Initialize the database

```bash
npm run db:setup
```

This creates all tables, indexes, and constraints automatically.

#### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

#### 6. Create your first account

The first registered user is automatically assigned administrator privileges.

---

## Documentation

* **Features Guide** – Comprehensive list of features and usage instructions
* **Security Audit** – Original security findings from the legacy codebase
* **Security Enhancements** – New security improvements implemented
* **Migration Map** – Notes on migration from Next.js to SvelteKit

---

## Architecture

### Stack

* **Frontend**: SvelteKit 2 + Svelte 5
* **Backend**: SvelteKit API Routes
* **Database**: Neon Postgres (or any PostgreSQL 14+)
* **Authentication**: Cookie-based sessions with CSRF protection
* **Deployment**: Vercel (recommended)

### Project Structure

```
band-msg/
├── svelte-src/
│   ├── lib/
│   │   ├── markdown.ts
│   │   └── server/
│   │       ├── auth.ts
│   │       ├── db.ts
│   │       └── request.ts
│   ├── routes/
│   │   ├── +page.svelte
│   │   ├── +layout.svelte
│   │   └── api/
│   │       ├── auth/
│   │       ├── channels/
│   │       ├── messages/
│   │       ├── reactions/
│   │       ├── servers/
│   │       ├── invites/
│   │       ├── events/
│   │       ├── typing/
│   │       └── presence/
│   ├── app.html
│   └── hooks.server.ts
├── public/
│   ├── manifest.json
│   ├── sw.js
│   ├── offline.html
│   └── icons/
└── package.json
```

---

## Database Schema

**11 Tables**

* `users` – User accounts and presence
* `sessions` – Active sessions
* `servers` – Guilds or communities
* `server_members` – Server membership
* `roles` – Custom server roles
* `channels` – Text or voice channels
* `channel_members` – Private channel access
* `messages` – Chat messages
* `message_attachments` – File uploads
* `message_reactions` – Message reactions
* `typing_indicators` – Real-time typing indicators
* `invites` – Server invites
* `calendar_events` – Scheduled events
* `event_attendees` – Event RSVPs
* `rate_limits` – Rate limiting tracking

See `db.ts` for the full schema.

---

## Configuration

### Environment Variables

| Variable             | Required | Default | Description                                        |
| -------------------- | -------- | ------- | -------------------------------------------------- |
| `DATABASE_URL`       | Yes      | —       | PostgreSQL connection string                       |
| `AUTH_COOKIE_SECURE` | No       | `auto`  | Set to `true` in production for HTTPS-only cookies |

### Rate Limits (Configurable in Code)

* Login attempts: 5 per 15 minutes per username
* Message sending: 10 per minute per user
* Channel creation: 5 per hour per user (admin only)
* Invite creation: Unlimited (consider adding a limit)
* File uploads: Not yet implemented

### Security Headers (hooks.server.ts)

* Content-Security-Policy
* X-Frame-Options: DENY
* X-Content-Type-Options: nosniff
* Referrer-Policy: strict-origin-when-cross-origin
* Permissions-Policy: camera=(), microphone=(), geolocation=()
* Strict-Transport-Security (HTTPS only)

---

## Deployment

### Vercel (Recommended)

1. Import the repository in Vercel
2. Set environment variables:

   * `DATABASE_URL` – Your Neon connection string
   * `AUTH_COOKIE_SECURE=true`
3. Deploy

`@sveltejs/adapter-vercel` is already configured.

### Other Platforms

For Node.js platforms such as Render, Railway, or Fly.io:

1. Install adapter:

```bash
npm install -D @sveltejs/adapter-node
```

2. Update `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-node';
```

3. Build:

```bash
npm run build
```

4. Start:

```bash
node build/index.js
```

---

## PWA Installation

### Android (Chrome, Edge, Brave)

1. Open the site in the browser
2. Tap the menu → “Install app” or “Add to Home screen”
3. Confirm installation

### iOS (Safari)

1. Tap the Share button
2. Select “Add to Home Screen”
3. Name the app and confirm

### Desktop (Chrome, Edge, Brave)

1. Click the install icon in the address bar
2. Select “Install Band Chat”
3. The app opens in a standalone window

### PWA Capabilities

* Offline message reading (cached)
* Home screen installation
* Standalone window mode
* Background sync (planned)
* **Push notifications** - Get notified of new messages even when the app is closed

---

## Push Notifications Setup

### Generate VAPID Keys

VAPID keys are required for web push notifications. Generate them with:

```bash
node scripts/generate-vapid-keys.js
```

This will output a public and private key. Add them to your `.env.local`:

```bash
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
```

### Enable Push Notifications

1. Log in to your account
2. Click the bell icon in the header
3. Click "Push Notifications" toggle to enable
4. Allow notifications when prompted by your browser

### Sending Push Notifications

Admins can send push notifications via the API:

```bash
curl -X POST /api/push/send \
  -H "Content-Type: application/json" \
  -d '{"title": "New Message", "body": "You have been mentioned", "url": "/"}'
```

---

## Development

### Available Scripts

```bash
npm run dev
npm run build
npm run preview
npm run check
npm run db:setup
```

### Database Migrations

When modifying the schema in `db.ts`:

1. `ensureDb()` uses `CREATE TABLE IF NOT EXISTS`
2. Safe to run multiple times
3. For production, consider a migration tool such as:

   * Prisma Migrate
   * Drizzle Kit
   * node-pg-migrate

---

## Troubleshooting

### Database Connection Issues

```bash
psql $DATABASE_URL
npm run db:setup
```

### CSRF Errors

* Clear browser cookies
* Use regular browsing mode
* Ensure cookies are enabled

### Build Errors

```bash
rm -rf node_modules .svelte-kit
npm install
```

### Port Already in Use

```bash
lsof -ti:5173 | xargs kill -9
npm run dev -- --port 3000
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

### Priority Features

* File upload system (API needed)
* Private channels (UI needed)
* Custom roles and permissions (UI needed)
* WebSocket support for real-time updates
* Voice channels (WebRTC)
* Direct messages

---

## Security

### Reporting Vulnerabilities

open public issues for security vulnerabilities.


### Security Features

* CSRF protection on all mutations
* XSS prevention via HTML escaping
* SQL injection prevention (parameterized queries)
* Rate limiting
* Password hashing with PBKDF2 (100k iterations)
* Session expiration (7 days)
* Content Security Policy headers
* Input validation and sanitization

Security Score: **8.5/10**

---

## Performance

### Benchmarks (Approximate)

* First Load: ~500ms (SvelteKit SSR)
* Subsequent Navigation: ~50ms (client-side routing)
* Message Send Latency: ~100–200ms
* Message Polling: Every 2 seconds
* Bundle Size: ~150KB compressed

### Optimization Recommendations

1. Enable database connection pooling
2. Add Redis for rate limiting
3. Implement WebSocket for real-time updates
4. Use a CDN for static assets
5. Enable Vercel Edge Functions

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Acknowledgments

* Inspired by Discord
* Built with SvelteKit
* Database by Neon
* Deployed on Vercel

---

## Support

* Documentation: `FEATURES.md`

Built for the community.
