# Bug Reports

> **Generated:** (Run `node scripts/fetch-reports.mjs` to update)
> **Source:** [Convex Dashboard](https://dashboard.convex.dev)

---

## Submit a Report

Submit a bug report directly in chat:
```
!report Describe your issue here...
```

---

## Quick Reference

### Common Issues to Fix

1. **Thread replies on desktop** - Clicking thread icon doesn't open panel on desktop
2. **Typing indicators** - Need to deploy `npx convex deploy`
3. **Data loading on first load** - Race condition in channel selection

### Commands

```bash
# Deploy Convex functions
npx convex deploy

# Fetch reports
node scripts/fetch-reports.mjs

# View Convex data
npx convex data
```

### Files to Check

| Issue | Location |
|-------|----------|
| Thread panel | `svelte-src/lib/components/ThreadPanel.svelte` |
| Channel sidebar | `svelte-src/lib/components/ChannelSidebar.svelte` |
| Message area | `svelte-src/lib/components/MessageArea.svelte` |
| Notifications | `svelte-src/lib/stores/notificationStore.ts` |
| Auth screen | `svelte-src/lib/components/AuthScreen.svelte` |
| Profile drawer | `svelte-src/lib/components/ProfileDrawer.svelte` |
