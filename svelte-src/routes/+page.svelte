<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import MessageArea from '../lib/components/MessageArea.svelte';
  import UserList from '../lib/components/UserList.svelte';
  import ChannelSidebar from '../lib/components/ChannelSidebar.svelte';
  import AuthScreen from '../lib/components/AuthScreen.svelte';
  import { authStore } from '../lib/stores/auth';
  import { channelStore } from '../lib/stores/channels';
  import { messageStore } from '../lib/stores/messages';
  import { memberStore } from '../lib/stores/members';

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    // Check if user is authenticated
    await authStore.checkAuth();
    
    if ($authStore.user) {
      // Load initial data
      await channelStore.loadChannels();
      await memberStore.loadMembers();
      
      // Load messages for selected channel
      if ($channelStore.selectedChannelId) {
        await messageStore.loadMessages($channelStore.selectedChannelId);
      }
      
      // Start polling for updates
      refreshInterval = setInterval(async () => {
        if ($channelStore.selectedChannelId) {
          await messageStore.loadMessages($channelStore.selectedChannelId);
          await messageStore.loadTypingUsers($channelStore.selectedChannelId);
        }
        await memberStore.loadMembers();
      }, 2000);
    }
  });

  onDestroy(() => {
    if (refreshInterval) clearTimeout(refreshInterval);
  });
</script>

<svelte:head>
  <title>Band Chat - Discord Clone</title>
</svelte:head>

{#if !$authStore.user}
  <AuthScreen />
{:else}
  <div class="fixed inset-0 flex overflow-hidden bg-black text-white antialiased">
    <!-- Channel Sidebar -->
    <ChannelSidebar />
    
    <!-- Message Area -->
    <MessageArea />
    
    <!-- User List -->
    <UserList />
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #000000;
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    position: fixed;
    width: 100%;
    height: 100%;
    height: 100vh;
    height: 100dvh;
  }

  :global(html) {
    overflow: hidden;
    position: fixed;
    width: 100%;
    height: 100%;
    /* Support for iOS safe areas */
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }

  :global(*) {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    box-sizing: border-box;
  }

  :global(.scrollbar-hide) {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  :global(.scrollbar-hide::-webkit-scrollbar) {
    display: none;
  }

  @media (max-width: 768px) {
    :global(body) {
      overflow-x: hidden;
      touch-action: pan-y;
    }
  }

  /* iOS safe area support */
  @supports (padding: env(safe-area-inset-top)) {
    :global(body) {
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
