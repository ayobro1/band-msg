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
  import { channelStore } from '../lib/stores/channels';
  import { messageStore } from '../lib/stores/messages';
  import { memberStore } from '../lib/stores/members';
  import { themeStore } from '../lib/stores/theme';

  let refreshInterval: ReturnType<typeof setInterval> | null = null;
  let showPWAGuide = false;
  let showUsernameSetup = false;

  onMount(async () => {
    // Initialize theme
    themeStore.init();
    
    // Check if user is authenticated first
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
    if ($authStore.user?.needsUsernameSetup) {
      showUsernameSetup = true;
      return;
    }
    
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
    if (refreshInterval) clearInterval(refreshInterval);
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
</script>

<svelte:head>
  <title>Band Chat - Discord Clone</title>
</svelte:head>

{#if showPWAGuide}
  <PWAInstallGuide on:skip={handlePWAGuideComplete} on:done={handlePWAGuideComplete} />
{:else if showUsernameSetup}
  <UsernameSetup 
    suggestedUsername={$authStore.user?.username || ''} 
    on:complete={handleUsernameSetupComplete} 
  />
{:else if !$authStore.user}
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
