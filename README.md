# Band Chat

A Discord-style real-time chat application for bands, built with Next.js, Bun, and Tailwind CSS.

## Features

- **Discord-like layout** — Three-column design with server sidebar, channel list, message area, and online members panel
- **Username system** — Welcome modal with display name persistence via localStorage, color-coded avatars per user
- **Real-time messaging** — Instant message delivery via WebSocket (Bun.serve)
- **Channel management** — Create custom channels with names and descriptions via an in-app modal
- **Message grouping** — Consecutive messages from the same user are compacted, just like Discord
- **Typing indicators** — See when other users are typing with animated dots
- **Online members list** — Collapsible right sidebar showing active users with presence indicators
- **Smart timestamps** — "Today at 3:45 PM" / "Yesterday at 10:00 AM" formatting
- **Channel descriptions** — Topics shown in the channel header
- **Loading & empty states** — Spinners, welcome messages, and helpful prompts
- **Polished UI** — Custom scrollbars, hover effects, and a dark theme matching Discord's aesthetic
- **Built-in backend + SQLite** — Next.js API routes with persistent local SQLite storage (`better-sqlite3`)
- **JWT authentication** — Stateless token-based auth with HTTP-only cookies
- **Admin approvals** — First registered user becomes admin; subsequent accounts require admin approval
- **Mobile PWA support** — Installable web app manifest, service worker caching, and offline fallback page

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Self-Hosted Runner Prerequisites

The `deploy` job runs on your own server. Before the first deploy, ensure the following are installed:

```bash
# SQLite native addon compilation tools (required by better-sqlite3)
sudo apt-get install -y build-essential python3

# Process manager
npm install -g pm2

# Version control
sudo apt-get install -y git
```

The deploy workflow will automatically install `build-essential` and `python3` if they are missing, provided the runner has passwordless `sudo` configured (required for automated deployment).

### 1. Install dependencies

```bash
bun install
```

### 2. Run the development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

Register an account to get started, then sign in. Non-admin accounts require admin approval before access. The app comes with three default channels (`general`, `setlists`, `practice`) and you can create more.

## Authentication & Admin

- Sign-in is required for all chat APIs and real-time message streams.
- The **first registered user** automatically becomes admin and is auto-approved.
- All subsequent registrations are created as pending and must be approved by the admin in-app.
- Authentication uses JWT tokens stored in an HTTP-only cookie.
- User/channel/message data is stored in SQLite (via `better-sqlite3`) and persists across restarts.
- Real-time events are delivered over WebSocket (port `WS_PORT`, default 3001).

### Configuration

- JWT secret: set `JWT_SECRET` in your environment (auto-generated during CI deploy if unset).
- Database location: set `DATABASE_PATH` (default: `./data/band-chat.db`).
- Cookie security: set `AUTH_COOKIE_SECURE` to `auto` (default), `true`, or `false`.
- WebSocket port: set `WS_PORT` and `NEXT_PUBLIC_WS_PORT` (default: `3001`).
- For local network HTTP testing (e.g., `http://10.x.x.x:3000`), set `AUTH_COOKIE_SECURE=false`.

## CI/CD

- On pull requests and pushes to `main`, GitHub Actions runs static code analysis (`eslint` + `tsc --noEmit`) and production build validation.
- Deployment on the self-hosted runner only starts after all quality checks pass.
- You can run manual deploys/rollbacks from Actions using **Run workflow** and setting `deploy_ref` to a branch, tag, or commit SHA.
- Deploys are serialized with a production concurrency lock, and a post-deploy smoke check (`http://127.0.0.1:3000`) must pass.

### Cloudflared Forwarding (`lazzycal.com`)

- Deploy job starts `cloudflared` only after successful install/build/start.
- Add GitHub secret: `CLOUDFLARE_TUNNEL_TOKEN`.
- In Cloudflare Tunnel, configure ingress/DNS so `lazzycal.com` points to `http://localhost:3000` on your VM tunnel.

## Data Persistence (SQLite)

- Default DB: `./data/band-chat.db` (change with `DATABASE_PATH`).
- Backup DB: `bun run backup:db`
- Restore DB: `bun run restore:db -- ./backups/your-backup-file.db`

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