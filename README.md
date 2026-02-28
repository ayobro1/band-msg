# Band Chat

A Discord-style real-time chat application for bands, built with Next.js and Tailwind CSS.

## Features

- **Discord-like layout** — Three-column design with server sidebar, channel list, message area, and online members panel
- **Username system** — Welcome modal with display name persistence via localStorage, color-coded avatars per user
- **Real-time messaging** — Instant message delivery via Server-Sent Events (SSE)
- **Channel management** — Create custom channels with names and descriptions via an in-app modal
- **Message grouping** — Consecutive messages from the same user are compacted, just like Discord
- **Typing indicators** — See when other users are typing with animated dots
- **Online members list** — Collapsible right sidebar showing active users with presence indicators
- **Smart timestamps** — "Today at 3:45 PM" / "Yesterday at 10:00 AM" formatting
- **Channel descriptions** — Topics shown in the channel header
- **Loading & empty states** — Spinners, welcome messages, and helpful prompts
- **Polished UI** — Custom scrollbars, smooth animations, hover effects, and a dark theme matching Discord's aesthetic
- **Built-in backend + SQLite** — Next.js API routes with persistent local SQLite storage
- **Secure sign-in** — Username/password authentication with server-side sessions
- **Admin approvals** — New accounts require admin approval before chat access

## Getting Started

### Prerequisites

- Node.js 18+

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

Register an account to get started, then sign in. Non-admin accounts require admin approval before access. The app comes with three default channels (`general`, `setlists`, `practice`) and you can create more.

## Authentication & Admin

- Sign-in is required for all chat APIs and real-time message streams.
- The admin username defaults to `ayobro1` (change with `ADMIN_USERNAME`).
- Admin password verification uses SHA-256 hash via `ADMIN_PASSWORD_HASH_SHA256`.
- Default admin hash is set to `2aa74396c96223245f9dfd80a8fc946e7117f87d1707c99013f904f74e20ec77`.
- The admin account is auto-seeded and approved on startup.
- All other registrations are created as pending and must be approved by an admin in-app.
- User/session/account/channel/message data is stored in SQLite and persists across restarts.

### Admin Credential Settings

- Username: set `ADMIN_USERNAME` in your environment.
- Password hash: set `ADMIN_PASSWORD_HASH_SHA256` in your environment.
- Database location: set `DATABASE_PATH` (default: `./data/band-chat.db`).
- To generate a SHA-256 password hash:

```bash
echo -n "your-password" | sha256sum
```

## CI/CD

- On pull requests and pushes to `main`, GitHub Actions runs static code analysis (`eslint` + `tsc --noEmit`) and production build validation.
- Deployment on the self-hosted runner only starts after all quality checks pass.

### Cloudflared Forwarding (`lazzycal.com`)

- Deploy job starts `cloudflared` only after successful install/build/start.
- Add GitHub secret: `CLOUDFLARE_TUNNEL_TOKEN`.
- In Cloudflare Tunnel, configure ingress/DNS so `lazzycal.com` points to `http://localhost:3000` on your VM tunnel.

## Data Persistence (SQLite)

- Default DB: `./data/band-chat.db` (change with `DATABASE_PATH`).
- Backup DB: `npm run backup:db`
- Restore DB: `npm run restore:db -- ./backups/your-backup-file.db`

## Project Structure

```
src/
  app/
    api/
      channels/route.ts          # GET/POST channels
      messages/route.ts           # GET/POST messages, PATCH typing
      messages/stream/route.ts    # SSE real-time stream
      users/route.ts              # GET/POST active users
    layout.tsx                    # Root layout with dark theme
    page.tsx                      # Main chat page with layout and state
    globals.css                   # Global styles, scrollbars, animations
  components/
    ChannelList.tsx               # Channel sidebar with create button
    CreateChannelModal.tsx        # Modal for creating new channels
    MemberList.tsx                # Online members sidebar
    MessageArea.tsx               # Message display, input, typing indicators
    UsernameModal.tsx             # Welcome modal for setting display name
  lib/
    store.ts                      # SQLite-backed store + pub/sub
    db.ts                         # SQLite schema/bootstrap
    types.ts                      # TypeScript interfaces
    utils.ts                      # Avatar colors, timestamp formatting
```