<script lang="ts">
  import { authStore } from '../stores/auth';
  import { convexMessageStore as messageStore } from '../stores/convexMessages';
  import { convexChannelStore } from '../stores/convexChannels';
  import { parseMarkdown } from '$lib/markdown';
  import Avatar from './Avatar.svelte';

  export let message: any;
  export let showHeader: boolean;
  export let onOpenThread: ((message: any) => void) | null = null;

  function getAvatarColor(name: string): string {
    const colors = ['#7c3aed', '#2563eb', '#e11d48', '#059669', '#d97706', '#db2777'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  $: isOwn = message.author === $authStore.user?.username;
  $: parsedContent = parseMarkdown(message.content);
  $: highlightedContent = highlightMentions(parsedContent);
  $: isEdited = !!message.editedAt;

  function highlightMentions(content: string): string {
    // Match @username patterns (alphanumeric, underscore, hyphen)
    return content.replace(/@([a-zA-Z0-9_-]+)/g, '<span class="mention">@$1</span>');
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
  }

  let showReactionPicker = false;
  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let touchTimer: ReturnType<typeof setTimeout> | null = null;
  let tapCount = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let isEditing = false;
  let editContent = '';
  let reactionPickerOpenedAt = 0;
  let contextMenuOpenedAt = 0;
  let longPressFired = false;
  let movedTooMuch = false;
  let customEmojiInput = '';
  const LONG_PRESS_MS = 650;
  const MOVE_CANCEL_PX = 12;
  
  const QUICK_REACTIONS = [
    { emoji: '👍', name: 'thumbs-up' },
    { emoji: '❤️', name: 'heart' },
    { emoji: '😂', name: 'laugh' },
    { emoji: '🔥', name: 'fire' },
    { emoji: '👀', name: 'eyes' },
    { emoji: '💯', name: 'hundred' }
  ];
  
  // Map various emoji formats to SVG names
  const emojiToSvgMap: Record<string, string> = {
    '👍': 'thumbs-up',
    'thumbsup': 'thumbs-up',
    '❤️': 'heart',
    '❤': 'heart',
    'heart': 'heart',
    '😂': 'laugh',
    'laugh': 'laugh',
    '🔥': 'fire',
    'fire': 'fire',
    '👀': 'eyes',
    'eyes': 'eyes',
    '💯': 'hundred',
    'hundred': 'hundred',
    '✅': 'check',
    'check': 'check',
    '👎': 'thumbs-down',
    'thumbdown': 'thumbs-down'
  };
  
  function getReactionSvg(name: string): string {
    const svgs: Record<string, string> = {
      'thumbs-up': '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 11H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3"/></svg>',
      'thumbs-down': '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 13h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3"/></svg>',
      'heart': '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
      'laugh': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
      'fire': '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
      'eyes': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
      'hundred': '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="white">💯</text></svg>',
      'check': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
    };
    return svgs[name] || '';
  }
  
  function getSvgNameForEmoji(emoji: string): string | null {
    return emojiToSvgMap[emoji] || null;
  }

  function handleTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement;
    
    // Skip touch tracking entirely for interactive elements - let them handle their own events
    if (target.closest('button, a, input, textarea, select')) {
      return;
    }
    
    e.preventDefault();
    
    if (touchTimer) clearTimeout(touchTimer);
    longPressFired = false;
    movedTooMuch = false;
    
    // Get touch coordinates for menu positioning and movement tracking
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    contextMenuX = touch.clientX;
    contextMenuY = touch.clientY;
    
    // Long press for actions menu
    touchTimer = setTimeout(() => {
      showContextMenu = true;
      showReactionPicker = false;
      contextMenuOpenedAt = Date.now();
      tapCount = 0;
      if (tapTimer) clearTimeout(tapTimer);
      if (navigator.vibrate) navigator.vibrate(40);
      longPressFired = true;
    }, LONG_PRESS_MS);
  }

  function handleTouchEnd(e: TouchEvent) {
    const target = e.target as HTMLElement;
    
    // Allow buttons/inputs to handle their own touch events without interference
    if (target.closest('button, a, input, textarea, select')) {
      return;
    }
    
    e.preventDefault();
    
    // Clear long-press timer
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    
    // If long-press fired (or user was scrolling), don't treat as a tap.
    if (longPressFired || movedTooMuch) {
      tapCount = 0;
      if (tapTimer) clearTimeout(tapTimer);
      return;
    }

    // Handle double tap - quick react
    if (!target.closest('button, a, input, textarea, select')) {
      tapCount++;
      if (tapCount === 1) {
        tapTimer = setTimeout(() => {
          tapCount = 0;
        }, 300);
      } else if (tapCount === 2) {
        // Double tap - quick like (heart)
        if (tapTimer) clearTimeout(tapTimer);
        tapCount = 0;
        handleReactionClick('❤️', 'heart');
      }
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    showContextMenu = true;
  }

  function handleTouchMove(e: TouchEvent) {
    const target = e.target as HTMLElement;
    
    // Skip move tracking for interactive elements
    if (target.closest('button, a, input, textarea, select')) {
      return;
    }
    
    // Cancel timer if user scrolls (moved more than 10px vertically or horizontally)
    if (touchTimer && !showContextMenu) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartX);
      const deltaY = Math.abs(touch.clientY - touchStartY);
      
      // Cancel long-press if user is scrolling (more vertical movement)
      if (deltaY > MOVE_CANCEL_PX || deltaX > MOVE_CANCEL_PX) {
        clearTimeout(touchTimer);
        touchTimer = null;
        movedTooMuch = true;
      }
    }
  }

  async function handleReactionClick(emoji: string, name?: string) {
    showReactionPicker = false;
    showContextMenu = false;
    customEmojiInput = '';
    if (!$convexChannelStore.selectedChannelId) return;
    
    const reaction = message.reactions?.find((r: any) => r.emoji === emoji);
    const hasReacted = reaction?.users.includes($authStore.user?.username);
    
    if (hasReacted) {
      await messageStore.removeReaction(message.id, emoji, $convexChannelStore.selectedChannelId);
    } else {
      await messageStore.addReaction(message.id, emoji, $convexChannelStore.selectedChannelId);
    }
  }

  async function handleCustomEmoji() {
    const emoji = customEmojiInput.trim();
    if (!emoji) return;
    
    // Close menus and clear input first
    customEmojiInput = '';
    showReactionPicker = false;
    showContextMenu = false;
    
    // Then add the reaction
    if (!$convexChannelStore.selectedChannelId) return;
    
    const reaction = message.reactions?.find((r: any) => r.emoji === emoji);
    const hasReacted = reaction?.users.includes($authStore.user?.username);
    
    if (hasReacted) {
      await messageStore.removeReaction(message.id, emoji, $convexChannelStore.selectedChannelId);
    } else {
      await messageStore.addReaction(message.id, emoji, $convexChannelStore.selectedChannelId);
    }
  }

  async function handleDelete() {
    if (!$convexChannelStore.selectedChannelId) return;
    await messageStore.deleteMessage(message.id, $convexChannelStore.selectedChannelId);
  }

  function startEdit() {
    isEditing = true;
    editContent = message.content;
    showContextMenu = false;
    showReactionPicker = false;
    
    // Focus the edit textarea after it's rendered
    setTimeout(() => {
      const textarea = document.querySelector(`[data-message-id="${message.id}"] textarea`);
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }, 50);
  }

  function cancelEdit() {
    isEditing = false;
    editContent = '';
  }

  async function saveEdit() {
    const next = editContent.trim();
    if (!next) return;
    const result = await messageStore.editMessage(message.id, next);
    if (result.success) {
      isEditing = false;
      editContent = '';
    } else {
      alert(result.error || 'Failed to edit message');
    }
  }
