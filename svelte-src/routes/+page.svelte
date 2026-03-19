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

  // Reactive: Load messages when selected channel changes (only once per channel, not when sessionToken changes)
  let previousChannelId = '';
  $: if ($convexChannelStore.selectedChannelId && $authStore.user?.status === 'approved' && $convexMessageStore.sessionToken && $convexChannelStore.selectedChannelId !== previousChannelId) {
    previousChannelId = $convexChannelStore.selectedChannelId;
    console.log('[Page] Channel changed, loading messages for:', $convexChannelStore.selectedChannelId);
    console.log('[Page] Session token available:', !!$convexMessageStore.sessionToken);
    console.log('[Page] User status:', $authStore.user?.status);
    convexMessageStore.loadMessages($convexChannelStore.selectedChannelId);
  } else {
    console.log('[Page] Message loading skipped:', {
      hasChannel: !!$convexChannelStore.selectedChannelId,
      isApproved: $authStore.user?.status === 'approved',
      hasToken: !!$convexMessageStore.sessionToken,
      channelChanged: $convexChannelStore.selectedChannelId !== previousChannelId
    });
  }

  async function initApp() {
    console.log('[Page] initApp started');
    
    // Connect to Pusher for real-time updates
    pusherStore.connect();

    // Load initial data from Convex
    console.log('[Page] Loading channels from Convex');
    await convexChannelStore.loadChannels();
    console.log('[Page] Channels loaded:', $convexChannelStore.channels.length, 'channels');

    await memberStore.loadMembers();
    console.log('[Page] Members loaded');

    // Load messages for selected channel
    if ($convexChannelStore.selectedChannelId) {
      console.log('[Page] Loading messages for channel:', $convexChannelStore.selectedChannelId);
      console.log('[Page] Session token available:', !!$convexMessageStore.sessionToken);
      convexMessageStore.subscribeToTyping($convexChannelStore.selectedChannelId);
      await convexMessageStore.loadMessages($convexChannelStore.selectedChannelId);
    } else {
      console.log('[Page] No channel selected, waiting for channel selection...');
      // Fallback: try again after a short delay in case channels are still loading
      setTimeout(async () => {
        if ($convexChannelStore.selectedChannelId) {
          console.log('[Page] Loading messages after fallback delay');
          await convexMessageStore.loadMessages($convexChannelStore.selectedChannelId);
        }
      }, 500);
    }
    
    console.log('[Page] initApp completed');

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
            const { apiPost } = await import('../lib/utils/api');
            await apiPost('/api/presence', { status: 'online' });
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
    console.log('[Page] onMount started');
    console.log('[Page] data.sessionToken exists:', !!data.sessionToken);
    
    // Set session token for Convex FIRST before anything else
    if (data.sessionToken) {
      console.log('[Page] Setting session token for Convex');
      convexMessageStore.setSessionToken(data.sessionToken);
      convexChannelStore.setSessionToken(data.sessionToken);
      
      // Wait a tick to ensure stores have updated
      await new Promise(resolve => setTimeout(resolve, 0));
      console.log('[Page] Session token set in stores');
    } else {
      console.log('[Page] No session token in data');
    }

    // Initialize theme
    themeStore.init();

    // Check if user is authenticated
    console.log('[Page] Checking auth...');
    await authStore.checkAuth();
    console.log('[Page] Auth check complete, user:', $authStore.user?.username, 'status:', $authStore.user?.status);

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
    convexChannelStore.cleanup();
    convexMessageStore.cleanup();
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
  <div class="w-full h-screen flex overflow-hidden bg-black text-white antialiased">
    <!-- Channel Sidebar -->
    <ChannelSidebar />

    <!-- Message Area -->
    <MessageArea />

    <!-- User List -->
    <UserList />
  </div>
{/if}
