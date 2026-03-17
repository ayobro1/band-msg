<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import MessageArea from '../lib/components/MessageArea.svelte';
  import UserList from '../lib/components/UserList.svelte';
  import ChannelSidebar from '../lib/components/ChannelSidebar.svelte';
  import AuthScreen from '../lib/components/AuthScreen.svelte';
  import PWAInstallGuide from '../lib/components/PWAInstallGuide.svelte';
  import UsernameSetup from '../lib/components/UsernameSetup.svelte';
  import { authStore } from '../lib/stores/auth';
  import { convexChannelStore } from '../lib/stores/convexChannels';
  import { convexMessageStore } from '../lib/stores/convexMessages';
  import { memberStore } from '../lib/stores/members';
  import { themeStore } from '../lib/stores/theme';
  import { pusherStore } from '../lib/stores/pusher';

  export let data;

  let showPWAGuide = false;
  let showUsernameSetup = false;
  let heartbeatInterval: any;
  let approvalPollInterval: any;

  // Reactive: Load messages when selected channel changes
  $: if ($convexChannelStore.selectedChannelId && $authStore.user?.status === 'approved' && $convexMessageStore.sessionToken) {
    console.log('[Page] Channel changed, loading messages for:', $convexChannelStore.selectedChannelId);
    convexMessageStore.loadMessages($convexChannelStore.selectedChannelId);
  }

  async function initApp() {
    // Connect to Pusher for real-time updates
    pusherStore.connect();

    // Load initial data from Convex
    console.log('[Page] Loading channels from Convex');
    await convexChannelStore.loadChannels();
    console.log('[Page] Channels loaded:', $convexChannelStore.channels);

    await memberStore.loadMembers();

    // Load messages for selected channel
    if ($convexChannelStore.selectedChannelId) {
      console.log('[Page] Loading messages for channel:', $convexChannelStore.selectedChannelId);
      await convexMessageStore.loadMessages($convexChannelStore.selectedChannelId);
    }

    // Start heartbeat to keep user online
    if (browser) {
      const { convex } = await import('../lib/convex');
      const { api } = await import('../../convex/_generated/api');

      heartbeatInterval = setInterval(async () => {
        if (data.sessionToken) {
          try {
            // Update Convex presence
            await convex.mutation(api.auth.heartbeat, { sessionToken: data.sessionToken });
            // Also update SQL presence so member list shows correct status
            await fetch('/api/presence', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'online' })
            });
          } catch (error) {
            console.error('[Page] Heartbeat failed:', error);
          }
        }
      }, 30000);
    }

    // Start polling for member status updates
    memberStore.startPolling();
  }

  function startApprovalPolling() {
    if (approvalPollInterval) return;
    approvalPollInterval = setInterval(async () => {
      await authStore.checkAuth();
      if ($authStore.user?.status === 'approved') {
        stopApprovalPolling();
        await initApp();
      }
    }, 3000);
  }

  function stopApprovalPolling() {
    if (approvalPollInterval) {
      clearInterval(approvalPollInterval);
      approvalPollInterval = null;
    }
  }

  onMount(async () => {
    // Set session token for Convex FIRST before anything else
    if (data.sessionToken) {
      console.log('[Page] Setting session token for Convex');
      convexMessageStore.setSessionToken(data.sessionToken);
      convexChannelStore.setSessionToken(data.sessionToken);
      
      // Wait a tick to ensure stores have updated
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Initialize theme
    themeStore.init();

    // Check if user is authenticated
    await authStore.checkAuth();

    // Only show PWA guide if:
    // 1. User is NOT logged in (first time visitor)
    // 2. Haven't seen the guide before
    // 3. Not already installed as PWA
    if (!$authStore.user && browser) {
      const hasSeenPWAGuide = localStorage.getItem('hasSeenPWAGuide');
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone === true;

      if (!hasSeenPWAGuide && !isStandalone) {
        showPWAGuide = true;
        return;
      }
    }

    // Check if user needs to set username
    if ($authStore.user?.needsUsernameSetup && $authStore.user?.status === 'approved') {
      showUsernameSetup = true;
      return;
    }

    if ($authStore.user?.status === 'pending') {
      startApprovalPolling();
    } else if ($authStore.user && $authStore.user.status === 'approved') {
      await initApp();
    }
  });

  onDestroy(() => {
    pusherStore.disconnect();
    stopApprovalPolling();
    memberStore.stopPolling();
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  });

  function handlePWAGuideComplete() {
    if (browser) {
      localStorage.setItem('hasSeenPWAGuide', 'true');
    }
    showPWAGuide = false;
    // Now check auth
    authStore.checkAuth();
  }

  async function handleUsernameSetupComplete() {
    showUsernameSetup = false;
    // Reload user data
    await authStore.checkAuth();

    if ($authStore.user?.status === 'approved') {
      await initApp();
    }
  }
</script>

<svelte:head>
  <title>Band Chat - Discord Clone</title>
</svelte:head>

{#if showPWAGuide}
  <PWAInstallGuide on:skip={handlePWAGuideComplete} on:done={handlePWAGuideComplete} />
{:else if showUsernameSetup && $authStore.user?.status === 'approved'}
  <UsernameSetup
    suggestedUsername={$authStore.user?.username || ''}
    on:complete={handleUsernameSetupComplete}
  />
{:else if !$authStore.user || $authStore.user?.status === 'pending'}
  <AuthScreen on:pending={startApprovalPolling} />
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
