<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { notificationStore } from '../stores/notificationStore';
  import { convexChannelStore } from '../stores/convexChannels';
  import { convex } from '../convex';
  import { api } from '../../../convex/_generated/api';
  import { convexMessageStore } from '../stores/convexMessages';
  import Spinner from './Spinner.svelte';
  
  export let onClose: () => void;
  
  let debugInfo: any = null;
  
  onMount(async () => {
    console.log('[NotificationSettings] Component mounted');
    await notificationStore.init();
    await loadDebugInfo();
  });

  onDestroy(() => {
    notificationStore.setError(null);
  });
  
  async function loadDebugInfo() {
    try {
      let sessionToken = '';
      const unsubscribe = convexMessageStore.subscribe(state => {
        sessionToken = state.sessionToken;
      });
      unsubscribe();
      
      if (sessionToken) {
        debugInfo = await convex.query(api.debugNotifications.debugNotificationSetup, {
          sessionToken,
        });
        console.log('[NotificationSettings] Debug info:', debugInfo);
      }
    } catch (err) {
      console.error('[NotificationSettings] Failed to load debug info:', err);
    }
  }
  
  async function handleToggleNotifications() {
    await notificationStore.toggleNotifications();
    await loadDebugInfo(); // Reload debug info after toggle
  }
  
  async function toggleChannelMute(channelId: string) {
    await notificationStore.toggleChannelMute(channelId);
  }
  
  async function testNotification() {
    if ($notificationStore.permission !== 'granted') {
      notificationStore.setError('Please enable notifications first');
      return;
    }
    
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Band Chat', {
        body: 'Test notification - you\'re all set!',
        icon: '/notification-icon.png',
        badge: '/notification-icon.png',
        tag: 'test-notification',
        requireInteraction: false
      });
    } catch (err) {
      console.error('Test notification error:', err);
      notificationStore.setError('Failed to show test notification');
    }
  }
</script>

<div class="hidden md:block">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 z-[200]"
    style="padding-top: env(safe-area-inset-top);"
    on:click={onClose}
  ></div>
  <div class="fixed inset-0 z-[201] flex items-end md:items-center md:justify-center animate-fade-in" style="padding-top: env(safe-area-inset-top);">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-black border-t border-white/10 md:border md:rounded-2xl w-full md:max-w-md flex flex-col rounded-t-2xl max-h-[85vh] animate-slide-up md:animate-scale-in"
      on:click|stopPropagation
    >
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
      <h2 class="text-lg font-bold text-white">Notifications</h2>
      <button
        type="button"
        on:click={onClose}
        class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Close"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide" style="padding-bottom: max(1rem, env(safe-area-inset-bottom));">
      {#if $notificationStore.error}
        <div class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
          {$notificationStore.error}
        </div>
      {/if}

      <!-- Push Notifications Toggle -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-white mb-0.5">Push Notifications</h3>
          <p class="text-xs text-white/35 leading-relaxed">
            Get notified about new messages, even when the app is closed
          </p>
        </div>
        <button
          type="button"
          on:click={handleToggleNotifications}
          disabled={$notificationStore.isLoading || $notificationStore.permission === 'denied'}
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 shrink-0 {$notificationStore.isSubscribed ? 'bg-white' : 'bg-white/20'} disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          aria-label="Toggle push notifications"
        >
          {#if $notificationStore.isLoading}
            <span class="absolute inset-0 flex items-center justify-center">
              <Spinner size="sm" />
            </span>
          {:else}
            <span class="inline-block h-4 w-4 transform rounded-full bg-black transition-all duration-200 {$notificationStore.isSubscribed ? 'translate-x-6' : 'translate-x-1'}"></span>
          {/if}
        </button>
      </div>

      {#if $notificationStore.permission === 'denied'}
        <div class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
          <p class="text-xs text-white/50 leading-relaxed">
            Notifications are blocked. Enable them in your browser settings.
          </p>
        </div>
      {/if}

      {#if $notificationStore.isSubscribed}
        <div class="pt-4 border-t border-white/8">
          <button
            type="button"
            on:click={testNotification}
            class="w-full px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
          >
            Send Test Notification
          </button>
        </div>
        
        <!-- Channel-specific notifications -->
        <div class="pt-4 border-t border-white/8">
          <h4 class="text-sm font-semibold text-white mb-3">Channel Notifications</h4>
          <p class="text-xs text-white/40 mb-3">Choose which channels send you notifications</p>
          <div class="space-y-2">
            {#each $convexChannelStore.channels as channel}
              <div class="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
                <div class="flex items-center gap-2.5 flex-1 min-w-0">
                  {#if channel['isPrivate']}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/60 shrink-0">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  {:else}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/60 shrink-0">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  {/if}
                  <span class="text-sm text-white font-medium truncate">{channel.name}</span>
                </div>
                <button
                  type="button"
                  on:click={() => toggleChannelMute(channel.id)}
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 shrink-0 hover:scale-105 active:scale-95 {$notificationStore.mutedChannelIds.has(channel.id) ? 'bg-white/20' : 'bg-white'}"
                  aria-label="Toggle notifications for {channel.name}"
                >
                  <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-all duration-200 {$notificationStore.mutedChannelIds.has(channel.id) ? 'translate-x-1' : 'translate-x-5'}"></span>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Info -->
      <div class="pt-4 border-t border-white/8">
        <h4 class="text-xs font-semibold text-white/50 mb-2">You'll be notified about:</h4>
        <ul class="space-y-1.5 text-xs text-white/40">
          <li class="flex items-center gap-2">
            <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>New messages in your channels</span>
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Direct mentions and replies</span>
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Important announcements</span>
          </li>
        </ul>
      </div>

      <!-- Debug Info -->
      {#if debugInfo}
        <div class="pt-4 border-t border-white/8">
          <h4 class="text-xs font-semibold text-white/50 mb-2">Debug Info:</h4>
          <div class="text-xs text-white/40 space-y-1 font-mono">
            <div>Subscribed: {debugInfo.currentUser.hasSubscription ? 'Yes' : 'No'}</div>
            <div>Total Subscriptions: {debugInfo.totalSubscriptions}</div>
            <div>Total Users: {debugInfo.totalApprovedUsers}</div>
            {#if debugInfo.currentUser.subscription}
              <div class="text-green-400">Token: {debugInfo.currentUser.subscription.endpoint}</div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
  </div>
</div>
