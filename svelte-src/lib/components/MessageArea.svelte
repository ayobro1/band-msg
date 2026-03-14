<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import { Drawer } from 'vaul-svelte';
  import { authStore } from '../stores/auth';
  import { channelStore } from '../stores/channels';
  import { messageStore } from '../stores/messages';
  import { memberStore } from '../stores/members';
  import MessageBubble from './MessageBubble.svelte';
  import AdminPanel from './AdminPanel.svelte';
  import Calendar from './Calendar.svelte';
  import NotificationSettings from './NotificationSettings.svelte';
  import Avatar from './Avatar.svelte';
  import Input from './Input.svelte';
  
  let messageInput = '';
  let messageContainer: HTMLDivElement;
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  let showAdminPanel = false;
  let showCalendar = false;
  let showMobileChannels = false;
  let showMobileMembers = false;
  let showNotificationSettings = false;

  $: selectedChannel = $channelStore.channels.find(
    c => c.id === $channelStore.selectedChannelId
  );

  // Load messages when channel changes
  $: if ($channelStore.selectedChannelId) {
    messageStore.loadMessages($channelStore.selectedChannelId);
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (messageContainer) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }
    }, 50);
  }

  afterUpdate(() => {
    scrollToBottom();
  });

  async function handleSend() {
    if (!messageInput.trim() || !$channelStore.selectedChannelId) return;
    
    // Stop typing indicator
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
    await messageStore.stopTyping($channelStore.selectedChannelId);
    
    const result = await messageStore.sendMessage(
      $channelStore.selectedChannelId,
      messageInput
    );
    
    if (result.success) {
      messageInput = '';
    }
  }

  async function handleTyping() {
    if (!$channelStore.selectedChannelId || !messageInput.trim()) return;
    
    await messageStore.startTyping($channelStore.selectedChannelId);
    
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(async () => {
      if ($channelStore.selectedChannelId) {
        await messageStore.stopTyping($channelStore.selectedChannelId);
      }
      typingTimeout = null;
    }, 3000);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function selectChannel(channelId: string) {
    channelStore.selectChannel(channelId);
    await messageStore.loadMessages(channelId);
    showMobileChannels = false;
  }

  function getAvatarColor(name: string): string {
    const colors = ['#7c3aed', '#2563eb', '#e11d48', '#059669', '#d97706', '#db2777'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  const statusColors: Record<string, string> = {
    online: 'bg-white',
    idle: 'bg-white/60',
    dnd: 'bg-white/40',
    offline: 'bg-white/20',
  };

  const statusLabels: Record<string, string> = {
    online: 'Online',
    idle: 'Away',
    dnd: 'In Session',
    offline: 'Offline',
  };

  $: grouped = {
    online: $memberStore.members.filter(u => u.presenceStatus === 'online'),
    idle: $memberStore.members.filter(u => u.presenceStatus === 'idle'),
    dnd: $memberStore.members.filter(u => u.presenceStatus === 'dnd'),
    offline: $memberStore.members.filter(u => u.presenceStatus === 'offline'),
  };
</script>

<div class="flex-1 flex flex-col min-w-0 bg-black" style="padding-top: env(safe-area-inset-top);">
  <!-- Header -->
  <div class="h-14 flex items-center justify-between px-4 border-b border-white/10 shrink-0 relative z-10">
    <div class="flex items-center gap-3">
      <!-- Mobile channels button -->
      <button
        type="button"
        on:click={() => showMobileChannels = true}
        class="md:hidden p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 touch-manipulation"
        aria-label="Open channels"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      
      <div class="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-lg text-black">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div>
        <h3 class="text-[15px] font-semibold text-white tracking-tight leading-tight">
          #{selectedChannel?.name || 'general'}
        </h3>
        <p class="text-[11px] text-white/30 leading-tight hidden sm:block">
          {selectedChannel?.description || 'Band chat'}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-1 relative">
      <button
        type="button"
        on:click|stopPropagation={() => { showNotificationSettings = true; }}
        class="p-2 rounded-lg transition-colors text-white/40 hover:text-white hover:bg-white/5 touch-manipulation cursor-pointer"
        title="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </button>
      <button
        type="button"
        on:click|stopPropagation={() => { showCalendar = true; }}
        class="p-2 rounded-lg transition-colors text-white/40 hover:text-white hover:bg-white/5 touch-manipulation cursor-pointer"
        title="Calendar"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      {#if $authStore.user?.role === 'admin'}
        <button
          type="button"
          on:click|stopPropagation={() => { showAdminPanel = true; }}
          class="p-2 rounded-lg transition-colors text-white/40 hover:text-white hover:bg-white/5 touch-manipulation cursor-pointer"
          title="Admin Panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      {/if}
      <button
        type="button"
        on:click={() => {
          if (window.innerWidth < 768) {
            showMobileMembers = true;
          } else {
            memberStore.toggleUserList();
          }
        }}
        class="p-2 rounded-lg transition-colors {$memberStore.showUserList ? 'text-white bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}"
        title="Members"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div bind:this={messageContainer} class="flex-1 overflow-y-auto py-3 scrollbar-hide bg-black">
    <!-- Welcome message -->
    <div class="px-4 md:px-5 mb-3 flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center shrink-0 text-white">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div class="min-w-0">
        <h2 class="text-base font-bold text-white leading-tight">
          #{selectedChannel?.name || 'general'}
        </h2>
        <p class="text-xs text-white/30 truncate">
          {selectedChannel?.description || 'Talk, plan, and make music together.'}
        </p>
      </div>
    </div>

    <div class="h-px bg-white/6 mx-4 mb-3"></div>

    {#each $messageStore.messages as message, i}
      {@const prev = i > 0 ? $messageStore.messages[i - 1] : null}
      {@const showHeader = !prev || prev.author !== message.author || message.createdAt - prev.createdAt > 300000}
      <MessageBubble {message} {showHeader} />
    {/each}

    {#if $messageStore.typingUsers.length > 0}
      <div class="px-4 md:px-5 mt-2">
        <p class="text-sm text-white/40">
          {$messageStore.typingUsers.join(', ')} {$messageStore.typingUsers.length === 1 ? 'is' : 'are'} typing...
        </p>
      </div>
    {/if}

    <div class="h-4"></div>
  </div>

  <!-- Input area -->
  <div class="px-4 pb-3 md:pb-4 shrink-0">
    <div class="relative flex items-end gap-2">
      <div class="flex-1">
        <Input
          type="text"
          bind:value={messageInput}
          on:input={handleTyping}
          on:keydown={handleKeyDown}
          placeholder="Message the band..."
          maxlength={2000}
          autocomplete="off"
        />
      </div>
      <button
        type="button"
        on:click={handleSend}
        disabled={!messageInput.trim()}
        class="p-3 rounded-xl transition-all shrink-0 {messageInput.trim() ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 text-white/20 cursor-not-allowed'}"
        aria-label="Send message"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  </div>

  <!-- User panel at bottom -->
  <div class="h-12 flex items-center gap-2.5 px-4 bg-black border-t border-white/8 shrink-0" style="padding-bottom: env(safe-area-inset-bottom);">
    <div class="relative">
      <Avatar alt={$authStore.user?.username || ''} size="sm" status={null} />
      <div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-black"></div>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-[13px] font-medium text-white truncate">{$authStore.user?.username}</p>
    </div>
    <span class="text-[10px] text-white/25 uppercase tracking-wider font-medium">{$authStore.user?.role}</span>
  </div>
</div>

{#if showAdminPanel}
  <AdminPanel onClose={() => showAdminPanel = false} />
{/if}

{#if showCalendar}
  <Calendar onClose={() => showCalendar = false} />
{/if}

{#if showNotificationSettings}
  <NotificationSettings onClose={() => showNotificationSettings = false} />
{/if}

<!-- Mobile Channels Drawer -->
<Drawer.Root bind:open={showMobileChannels} direction="left">
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 bg-black/60 z-40" />
    <Drawer.Content class="fixed top-0 bottom-0 left-0 w-80 max-w-[85vw] flex flex-col bg-[#0a0a0a] z-50 border-r border-white/10" style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);">
      <div class="flex-1 overflow-y-auto">
        <div class="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-4 py-4">
          <h2 class="text-lg font-semibold text-white">Channels</h2>
        </div>
        <div class="p-4">
          <h3 class="text-xs font-semibold text-white/25 uppercase tracking-widest px-2 mb-2">
            Text Channels
          </h3>
          <div class="space-y-1">
            {#each $channelStore.channels as channel}
              <button
                type="button"
                on:click={() => selectChannel(channel.id)}
                class="flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-colors {$channelStore.selectedChannelId === channel.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'}"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span class="text-base font-medium truncate">{channel.name}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Mobile Members Drawer -->
<Drawer.Root bind:open={showMobileMembers} direction="right">
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 bg-black/60 z-40" />
    <Drawer.Content class="fixed top-0 bottom-0 right-0 w-80 max-w-[85vw] flex flex-col bg-[#0a0a0a] z-50 border-l border-white/10" style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);">
      <div class="flex-1 overflow-y-auto">
        <div class="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-4 py-4">
          <h2 class="text-lg font-semibold text-white">Band Members</h2>
        </div>
        <div class="p-4">
          {#each Object.entries(grouped) as [status, users]}
            {#if users.length > 0}
              <div class="mb-6">
                <h4 class="text-xs font-semibold text-white/25 uppercase tracking-widest px-2 mb-2">
                  {statusLabels[status]} — {users.length}
                </h4>
                <div class="space-y-1">
                  {#each users as user}
                    <button type="button" class="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-white/5 transition-colors">
                      <Avatar
                        alt={user.username}
                        size="md"
                        status={status === 'online' ? 'online' : status === 'idle' ? 'away' : status === 'dnd' ? 'busy' : 'offline'}
                      />
                      <div class="flex-1 min-w-0 text-left">
                        <p class="text-sm font-medium truncate {status === 'offline' ? 'text-white/30' : 'text-white/70'}">
                          {user.username}
                        </p>
                        <p class="text-xs text-white/20 truncate">{user.role}</p>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
