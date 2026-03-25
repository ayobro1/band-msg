<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import MessageArea from '../lib/components/MessageArea.svelte';
  import UserList from '../lib/components/UserList.svelte';
  import ChannelSidebar from '../lib/components/ChannelSidebar.svelte';
  import AuthScreen from '../lib/components/AuthScreen.svelte';
  import PWAInstallGuide from '../lib/components/PWAInstallGuide.svelte';
  import UsernameSetup from '../lib/components/UsernameSetup.svelte';
  import PendingSetup from '../lib/components/PendingSetup.svelte';
  import ProfileDrawer from '../lib/components/ProfileDrawer.svelte';
  import { authStore } from '../lib/stores/auth';
  import { convexChannelStore } from '../lib/stores/convexChannels';
  import { convexMessageStore } from '../lib/stores/convexMessages';
  import { memberStore } from '../lib/stores/members';
  import { themeStore } from '../lib/stores/theme';
  import { pusherStore } from '../lib/stores/pusher';
  import { getBrowserUserAgentHash } from '../lib/userAgentHash';
  import { apiPost } from '../lib/utils/api';

  export let data;

  let showProfileDrawer = false;

  let showPWAGuide = false;
  let showUsernameSetup = false;
  let heartbeatInterval: any;
  let approvalPollInterval: any;
  let lastChannelId = '';

  // Watch for channel changes ONLY (not store updates)
  $: {
    const channelId = $convexChannelStore.selectedChannelId;
    const shouldLoadSelectedChannel =
      !!channelId &&
      $authStore.user?.status === 'approved' &&
      !!$convexMessageStore.sessionToken &&
      (
        channelId !== lastChannelId ||
        ($convexMessageStore.messages.length === 0 && !$convexMessageStore.isLoading)
      );

    if (shouldLoadSelectedChannel && channelId) {
      lastChannelId = channelId;
      convexMessageStore.loadMessages(channelId);
      convexMessageStore.subscribeToTyping(channelId);
    } else if (!channelId && lastChannelId) {
      lastChannelId = '';
      convexMessageStore.unsubscribeFromTyping();
      convexMessageStore.clearMessages();
    }
  }

  async function initApp() {
    // Connect to Pusher for real-time updates
    pusherStore.connect();

    // Load initial data from Convex
    await Promise.all([
      convexChannelStore.loadChannels(),
      memberStore.loadMembers()
    ]);

    // Start heartbeat to keep user online
    if (browser) {
      const { convex } = await import('../lib/convex');
      const { api } = await import('../../convex/_generated/api');

      heartbeatInterval = setInterval(async () => {
        if (data.sessionToken) {
          try {
            // Update Convex presence
            await convex.mutation(api.auth.heartbeat, {
              sessionToken: data.sessionToken,
              userAgentHash: await getBrowserUserAgentHash()
            });
            // Also update SQL presence so member list shows correct status
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
    // Initialize theme first
    themeStore.init();

    if (data.sessionToken) {
      convexMessageStore.setSessionToken(data.sessionToken);
      convexChannelStore.setSessionToken(data.sessionToken);
    }

    // Check if user is authenticated
    await authStore.checkAuth();

    // Only show PWA guide if user is NOT logged in (first time visitor)
    if (!$authStore.user && browser) {
      const hasSeenPWAGuide = localStorage.getItem('hasSeenPWAGuide');
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone === true;

      if (!hasSeenPWAGuide && !isStandalone) {
        showPWAGuide = true;
        return;
      }
    }

    // Only init app if user is approved
    if ($authStore.user && $authStore.user.status === 'approved') {
      await initApp();
    }
    // Pending users see PendingSetup component in template
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
{:else if !$authStore.user}
  <AuthScreen />
{:else if $authStore.user?.status === 'pending'}
  <PendingSetup />
{:else}
  <div class="app-shell flex overflow-hidden bg-black text-white antialiased">
    <!-- Channel Sidebar -->
    <ChannelSidebar />

    <!-- Message Area -->
    <MessageArea />

    <!-- User List -->
    <UserList on:selectUser={(e) => { if (e.detail.isOwnProfile) showProfileDrawer = true; }} />
  </div>

  <!-- Profile Drawer -->
  <ProfileDrawer
    open={showProfileDrawer}
    onClose={() => showProfileDrawer = false}
  />
{/if}
