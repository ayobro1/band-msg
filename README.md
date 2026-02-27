# Band Chat

A Discord-style real-time chat application for bands, built with Next.js, Tailwind CSS, and Supabase.

## Features

- Discord-like three-column layout (server sidebar, channel list, message area)
- Real-time messaging powered by Supabase Realtime
- Channel-based conversations
- Dark theme matching Discord's aesthetic

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier works)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

Create a new Supabase project, then create two tables:

**channels**
| Column     | Type        | Notes          |
|------------|-------------|----------------|
| id         | uuid        | Primary key    |
| name       | text        | e.g. "setlists"|
| created_at | timestamptz | Default now()  |

**messages**
| Column      | Type        | Notes                          |
|-------------|-------------|--------------------------------|
| id          | uuid        | Primary key                    |
| content     | text        |                                |
| profile_id  | text        |                                |
| channel_id  | uuid        | Foreign key → channels.id      |
| inserted_at | timestamptz | Default now()                  |

> **Tip:** Enable **Realtime** on the `messages` table in Supabase so that messages appear instantly for all users.

### 3. Configure environment variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase project URL and anon key (found in your Supabase dashboard under Settings → API).

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
    supabase.ts     # Supabase client instance
    types.ts        # TypeScript interfaces for database tables
```