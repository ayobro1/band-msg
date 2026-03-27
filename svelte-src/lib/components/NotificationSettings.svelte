<script lang="ts">
  import { onMount } from 'svelte';
  import { initializeFirebase, subscribeToPushNotifications, unsubscribeFromPushNotifications, isPushSubscribed } from '../firebase';
  import { channelStore } from '../stores/channels';
  import { apiPost, apiGet } from '../utils/api';
  import Spinner from './Spinner.svelte';
  
  export let onClose: () => void;
  
  let isSubscribed = false;
  let isLoading = false;
  let notificationPermission: NotificationPermission = 'default';
  let error = '';
  let mutedChannelIds = new Set<string>();
  
  onMount(async () => {
    // Initialize Firebase
    await initializeFirebase();
    
    if ('Notification' in window) {
      notificationPermission = Notification.permission;
      isSubscribed = await isPushSubscribed();
    }
    
    await loadMutedChannels();
  });
  
  async function loadMutedChannels() {
    try {
      const res = await apiGet('/api/channels/current/mute');
      if (res.ok) {
        const ids = await res.json();
        mutedChannelIds = new Set(ids);
      }
    } catch (e) {
      console.error('Failed to load muted channels:', e);
    }
  }
  
  async function handleToggleNotifications() {
    isLoading = true;
    error = '';
    
    try {
      if (isSubscribed) {
        const result = await unsubscribeFromPushNotifications();
        if (result.success) {
          isSubscribed = false;
        } else {
          error = result.error || 'Failed to unsubscribe from notifications';
        }
      } else {
        const result = await subscribeToPushNotifications();
        if (result.success) {
          isSubscribed = true;
          notificationPermission = 'granted';
        } else {
          error = result.error || 'Failed to subscribe to notifications';
        }
      }
    } catch (err) {
      console.error('Notification toggle error:', err);
      error = 'An error occurred. Please try again.';
    }
    
    isLoading = false;
  }
  
  async function toggleChannelMute(channelId: string) {
    try {
      const isMuted = mutedChannelIds.has(channelId);
      const res = await apiPost(`/api/channels/${channelId}/mute`, { muted: !isMuted });
      
      if (res.ok) {
        if (isMuted) {
          mutedChannelIds.delete(channelId);
        } else {
          mutedChannelIds.add(channelId);
        }
        mutedChannelIds = new Set(mutedChannelIds);
      }
    } catch (err) {
      console.error('Failed to toggle channel mute:', err);
    }
  }
  
  async function testNotification() {
    if (notificationPermission !== 'granted') {
      error = 'Please enable notifications first';
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
      error = 'Failed to show test notification';
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center md:justify-center animate-fade-in"
  style="padding-top: env(safe-area-inset-top);"
  on:click={onClose}
>
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
      {#if error}
        <div class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
          {error}
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
          disabled={isLoading || notificationPermission === 'denied'}
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 shrink-0 {isSubscribed ? 'bg-white' : 'bg-white/20'} disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          aria-label="Toggle push notifications"
        >
          {#if isLoading}
            <span class="absolute inset-0 flex items-center justify-center">
              <Spinner size="sm" />
            </span>
          {:else}
            <span class="inline-block h-4 w-4 transform rounded-full bg-black transition-all duration-200 {isSubscribed ? 'translate-x-6' : 'translate-x-1'}"></span>
          {/if}
        </button>
      </div>

      {#if notificationPermission === 'denied'}
        <div class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
          <p class="text-xs text-white/50 leading-relaxed">
            Notifications are blocked. Enable them in your browser settings.
          </p>
        </div>
      {/if}

      {#if isSubscribed}
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
            {#each $channelStore.channels as channel}
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
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 shrink-0 hover:scale-105 active:scale-95 {mutedChannelIds.has(channel.id) ? 'bg-white/20' : 'bg-white'}"
                  aria-label="Toggle notifications for {channel.name}"
                >
                  <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-all duration-200 {mutedChannelIds.has(channel.id) ? 'translate-x-1' : 'translate-x-5'}"></span>
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
    </div>
  </div>
</div>
