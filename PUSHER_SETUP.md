# Pusher Setup Guide

This app now uses Pusher for real-time WebSocket communication, which works perfectly with Vercel's serverless deployment.

## Setup Steps

### 1. Create a Pusher Account

1. Go to https://dashboard.pusher.com/accounts/sign_up
2. Sign up for a free account (supports 200k messages/day and 100 concurrent connections)

### 2. Create a Channels App

1. After signing in, click "Create app"
2. Name it "Band Chat" (or whatever you prefer)
3. Select your cluster (e.g., `us2` for US East)
4. Choose "React" as the frontend and "Node.js" as the backend (doesn't matter much)
5. Click "Create app"

### 3. Get Your Credentials

On your app dashboard, go to "App Keys" tab. You'll see:
- `app_id`
- `key`
- `secret`
- `cluster`

### 4. Add to Local Environment

Add these to your `.env.local` file:

```bash
# Pusher (Server-side)
PUSHER_APP_ID=your_app_id
PUSHER_KEY=your_key
PUSHER_SECRET=your_secret
PUSHER_CLUSTER=us2

# Pusher (Client-side - exposed to browser)
VITE_PUSHER_KEY=your_key
VITE_PUSHER_CLUSTER=us2
```

Note: `VITE_PUSHER_KEY` is the same as `PUSHER_KEY` - it's safe to expose to the browser.

### 5. Add to Vercel Environment Variables

In your Vercel project settings:

1. Go to Settings → Environment Variables
2. Add all the Pusher variables above
3. Make sure they're set for Production, Preview, and Development
4. Redeploy your app

## What Changed

- ✅ Removed 2-second polling
- ✅ Real-time message updates via WebSocket
- ✅ Real-time reactions
- ✅ Real-time typing indicators
- ✅ Works with Vercel serverless deployment
- ✅ Free tier supports up to 200k messages/day

## Testing Locally

1. Add Pusher credentials to `.env.local`
2. Restart your dev server: `npm run dev`
3. Open two browser windows
4. Send a message in one - it should appear instantly in the other!

## Pusher Free Tier Limits

- 200,000 messages per day
- 100 concurrent connections
- Unlimited channels

This is more than enough for a small to medium-sized band chat app!
