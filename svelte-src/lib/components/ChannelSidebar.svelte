<script lang="ts">
  import { onMount } from 'svelte';
  import { convexChannelStore } from '../stores/convexChannels';
  import { convexMessageStore } from '../stores/convexMessages';
  import { authStore } from '../stores/auth';
  import { apiPost } from '../utils/api';
  import { convex } from '../convex';
  import { api } from '../../../convex/_generated/api';
  import type { Id } from '../../../convex/_generated/dataModel';
  import CreateChannel from './CreateChannel.svelte';
  import ChannelSettings from './ChannelSettings.svelte';

  let showCreateChannel = false;
  let showSettingsModal = false;
  let settingsChannel: any = null;
  let mutedChannelIds = new Set<string>();
  let showDeleteConfirm = false;
  let channelToDelete: any = null;
  let touchTimer: ReturnType<typeof setTimeout> | null = null;
  
  onMount(async () => {
    try {
      const res = await fetch('/api/channels/current/mute');
      if (res.ok) {
        const ids = await res.json();
        mutedChannelIds = new Set(ids);
      }
    } catch (e) {
      console.error(e);
    }
  });

  async function toggleMute(e: Event, channelId: string) {
    e.stopPropagation();
    try {
      const isMuted = mutedChannelIds.has(channelId);
      const res = await apiPost(`/api/channels/${channelId}/mute`, { muted: !isMuted });
      if (res.ok) {
        if (isMuted) {
          mutedChannelIds.delete(channelId);
        } else {
          mutedChannelIds.add(channelId);
        }
        mutedChannelIds = new Set(mutedChannelIds); // trigger reactivity
      }
    } catch (err) {
      console.error(err);
    }
  }

  function openSettings(e: Event, channel: any) {
    e.stopPropagation();
    settingsChannel = channel;
    showSettingsModal = true;
  }

  async function selectChannel(channelId: string) {
    console.log('[ChannelSidebar] Selecting channel:', channelId);
    convexChannelStore.selectChannel(channelId);
    try {
      await convexMessageStore.loadMessages(channelId);
      console.log('[ChannelSidebar] Messages loaded for channel:', channelId);
    } catch (error) {
      console.error('[ChannelSidebar] Error loading messages:', error);
    }
  }

  function handleContextMenu(e: MouseEvent, channel: any) {
    if ($authStore.user?.role !== 'admin') return;
    e.preventDefault();
    channelToDelete = channel;
    showDeleteConfirm = true;
  }

  function handleTouchStart(channel: any) {
    if ($authStore.user?.role !== 'admin') return;
    touchTimer = setTimeout(() => {
      channelToDelete = channel;
      showDeleteConfirm = true;
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  }

  function handleTouchEnd() {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
  }

  async function deleteChannel() {
    if (!channelToDelete) return;
    
    try {
      const sessionToken = $convexMessageStore.sessionToken;
      if (!sessionToken) {
        console.error('[ChannelSidebar] No session token');
        alert('No session token - please refresh the page');
        return;
      }

      console.log('[ChannelSidebar] Deleting channel:', channelToDelete.id);

      await convex.mutation(api.channels.remove, {
        channelId: channelToDelete.id as Id<"channels">,
        sessionToken
      });

      console.log('[ChannelSidebar] Channel deleted successfully');

      await convexChannelStore.loadChannels();
      if ($convexChannelStore.selectedChannelId === channelToDelete.id) {
        const firstChannel = $convexChannelStore.channels[0];
        if (firstChannel) {
          await selectChannel(firstChannel.id);
        }
      }
    } catch (err) {
      console.error('[ChannelSidebar] Failed to delete channel:', err);
      alert(`Failed to delete channel: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      showDeleteConfirm = false;
      channelToDelete = null;
    }
  }
</script>

<style>
  .channel-sidebar {
    display: none;
    background-color: #0a0a0a;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    flex-direction: column;
    width: 240px;
    min-width: 240px;
    max-width: 240px;
    flex-shrink: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  
  /* Only show on desktop (1024px+), hide on tablets and mobile */
  @media (min-width: 1024px) {
    .channel-sidebar {
      display: flex;
    }
  }
</style>

<div class="channel-sidebar">
  <!-- Server header -->
  <div class="h-14 flex items-center px-4 border-b border-white/10 shrink-0">
    <h2 class="text-[15px] font-semibold text-white">Band Chat</h2>
  </div>

  <!-- Channels list -->
  <div class="flex-1 overflow-y-auto py-3 scrollbar-hide">
    <div class="px-2">
      <div class="flex items-center justify-between px-2 mb-2">
        <h3 class="text-[11px] font-semibold text-white/25 uppercase tracking-widest">
          Text Channels
        </h3>
        {#if $authStore.user?.role === 'admin'}
          <button type="button" on:click|stopPropagation={() => showCreateChannel = true} class="p-1 -mr-1 text-white/30 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95 touch-manipulation" aria-label="Create Channel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        {/if}
      </div>
      <div class="space-y-0.5">
        {#each $convexChannelStore.channels as channel}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            role="button"
            tabindex="0"
            on:click={() => selectChannel(channel.id)}
            on:keydown={(e) => e.key === 'Enter' && selectChannel(channel.id)}
            on:contextmenu={(e) => handleContextMenu(e, channel)}
            on:touchstart={() => handleTouchStart(channel)}
            on:touchend={handleTouchEnd}
            on:touchcancel={handleTouchEnd}
            class="group flex items-center justify-between w-full px-2 py-1.5 rounded-lg transition-all duration-200 overflow-hidden hover:scale-[1.02] active:scale-98 {$convexChannelStore.selectedChannelId === channel.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'}"
          >
            <div class="flex items-center gap-2 truncate">
              {#if channel['isPrivate']}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-60 shrink-0">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              {/if}
              <span class="text-[14px] font-medium truncate">{channel.name}</span>
            </div>

            <div class="flex items-center opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0">
              {#if $authStore.user?.role === 'admin' && channel['isPrivate']}
                <button 
                  on:click={(e) => openSettings(e, channel)}
                  class="p-1 rounded mix-blend-normal transition-all duration-200 hover:scale-110 active:scale-95 text-white/40 hover:text-white"
                  aria-label="Channel Settings"
                  title="Channel Settings"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              {/if}
              <button 
                on:click={(e) => toggleMute(e, channel.id)}
                class="p-1 rounded mix-blend-normal transition-all duration-200 hover:scale-110 active:scale-95 {mutedChannelIds.has(channel.id) ? 'text-white opacity-100' : 'text-white/40 hover:text-white'}"
                aria-label={mutedChannelIds.has(channel.id) ? "Unmute Channel" : "Mute Channel"}
                title={mutedChannelIds.has(channel.id) ? "Unmute Channel" : "Mute Channel"}
              >
                {#if mutedChannelIds.has(channel.id)}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                {:else}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                {/if}
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

{#if showCreateChannel}
  <CreateChannel onClose={() => showCreateChannel = false} />
{/if}

{#if showSettingsModal && settingsChannel}
  <ChannelSettings 
    channelId={settingsChannel.id}
    channelName={settingsChannel.name}
    onClose={() => {
      showSettingsModal = false;
      settingsChannel = null;
    }}
  />
{/if}

{#if showDeleteConfirm && channelToDelete}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center" on:click={() => { showDeleteConfirm = false; channelToDelete = null; }}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 max-w-sm mx-4" on:click|stopPropagation>
      <h3 class="text-lg font-bold text-white mb-2">Delete Channel</h3>
      <p class="text-sm text-white/60 mb-4">
        Are you sure you want to delete <span class="text-white font-semibold">#{channelToDelete.name}</span>? This action cannot be undone.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          on:click={() => { showDeleteConfirm = false; channelToDelete = null; }}
          class="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={deleteChannel}
          class="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors text-sm font-medium"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}