</script>

{#if showReactionPicker}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="fixed inset-0 z-40" 
    on:click|stopPropagation={() => {
      // Prevent the same tap that opened the picker from also closing it
      if (Date.now() - reactionPickerOpenedAt < 500) return;
      showReactionPicker = false;
    }}
    on:touchstart|stopPropagation
    on:touchend|stopPropagation={(e) => {
      e.preventDefault();
      if (Date.now() - reactionPickerOpenedAt < 500) return;
      showReactionPicker = false;
    }}
  ></div>
  
  <!-- Mobile: bottom sheet style -->
  <div 
    class="fixed md:hidden left-4 right-4 bottom-20 z-50 bg-[#222] border border-white/10 rounded-xl shadow-2xl p-4 animate-slide-up"
    role="dialog"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown|stopPropagation={() => {}}
    on:touchstart|stopPropagation
    on:touchend|stopPropagation
  >
    <div class="flex items-center justify-center gap-2 flex-wrap mb-3">
      {#each QUICK_REACTIONS as reaction}
        <button
          type="button"
          on:click|stopPropagation={() => handleReactionClick(reaction.emoji, reaction.name)}
          on:touchend|stopPropagation|preventDefault={() => handleReactionClick(reaction.emoji, reaction.name)}
          class="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-all duration-200 transform hover:scale-110 active:scale-95 touch-manipulation origin-center text-white"
        >
          {@html getReactionSvg(reaction.name)}
        </button>
      {/each}
    </div>
    
    <!-- Custom emoji input -->
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={customEmojiInput}
        placeholder="Type any emoji..."
        class="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 outline-none focus:border-white/30"
        on:keydown={(e) => e.key === 'Enter' && handleCustomEmoji()}
        on:click|stopPropagation
        on:touchstart|stopPropagation
        on:touchend|stopPropagation
      />
      <button
        type="button"
        on:click|stopPropagation={handleCustomEmoji}
        on:touchend|stopPropagation|preventDefault={handleCustomEmoji}
        disabled={!customEmojiInput.trim()}
        class="px-4 py-2 bg-white text-black rounded-lg font-medium text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/90 transition-all"
      >
        Add
      </button>
    </div>
  </div>
  
  <!-- Desktop: near message -->
  <div class="hidden md:block absolute z-50 -top-10 left-12 flex items-center gap-1 bg-[#222] border border-white/10 rounded-full px-2 py-1.5 shadow-2xl animate-scale-in">
    {#each QUICK_REACTIONS as reaction}
      <button
        type="button"
        on:click|stopPropagation={() => handleReactionClick(reaction.emoji, reaction.name)}
        class="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-all duration-200 transform hover:scale-110 active:scale-95 touch-manipulation origin-center text-white"
      >
        {@html getReactionSvg(reaction.name)}
      </button>
    {/each}
  </div>
{/if}

{#if showContextMenu}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="fixed inset-0 z-40" 
    on:click|stopPropagation={() => {
      // Prevent the same tap that opened the menu from also closing it
      if (Date.now() - contextMenuOpenedAt < 500) return;
      showContextMenu = false;
    }}
    on:touchstart|stopPropagation
    on:touchend|stopPropagation={(e) => {
      e.preventDefault();
      if (Date.now() - contextMenuOpenedAt < 500) return;
      showContextMenu = false;
    }}
  ></div>
  
  <!-- Mobile: bottom sheet style -->
  <div class="fixed md:hidden left-4 right-4 bottom-20 z-50 bg-[#222] border border-white/10 rounded-xl shadow-2xl py-1 animate-slide-up" on:click|stopPropagation on:touchstart|stopPropagation on:touchend|stopPropagation>
    <button
      type="button"
      on:click|stopPropagation={() => { showContextMenu = false; handleReactionClick('❤️', 'heart'); }}
      on:touchend|stopPropagation|preventDefault={() => { showContextMenu = false; handleReactionClick('❤️', 'heart'); }}
      class="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-3"
    >
      {@html getReactionSvg('heart')}
      Like
    </button>
    <button
      type="button"
      on:click|stopPropagation={() => { showContextMenu = false; reactionPickerOpenedAt = Date.now(); showReactionPicker = true; }}
      on:touchend|stopPropagation|preventDefault={() => { showContextMenu = false; reactionPickerOpenedAt = Date.now(); showReactionPicker = true; }}
      class="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-3"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
      Add reaction
    </button>
    {#if onOpenThread}
      <button
        type="button"
        on:click|stopPropagation={() => { showContextMenu = false; onOpenThread && onOpenThread(message); }}
        on:touchend|stopPropagation|preventDefault={() => { showContextMenu = false; onOpenThread && onOpenThread(message); }}
        class="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-3"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Reply in thread
      </button>
    {/if}
    {#if isOwn}
      <button
        type="button"
        on:click|stopPropagation={startEdit}
        on:touchend|stopPropagation|preventDefault={startEdit}
        class="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-3"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Edit
      </button>
    {/if}
    {#if isOwn}
      <button
        type="button"
        on:click|stopPropagation={() => { showContextMenu = false; handleDelete(); }}
        on:touchend|stopPropagation|preventDefault={() => { showContextMenu = false; handleDelete(); }}
        class="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-white/10 transition-colors flex items-center gap-3"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Delete message
      </button>
    {/if}
  </div>

  <!-- Desktop: at cursor position -->
  <div 
    class="hidden md:block fixed z-50 bg-[#222] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[160px] animate-scale-in"
    style="left: {contextMenuX}px; top: {contextMenuY}px;"
  >
    <button
      type="button"
      on:click|stopPropagation={() => { showContextMenu = false; handleReactionClick('❤️', 'heart'); }}
      class="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
    >
      <span class="text-base leading-none">❤️</span>
      Like
    </button>
    {#if onOpenThread}
      <button
        type="button"
        on:click|stopPropagation={() => { showContextMenu = false; onOpenThread && onOpenThread(message); }}
        class="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Reply in thread
      </button>
    {/if}
    <button
      type="button"
      on:click|stopPropagation={() => { showContextMenu = false; reactionPickerOpenedAt = Date.now(); showReactionPicker = true; }}
      class="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
      Add reaction
    </button>
    {#if isOwn}
      <button
        type="button"
        on:click|stopPropagation={startEdit}
        class="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Edit
      </button>
    {/if}
    {#if isOwn}
      <button
        type="button"
        on:click|stopPropagation={() => { showContextMenu = false; handleDelete(); }}
        class="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-white/10 transition-colors flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Delete message
      </button>
    {/if}
  </div>
{/if}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="group relative px-4 md:px-5 {showHeader ? 'mt-4 pt-1' : 'mt-0.5'} {(showContextMenu || showReactionPicker || isEditing) ? 'bg-white/5' : ''} rounded-xl"
  data-message-id={message.id}
  on:contextmenu={handleContextMenu}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchmove={handleTouchMove}
  style="-webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;"
>
  <div class="flex gap-3">
    <!-- Avatar -->
    {#if showHeader}
      <Avatar alt={message.author} size="md" status={null} />
    {:else}
      <div class="w-10 shrink-0"></div>
    {/if}

    <div class="flex-1 min-w-0">
      <!-- Header -->
      {#if showHeader}
        <div class="flex items-baseline gap-2 mb-0.5">
          <span class="text-[14px] font-semibold" style="color: {getAvatarColor(message.author)};">
            {message.author}
          </span>
          <span class="text-[11px] text-white/40 font-medium">
            {formatTime(message.createdAt)}
          </span>
        </div>
      {/if}

      <!-- Content -->
      {#if isEditing}
        <div class="mt-1">
          <textarea
            bind:value={editContent}
            rows="3"
            class="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/25 outline-none focus:border-white/30 resize-none transition-colors"
          ></textarea>
          <div class="flex gap-2 mt-2">
            <button
              type="button"
              on:click|stopPropagation={cancelEdit}
              class="flex-1 px-3 py-2 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-200 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              on:click|stopPropagation={saveEdit}
              disabled={!editContent.trim()}
              class="flex-1 px-3 py-2 bg-white text-black rounded-xl hover:bg-white/90 transition-all duration-200 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      {:else}
        <div 
          class="text-[14.5px] text-white/80 leading-relaxed break-words whitespace-pre-wrap"
          style="-webkit-user-select: text; user-select: text; cursor: text;"
        >
          {@html highlightedContent}
        </div>
        {#if isEdited}
          <div class="mt-0.5 text-[11px] text-white/30">(edited)</div>
        {/if}
      {/if}

      <!-- Reactions -->
      {#if message.reactions && message.reactions.length > 0}
        <div class="flex flex-wrap gap-1 mt-1.5">
          {#each message.reactions as reaction}
            {@const hasReacted = reaction.users.includes($authStore.user?.username)}
            {@const svgName = getSvgNameForEmoji(reaction.emoji) || reaction.emoji}
            <button
              on:click={() => handleReactionClick(reaction.emoji, svgName)}
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all duration-200 border transform hover:scale-105 active:scale-95 {hasReacted ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}"
            >
              {#if getReactionSvg(svgName)}
                <span class="inline-flex">{@html getReactionSvg(svgName)}</span>
              {:else}
                <span>{reaction.emoji}</span>
              {/if}
              <span class="font-medium">{reaction.count}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Thread Reply Button -->
      {#if onOpenThread && message.replyCount > 0}
        <button
          on:click={() => onOpenThread && onOpenThread(message)}
          class="flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all duration-200"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span class="font-medium">{message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}</span>
        </button>
      {/if}
    </div>

    <!-- Action buttons - desktop only -->
    <div class="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <!-- Reply in thread button -->
      {#if onOpenThread}
        <button
          type="button"
          on:click={() => onOpenThread && onOpenThread(message)}
          class="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          aria-label="Reply in thread"
          title="Reply in thread"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      {/if}

      <!-- Delete button for own messages -->
      {#if isOwn}
        <button
          type="button"
          on:click|stopPropagation={handleDelete}
          class="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          aria-label="Delete message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Prevent context menu and selection on images in messages */
  :global(.text-white\/80 img) {
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    user-select: none;
    pointer-events: auto;
  }

  /* iOS-specific fixes for text selection */
  @supports (-webkit-touch-callout: none) {
    /* Prevent text selection on the entire message bubble */
    .group {
      -webkit-user-select: none !important;
      -webkit-touch-callout: none !important;
      user-select: none !important;
    }
    
    /* Enable text selection for message content only when not interacting */
    .text-white\/80 {
      -webkit-user-select: text !important;
      user-select: text !important;
      pointer-events: none;
    }
    
    /* Prevent tap highlight on buttons */
    button {
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    
    /* Prevent selection on the entire message container during touch */
    .group:active {
      -webkit-user-select: none !important;
      user-select: none !important;
    }
  }
  
  /* Force prevent selection on all touch devices */
  @media (hover: none) and (pointer: coarse) {
    .group {
      -webkit-user-select: none !important;
      -webkit-touch-callout: none !important;
      user-select: none !important;
    }
  }

  /* @mention highlighting */
  :global(.mention) {
    color: #7289da;
    background: rgba(114, 137, 218, 0.2);
    padding: 0 4px;
    border-radius: 4px;
    font-weight: 500;
  }

  :global(.mention:hover) {
    background: rgba(114, 137, 218, 0.3);
    cursor: pointer;
  }
</style>
