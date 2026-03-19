<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import { Drawer } from 'vaul-svelte';
  import { authStore } from '../stores/auth';
  import { convexChannelStore } from '../stores/convexChannels';
  import { convexMessageStore as messageStore } from '../stores/convexMessages';
  import { memberStore } from '../stores/members';
  import { themeStore } from '../stores/theme';
  import { vibrateLight, vibrateMedium, vibrateSuccess } from '../utils/haptics';
  import MessageBubble from './MessageBubble.svelte';
  import AdminPanel from './AdminPanel.svelte';
  import Calendar from './Calendar.svelte';
  import NotificationSettings from './NotificationSettings.svelte';
  import Avatar from './Avatar.svelte';
  import Input from './Input.svelte';
  import GiphyPicker from './GiphyPicker.svelte';
  import CreateChannel from './CreateChannel.svelte';
  import ThreadPanel from './ThreadPanel.svelte';
  import ProfileDrawer from './ProfileDrawer.svelte';
  
  let messageInput = '';
  let messageContainer: HTMLDivElement;
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let showAdminPanel = false;
  let showCalendar = false;
  let showMobileChannels = false;
  let showMobileMembers = false;
  let showNotificationSettings = false;
  let showGiphy = false;
  let showCreateChannel = false;
  let showSettingsMenu = false;
  let showProfileDrawer = false;
  let shouldAutoScroll = true;
  let showThread = false;
  let threadMessage: any = null;
  let ephemeralMessage = '';
  let ephemeralTimeout: ReturnType<typeof setTimeout> | null = null;
  let showMentionDropdown = false;
  let mentionQuery = '';
  let mentionStartIndex = -1;
  let mentionInputRef: HTMLInputElement;
  
  // Mobile channel menu
  let showMobileChannelMenu = false;
  let mobileMenuChannel: any = null;
  let showMobileDeleteConfirm = false;
  let mobileChannelToDelete: any = null;
  let isMobileRenaming = false;
  let mobileNewChannelName = '';
  let mobileTouchTimer: ReturnType<typeof setTimeout> | null = null;
  let mobileTouchStartX = 0;
  let mobileTouchStartY = 0;
  let mobileMovedTooMuch = false;
  let touchFired = false; // Prevent double-fire on touch devices
  let isKeyboardVisible = false;
  let messageInputEl: HTMLInputElement | HTMLTextAreaElement;

  function openThread(message: any) {
    threadMessage = message;
    showThread = true;
  }
  
  onMount(() => {
    themeStore.init();
    
    // Handle visual viewport changes (keyboard opening/closing on mobile)
    if (typeof visualViewport !== 'undefined') {
      const handleViewportChange = () => {
        const viewport = visualViewport!;
        const keyboardHeight = window.innerHeight - viewport.height;
        isKeyboardVisible = keyboardHeight > 100;
        
        // Adjust scroll when keyboard opens
        if (isKeyboardVisible) {
          setTimeout(() => {
            if (messageInputEl) {
              messageInputEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
          }, 100);
        }
      };
      
      visualViewport.addEventListener('resize', handleViewportChange);
      visualViewport.addEventListener('scroll', handleViewportChange);
      
      return () => {
        visualViewport.removeEventListener('resize', handleViewportChange);
        visualViewport.removeEventListener('scroll', handleViewportChange);
      };
    }
  });

  $: selectedChannel = $convexChannelStore.channels.find(
    c => c.id === $convexChannelStore.selectedChannelId
  );

  // Load messages when channel changes
  $: if ($convexChannelStore.selectedChannelId) {
    messageStore.loadMessages($convexChannelStore.selectedChannelId);
  }

  // Check if user is near bottom to enable auto-scroll
  function handleScroll() {
    if (!messageContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messageContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    shouldAutoScroll = distanceFromBottom < 100;
    console.log('[MessageArea] Scroll position:', { scrollTop, scrollHeight, clientHeight, distanceFromBottom, shouldAutoScroll });
  }

  function scrollToBottom(force = false) {
    if (!force && !shouldAutoScroll) return;
    
    requestAnimationFrame(() => {
      if (messageContainer) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
        console.log('[MessageArea] Scrolled to bottom, force:', force);
      }
    });
  }

  // Only auto-scroll when channel changes - let user scroll freely otherwise
  let lastLoadedChannelId = '';
  
  $: if ($convexChannelStore.selectedChannelId && $convexChannelStore.selectedChannelId !== lastLoadedChannelId) {
    lastLoadedChannelId = $convexChannelStore.selectedChannelId;
    shouldAutoScroll = true;
    console.log('[MessageArea] Channel changed to:', $convexChannelStore.selectedChannelId);
    messageStore.subscribeToTyping($convexChannelStore.selectedChannelId);
    messageStore.loadMessages($convexChannelStore.selectedChannelId);
  }
  
  // Track new messages and auto-scroll ONLY if user is already at bottom
  let lastMessageCount = 0;
  $: if ($messageStore.messages.length !== lastMessageCount) {
    const oldCount = lastMessageCount;
    lastMessageCount = $messageStore.messages.length;
    
    // Scroll on first load
    if (oldCount === 0 && $messageStore.messages.length > 0) {
      setTimeout(() => {
        if (messageContainer) {
          messageContainer.scrollTop = messageContainer.scrollHeight;
          console.log('[MessageArea] Initial scroll to bottom');
        }
      }, 100);
    }
    // Only auto-scroll for new messages if user is near bottom (within 150px)
    else if (oldCount > 0 && shouldAutoScroll && messageContainer) {
      setTimeout(() => {
        if (messageContainer) {
          messageContainer.scrollTop = messageContainer.scrollHeight;
          console.log('[MessageArea] Auto-scrolled for new message');
        }
      }, 50);
    }
  }

  async function handleSend() {
    if (!messageInput.trim() || !$convexChannelStore.selectedChannelId) return;

    const trimmedMessage = messageInput.trim();

    // Handle !report command (ephemeral - only visible to sender)
    if (trimmedMessage.toLowerCase().startsWith('!report ')) {
      const reportMessage = trimmedMessage.slice(8).trim();
      if (reportMessage) {
        try {
          await messageStore.createReport(reportMessage);
          vibrateSuccess();
          ephemeralMessage = `Report submitted: "${reportMessage.slice(0, 50)}${reportMessage.length > 50 ? '...' : ''}"`;
          ephemeralTimeout = setTimeout(() => {
            ephemeralMessage = '';
          }, 5000);
        } catch (err) {
          console.error('[MessageArea] Failed to create report:', err);
          ephemeralMessage = 'Failed to submit report. Please try again.';
          ephemeralTimeout = setTimeout(() => {
            ephemeralMessage = '';
          }, 5000);
        }
        messageInput = '';
        return;
      }
    }
    
    console.log('[MessageArea] Sending message:', trimmedMessage, 'to channel:', $convexChannelStore.selectedChannelId);
    
    const result = await messageStore.sendMessage(
      $convexChannelStore.selectedChannelId,
      trimmedMessage
    );
    
    console.log('[MessageArea] Send result:', result);
    
    if (result.success) {
      messageInput = '';
      showMentionDropdown = false;
      vibrateSuccess();
      messageStore.stopTyping($convexChannelStore.selectedChannelId);
    } else {
      console.error('[MessageArea] Failed to send:', result.error);
    }
  }

  async function handleGiphySelect(url: string) {
    if (!$convexChannelStore.selectedChannelId) return;
    showGiphy = false;
    
    // Send markdown image immediately
    await messageStore.sendMessage(
      $convexChannelStore.selectedChannelId,
      `![GIF](${url})`
    );
  }

  function handleTyping() {
    console.log('[handleTyping] called, channelId:', $convexChannelStore.selectedChannelId);
    if ($convexChannelStore.selectedChannelId) {
      // Debounce typing indicator calls to prevent spamming
      if (typingDebounceTimer) return;
      
      typingDebounceTimer = setTimeout(() => {
        typingDebounceTimer = null;
      }, 500);
      
      messageStore.setTyping($convexChannelStore.selectedChannelId);
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    const cursorPos = target.selectionStart || 0;

    // Check for @mention
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Only show dropdown if there's no space after @
      if (!textAfterAt.includes(' ') && textAfterAt.length < 20) {
        mentionQuery = textAfterAt.toLowerCase();
        mentionStartIndex = lastAtIndex;
        showMentionDropdown = true;
      } else {
        showMentionDropdown = false;
      }
    } else {
      showMentionDropdown = false;
    }

    handleTyping();
  }

  function insertMention(username: string) {
    const beforeMention = messageInput.slice(0, mentionStartIndex);
    const afterMention = messageInput.slice(messageInput.selectionStart || mentionStartIndex);
    messageInput = beforeMention + '@' + username + ' ' + afterMention;
    showMentionDropdown = false;
    
    // Focus back on input and set cursor position
    setTimeout(() => {
      const inputEl = document.querySelector('.message-input') as HTMLInputElement;
      if (inputEl) {
        const newPos = mentionStartIndex + username.length + 2;
        inputEl.focus();
        inputEl.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }

  $: filteredMembers = showMentionDropdown && mentionQuery
    ? $memberStore.members.filter(m => 
        m.username.toLowerCase().startsWith(mentionQuery) ||
        m.username.toLowerCase().includes(mentionQuery)
      ).slice(0, 5)
    : [];

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function selectChannel(channelId: string) {
    console.log('[MessageArea] Selecting channel:', channelId);
    
    // Reset scroll state for new channel
    shouldAutoScroll = true;
    lastMessageCount = 0; // Reset so initial load scroll triggers
    
    // Subscribe to typing indicators
    messageStore.subscribeToTyping(channelId);
    
    convexChannelStore.selectChannel(channelId);
    await messageStore.loadMessages(channelId);
    showMobileChannels = false;
    
    // Force scroll to bottom after messages load
    setTimeout(() => {
      if (messageContainer) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
        console.log('[MessageArea] Forced scroll to bottom after channel selection');
      }
    }, 200);
  }

  function handleMobileChannelTouchStart(e: TouchEvent, channel: any) {
    e.preventDefault();
    e.stopPropagation();
    
    const touch = e.touches[0];
    mobileTouchStartX = touch.clientX;
    mobileTouchStartY = touch.clientY;
    mobileMovedTooMuch = false;
    
    mobileTouchTimer = setTimeout(() => {
      if (!mobileMovedTooMuch) {
        mobileMenuChannel = channel;
        mobileNewChannelName = channel.name;
        showMobileChannelMenu = true;
        showMobileChannels = false;
        vibrateMedium();
      }
    }, 500);
  }

  function handleMobileChannelTouchMove(e: TouchEvent) {
    if (mobileTouchTimer) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - mobileTouchStartX);
      const deltaY = Math.abs(touch.clientY - mobileTouchStartY);
      
      if (deltaY > 10 || deltaX > 10) {
        clearTimeout(mobileTouchTimer);
        mobileTouchTimer = null;
        mobileMovedTooMuch = true;
      }
    }
  }

  function handleMobileChannelTouchEnd(e: TouchEvent, channel: any) {
    e.preventDefault();
    e.stopPropagation();
    
    if (mobileTouchTimer) {
      clearTimeout(mobileTouchTimer);
      mobileTouchTimer = null;
    }
    
    // Mark that touch fired - this prevents click from also firing
    touchFired = true;
    setTimeout(() => { touchFired = false; }, 100);
    
    if (!mobileMovedTooMuch && !showMobileChannelMenu) {
      vibrateMedium();
      selectChannel(channel.id);
    }
  }

  async function renameMobileChannel() {
    if (!mobileMenuChannel || !mobileNewChannelName.trim()) return;
    
    try {
      const sessionToken = $messageStore.sessionToken;
      if (!sessionToken) {
        alert('No session token - please refresh the page');
        return;
      }

      const { convex } = await import('../convex');
      const { api } = await import('../../../convex/_generated/api');
      
      await convex.mutation(api.channels.update, {
        channelId: mobileMenuChannel.id,
        name: mobileNewChannelName.trim(),
        sessionToken
      });

      await convexChannelStore.loadChannels();
      isMobileRenaming = false;
      showMobileChannelMenu = false;
      mobileMenuChannel = null;
    } catch (err) {
      console.error('[MessageArea] Failed to rename channel:', err);
      alert(`Failed to rename channel: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function confirmMobileDelete() {
    mobileChannelToDelete = mobileMenuChannel;
    showMobileChannelMenu = false;
    showMobileDeleteConfirm = true;
  }

  async function deleteMobileChannel() {
    if (!mobileChannelToDelete) return;
    
    try {
      const sessionToken = $messageStore.sessionToken;
      if (!sessionToken) {
        alert('No session token - please refresh the page');
        return;
      }

      const { convex } = await import('../convex');
      const { api } = await import('../../../convex/_generated/api');

      await convex.mutation(api.channels.remove, {
        channelId: mobileChannelToDelete.id,
        sessionToken
      });

      await convexChannelStore.loadChannels();
      
      // Reset scroll state
      shouldAutoScroll = true;
      lastMessageCount = 0;
      
      if ($convexChannelStore.selectedChannelId === mobileChannelToDelete.id) {
        const firstChannel = $convexChannelStore.channels[0];
        if (firstChannel) {
          await selectChannel(firstChannel.id);
          // Force scroll to bottom after a delay
          setTimeout(() => {
            if (messageContainer) {
              messageContainer.scrollTop = messageContainer.scrollHeight;
            }
          }, 200);
        }
      }
    } catch (err) {
      console.error('[MessageArea] Failed to delete channel:', err);
      alert(`Failed to delete channel: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      showMobileDeleteConfirm = false;
      mobileChannelToDelete = null;
    }
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
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="flex-1 flex flex-col min-w-0 min-h-0 message-area-container" 
  style="padding-top: env(safe-area-inset-top);"
  on:click={(e) => {
    // Dismiss keyboard and dropdowns when tapping message area
    const target = e.target as HTMLElement;
    if (!target.closest('input, textarea, button, .mention-dropdown')) {
      // @ts-ignore
      if (document.activeElement) {
        // @ts-ignore
        document.activeElement.blur();
      }
      showMentionDropdown = false;
    }
  }}
>
  <!-- Header -->
  <div class="h-14 flex items-center justify-between px-4 border-b border-white/10 shrink-0 relative message-area-header" style="z-index: 100;">
    <div class="flex items-center gap-3">
      <!-- Mobile channels button -->
      <button
        type="button"
        on:click={() => showMobileChannels = true}
        class="lg:hidden p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 touch-manipulation relative"
        style="z-index: 101; pointer-events: auto;"
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
      <button
        type="button"
        on:click={() => showProfileDrawer = true}
        class="p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
        aria-label="Open profile"
      >
        <Avatar alt={$authStore.user?.username || 'User'} size="sm" status="online" />
      </button>
      <div>
        <h3 class="text-[15px] font-semibold text-white tracking-tight leading-tight">
          #{selectedChannel?.name || 'general'}
        </h3>
        <p class="text-[11px] text-white/30 leading-tight hidden sm:block">
          {selectedChannel?.description || 'Band chat'}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-0.5 relative">
      <!-- Compact menu for small screens -->
      <div class="sm:hidden relative">
        <button
          type="button"
          on:click={() => showSettingsMenu = !showSettingsMenu}
          class="p-1.5 rounded-lg transition-colors text-white/40 hover:text-white hover:bg-white/5 touch-manipulation cursor-pointer relative"
          style="z-index: 101; pointer-events: auto;"
          title="Menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="12" cy="5" r="1"/>
            <circle cx="12" cy="19" r="1"/>
          </svg>
        </button>
        
        {#if showSettingsMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-[150]" on:click={() => showSettingsMenu = false}></div>
          <div class="absolute right-0 top-full mt-2 w-48 bg-black border border-white/10 rounded-xl shadow-xl z-[151] py-2">
            <button
              type="button"
              on:click={() => { showMobileMembers = true; showSettingsMenu = false; }}
              class="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5 hover:text-white flex items-center gap-3"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Members
            </button>
            <button
              type="button"
              on:click={() => { themeStore.toggle(); showSettingsMenu = false; }}
              class="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5 hover:text-white flex items-center gap-3"
            >
              {#if $themeStore === 'dark'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
                Light Mode
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                Dark Mode
              {/if}
            </button>
            <button
              type="button"
              on:click={() => { showNotificationSettings = true; showSettingsMenu = false; }}
              class="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5 hover:text-white flex items-center gap-3"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Notifications
            </button>
            <button
              type="button"
              on:click={() => { showCalendar = true; showSettingsMenu = false; }}
              class="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5 hover:text-white flex items-center gap-3"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Calendar
            </button>
            {#if $authStore.user?.role === 'admin'}
              <button
                type="button"
                on:click={() => { showAdminPanel = true; showSettingsMenu = false; }}
                class="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5 hover:text-white flex items-center gap-3"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Admin Panel
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Individual icons for larger screens -->
      <div class="hidden sm:flex items-center gap-0.5">
      <button
        type="button"
        on:click={() => showMobileMembers = true}
        class="lg:hidden p-1.5 rounded-lg transition-colors text-white/40 hover:text-white hover:bg-white/5 touch-manipulation cursor-pointer relative"
        style="z-index: 101; pointer-events: auto;"
        title="Show Members"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>
      <button
        type="button"
        on:click={() => themeStore.toggle()}
        class="p-1.5 rounded-lg transition-all duration-200 text-white/40 hover:text-white hover:bg-white/5 hover:scale-110 active:scale-95 touch-manipulation cursor-pointer relative"
        style="z-index: 101; pointer-events: auto;"
        title="Toggle Theme"
      >
        {#if $themeStore === 'dark'}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        {/if}
      </button>
      <button
        type="button"
        on:click|stopPropagation={() => { showNotificationSettings = true; }}
        class="p-1.5 rounded-lg transition-all duration-200 text-white/40 hover:text-white hover:bg-white/5 hover:scale-110 active:scale-95 touch-manipulation cursor-pointer relative"
        style="z-index: 101; pointer-events: auto;"
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
        class="p-1.5 rounded-lg transition-all duration-200 text-white/40 hover:text-white hover:bg-white/5 hover:scale-110 active:scale-95 touch-manipulation cursor-pointer relative"
        style="z-index: 101; pointer-events: auto;"
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
          class="p-1.5 rounded-lg transition-all duration-200 text-white/40 hover:text-white hover:bg-white/5 hover:scale-110 active:scale-95 touch-manipulation cursor-pointer relative"
          style="z-index: 101; pointer-events: auto;"
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
          if (window.innerWidth < 1024) {
            showMobileMembers = true;
          } else {
            memberStore.toggleUserList();
          }
        }}
        class="p-1.5 rounded-lg transition-colors {$memberStore.showUserList ? 'text-white bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'} relative"
        style="z-index: 101; pointer-events: auto;"
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
  </div>

  <!-- Messages -->
  <div 
    bind:this={messageContainer} 
    on:scroll={handleScroll} 
    class="overflow-y-auto overflow-x-hidden py-3 message-area-messages" 
    style="flex: 1 1 auto; min-height: 0; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;"
  >
    {#each $messageStore.messages as message, i (message.id)}
      {@const prev = i > 0 ? $messageStore.messages[i - 1] : null}
      {@const showHeader = !prev || prev.author !== message.author || message.createdAt - prev.createdAt > 300000}
      <MessageBubble {message} {showHeader} onOpenThread={openThread} />
    {/each}

    <div class="h-4"></div>
  </div>

  <!-- Typing indicator -->
  {#if $messageStore.typingUsers && $messageStore.typingUsers.length > 0}
    <div class="px-4 pb-1 shrink-0">
      <div class="flex items-center gap-2 text-xs text-white/40">
        <div class="flex gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style="animation-delay: 0ms;"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style="animation-delay: 150ms;"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style="animation-delay: 300ms;"></span>
        </div>
        <span>
          {#if $messageStore.typingUsers.length === 1}
            {$messageStore.typingUsers[0]} is typing...
          {:else if $messageStore.typingUsers.length === 2}
            {$messageStore.typingUsers[0]} and {$messageStore.typingUsers[1]} are typing...
          {:else}
            Several people are typing...
          {/if}
        </span>
      </div>
    </div>
  {/if}

  <!-- Input area -->
  <div class="px-4 pb-3 md:pb-4 shrink-0">
    <div class="relative flex items-end gap-2">
      <!-- GIF Button -->
      <button
        type="button"
        on:click={() => showGiphy = true}
        class="h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-200 flex items-center justify-center shrink-0 font-bold text-xs text-white/70 hover:text-white hover:scale-105 active:scale-95"
        title="Add GIF"
      >
        GIF
      </button>

        <div class="flex-1 relative">
        {#if showMentionDropdown && filteredMembers.length > 0}
          <!-- Position above keyboard on mobile -->
          <div 
            class="absolute left-0 w-full bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[300] max-h-64 overflow-y-auto"
            style="bottom: calc(100% + 8px);"
          >
            {#each filteredMembers as member}
              <button
                type="button"
                on:click={() => insertMention(member.username)}
                class="w-full px-4 py-2.5 text-left hover:bg-white/5 transition-colors flex items-center gap-3 active:bg-white/10"
              >
                <Avatar alt={member.username} size="xs" status={null} />
                <span class="text-sm text-white">{member.username}</span>
                {#if member.role === 'admin'}
                  <span class="text-[10px] text-white/40 uppercase">Admin</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
        <Input
          type="text"
          bind:this={messageInputEl}
          bind:value={messageInput}
          on:input={handleInput}
          on:keydown={handleKeyDown}
          on:focus={() => {
            // Scroll input into view when focused on mobile
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              setTimeout(() => {
                messageInputEl?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                if (messageContainer) {
                  messageContainer.scrollTop = messageContainer.scrollHeight;
                }
              }, 300);
            }
          }}
          placeholder="Message the band... (type !report [message] to report an issue)"
          maxlength={2000}
          autocomplete="off"
          class="message-input"
        />
      </div>
      <button
        type="button"
        on:click={handleSend}
        disabled={!messageInput.trim()}
        class="p-3 rounded-xl transition-all duration-200 shrink-0 hover:scale-105 active:scale-95 {messageInput.trim() ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 text-white/20 cursor-not-allowed'}"
        aria-label="Send message"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>

    <!-- Ephemeral message display (for !report confirmation) -->
    {#if ephemeralMessage}
      <div class="px-4 pb-2 shrink-0">
        <div class="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {ephemeralMessage}
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showAdminPanel}
  <AdminPanel sessionToken={$messageStore.sessionToken} onClose={() => { showAdminPanel = false; scrollToBottom(true); }} />
{/if}

{#if showCreateChannel}
  <CreateChannel onClose={() => { showCreateChannel = false; scrollToBottom(true); }} />
{/if}

{#if showCalendar}
  <Calendar onClose={() => { showCalendar = false; scrollToBottom(true); }} />
{/if}

{#if showNotificationSettings}
  <NotificationSettings onClose={() => { showNotificationSettings = false; scrollToBottom(true); }} />
{/if}

{#if showGiphy}
  <GiphyPicker
    onClose={() => showGiphy = false}
    onSelect={handleGiphySelect}
  />
{/if}

{#if showThread && threadMessage}
  <ThreadPanel
    parentMessage={threadMessage}
    onClose={() => {
      showThread = false;
      threadMessage = null;
    }}
  />
{/if}

{#if showProfileDrawer}
  <ProfileDrawer
    open={showProfileDrawer}
    onClose={() => showProfileDrawer = false}
  />
{/if}

<!-- Mobile Channels Drawer -->
<Drawer.Root bind:open={showMobileChannels} direction="left">
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 bg-black/60 z-40" />
    <Drawer.Content class="fixed top-0 bottom-0 left-0 w-80 max-w-[85vw] flex flex-col bg-[#0a0a0a] z-50 border-r border-white/10" style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); -webkit-user-select: none; -webkit-touch-callout: none; user-select: none;">
      <div class="flex-1 overflow-y-auto">
        <div class="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-4 py-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white">Channels</h2>
          <div class="flex items-center gap-2">
            <!-- Show create channel for all approved users -->
            <button
              type="button"
              on:click|stopPropagation={() => {
                showMobileChannels = false;
                showCreateChannel = true;
              }}
              class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors touch-manipulation"
              aria-label="Create Channel"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              on:click={() => showMobileChannels = false}
              class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors touch-manipulation"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div class="p-4">
          <h3 class="text-xs font-semibold text-white/25 uppercase tracking-widest px-2 mb-2">
            Text Channels
          </h3>
          <div class="space-y-1">
            {#each $convexChannelStore.channels as channel}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                on:click={() => {
                  // Skip if touch just fired to prevent double-fire
                  if (touchFired) return;
                  vibrateMedium();
                  selectChannel(channel.id);
                }}
                on:touchstart={(e) => handleMobileChannelTouchStart(e, channel)}
                on:touchmove={handleMobileChannelTouchMove}
                on:touchend={(e) => handleMobileChannelTouchEnd(e, channel)}
                on:touchcancel={(e) => handleMobileChannelTouchEnd(e, channel)}
                class="flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-colors cursor-pointer active:bg-white/10 {$convexChannelStore.selectedChannelId === channel.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/70'}"
                style="-webkit-tap-highlight-color: transparent;"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span class="text-base font-medium truncate">{channel.name}</span>
              </div>
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
        <div class="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-4 py-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white">Band Members</h2>
          <button
            type="button"
            on:click={() => showMobileMembers = false}
            class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors touch-manipulation"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
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
                    <div class="flex items-center gap-3 w-full px-3 py-3 rounded-xl">
                      <Avatar
                        alt={user.username}
                        size="md"
                        status={status === 'online' ? 'online' : status === 'idle' ? 'away' : status === 'dnd' ? 'busy' : 'offline'}
                      />
                      <div class="flex-1 min-w-0 text-left">
                        <p class="text-sm font-medium truncate text-white">
                          {user.username}
                        </p>
                        {#if $authStore.user?.role === 'admin'}
                          <p class="text-xs text-white/40 truncate">{user.role}</p>
                        {/if}
                      </div>
                    </div>
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


<!-- Mobile Channel Menu Drawer -->
<Drawer.Root open={showMobileChannelMenu} onOpenChange={(open) => { showMobileChannelMenu = open; if (!open) { mobileMenuChannel = null; isMobileRenaming = false; } }}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 bg-black/60 z-[100]" />
    <Drawer.Content class="fixed bottom-0 left-0 right-0 z-[101] bg-[#1a1a1a] border-t border-white/10 rounded-t-2xl outline-none">
      <div class="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/20 mt-4 mb-6" />
      
      {#if mobileMenuChannel}
        <div class="px-6 pb-8">
          <h3 class="text-xl font-bold text-white mb-1">#{mobileMenuChannel.name}</h3>
          <p class="text-sm text-white/50 mb-6">Channel Options</p>
          
          {#if isMobileRenaming}
            <div class="mb-4">
              <label class="block text-sm font-medium text-white/70 mb-2">New Channel Name</label>
              <input
                type="text"
                bind:value={mobileNewChannelName}
                placeholder="Enter new name..."
                class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
                on:keydown={(e) => e.key === 'Enter' && renameMobileChannel()}
              />
              <div class="flex gap-2 mt-3">
                <button
                  type="button"
                  on:click={() => { isMobileRenaming = false; mobileNewChannelName = mobileMenuChannel.name; }}
                  class="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  on:click={renameMobileChannel}
                  disabled={!mobileNewChannelName.trim() || mobileNewChannelName === mobileMenuChannel.name}
                  class="flex-1 px-4 py-2.5 bg-white text-black rounded-xl hover:bg-white/90 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          {:else}
            <div class="space-y-2">
              <button
                type="button"
                on:click={() => isMobileRenaming = true}
                class="w-full px-4 py-3 text-left text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span class="font-medium">Rename Channel</span>
              </button>
              
              {#if $authStore.user?.role === 'admin'}
                <button
                  type="button"
                  on:click={confirmMobileDelete}
                  class="w-full px-4 py-3 text-left text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors flex items-center gap-3"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span class="font-medium">Delete Channel</span>
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

{#if showMobileDeleteConfirm && mobileChannelToDelete}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center" on:click={() => { showMobileDeleteConfirm = false; mobileChannelToDelete = null; }}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bg-[#2a2a2a] border border-white/30 rounded-2xl p-6 max-w-sm mx-4" on:click|stopPropagation>
      <h3 class="text-lg font-bold text-white mb-2">Delete Channel</h3>
      <p class="text-sm text-white/60 mb-4">
        Are you sure you want to delete <span class="text-white font-semibold">#{mobileChannelToDelete.name}</span>? This action cannot be undone.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          on:click={() => { showMobileDeleteConfirm = false; mobileChannelToDelete = null; }}
          class="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={deleteMobileChannel}
          class="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors text-sm font-medium"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}
