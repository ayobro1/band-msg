# Band Chat

A Discord-style real-time chat application for bands, built with Next.js, Tailwind CSS, and PocketBase.

## Features

- Discord-like three-column layout (server sidebar, channel list, message area)
- Real-time messaging powered by PocketBase Realtime
- Channel-based conversations
- Dark theme matching Discord's aesthetic

## Getting Started

### Prerequisites

- Node.js 18+
- [PocketBase](https://pocketbase.io) (single-file backend)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up PocketBase

Download PocketBase from [pocketbase.io](https://pocketbase.io/docs/) and start it:

```bash
./pocketbase serve
```

Open the Admin UI at `http://127.0.0.1:8090/_/` and create two collections:

**channels**
| Field      | Type   | Notes            |
|------------|--------|------------------|
| name       | text   | e.g. "setlists"  |

**messages**
| Field      | Type     | Notes                       |
|------------|----------|-----------------------------|
| content    | text     |                             |
| profile_id | text     |                             |
| channel_id | relation | Single relation → channels  |

> **Tip:** PocketBase has built-in realtime support. Make sure to configure API rules on each collection to allow the desired access (e.g. allow list/view/create for all users).

### 3. Configure environment variables

Copy the example file and fill in your PocketBase URL:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your PocketBase URL (default is `http://127.0.0.1:8090`).

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
src/
  app/
    layout.tsx      # Root layout with dark theme
    page.tsx        # Main chat page with three-column layout
    globals.css     # Global styles (Discord dark palette)
  components/
    ChannelList.tsx # Channel sidebar component
    MessageArea.tsx # Message display and input with realtime
  lib/
    pocketbase.ts   # PocketBase client instance
    types.ts        # TypeScript interfaces for collections
```