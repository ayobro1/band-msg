# Approval Flow Notes

This document is historical incident context, not a current architecture guide.

## What It Was About

This repo previously had approval-flow confusion caused by mixed SQL and Convex reads/writes during a migration period. Older notes in this file referred to `svelte-src/` routes and treated Convex as the source of truth for approval state.

## Current Interpretation

- The active app now lives in `src/`
- Approval and auth behavior should be evaluated against the current hybrid app, not the older `svelte-src/` flow
- If this file conflicts with the README, trust the README

## Practical Guidance

Use this file only as background on a past mismatch between backends. Do not use it as a checklist for the current app structure or deployment path.
