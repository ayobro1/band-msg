# Band Chat

A Discord-style real-time chat application for bands, built with Next.js and Tailwind CSS.

## Features

- Discord-like three-column layout (server sidebar, channel list, message area)
- Real-time messaging via Server-Sent Events (SSE)
- Channel-based conversations
- Dark theme matching Discord's aesthetic
- **Zero-config backend** — data is stored in-memory with built-in Next.js API routes, so there's nothing extra to install or run

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

That's it! The app comes with three default channels (`general`, `setlists`, `practice`) and is ready to use immediately. Messages are stored in memory, so they reset when the server restarts.

## Project Structure

```
src/
  app/
    api/
      channels/route.ts   # GET channels
      messages/route.ts    # GET/POST messages
      messages/stream/route.ts  # SSE real-time stream
    layout.tsx             # Root layout with dark theme
    page.tsx               # Main chat page with three-column layout
    globals.css            # Global styles (Discord dark palette)
  components/
    ChannelList.tsx        # Channel sidebar component
    MessageArea.tsx        # Message display and input with real-time
  lib/
    store.ts               # In-memory data store
    types.ts               # TypeScript interfaces
```