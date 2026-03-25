# Convex Migration Status

This file is historical context, not the source of truth for the current app architecture.

## Current Truth

- The active SvelteKit app lives in `src/`
- Neon/Postgres is still the main persistence layer for the active app surface
- Convex is active in the repo, but the app is still hybrid rather than fully migrated
- `svelte-src/` references in older notes reflect migration residue, not the current primary app tree

## What This Means

It is not accurate to describe the current app as:

- "messages and threads are fully migrated to Convex"
- "everything except auth is legacy SQL"
- "`svelte-src/` is the current production app"

The safer framing is:

- SvelteKit + SQL still power most of the active app
- Convex is integrated for newer backend flows and bridging work
- The repo is mid-cleanup, not post-migration
