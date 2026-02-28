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
- **Zero-config backend** — Data is stored in-memory with built-in Next.js API routes, so there's nothing extra to install or run

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

Enter a display name to get started. The app comes with three default channels (`general`, `setlists`, `practice`) and you can create more. Messages are stored in memory, so they reset when the server restarts.

## CI/CD

- On every pull request to `main`, GitHub Actions runs lint and production build checks.
- On push to `main`, the same quality checks run first, then deployment proceeds over SSH if they pass.
- You can also run a manual deployment from GitHub Actions and choose a specific `deploy_ref` (branch/tag/SHA).
- Manual runs support rollback by providing `rollback_ref`, which takes priority over `deploy_ref`.

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
    store.ts                      # In-memory data store with pub/sub
    types.ts                      # TypeScript interfaces
    utils.ts                      # Avatar colors, timestamp formatting
```