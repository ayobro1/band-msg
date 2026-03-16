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
    // Prevent default on images to avoid download
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      e.preventDefault();
    }
    
    if (touchTimer) clearTimeout(touchTimer);
    touchTimer = setTimeout(() => {
      showContextMenu = true;
      if (navigator.vibrate) navigator.vibrate(50);
    }, 400);
  }

  function handleTouchEnd(e: TouchEvent) {
    if (touchTimer) clearTimeout(touchTimer);
    
    // Handle double-tap on images
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      tapCount++;
      if (tapCount === 1) {
        tapTimer = setTimeout(() => {
          tapCount = 0;
        }, 300);
      } else if (tapCount === 2) {
        if (tapTimer) clearTimeout(tapTimer);
        tapCount = 0;
        // Double tap detected - add heart reaction
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

  function handleTouchMove() {
    if (touchTimer) clearTimeout(touchTimer);
  }

  async function handleReactionClick(emoji: string, name?: string) {
    showReactionPicker = false;
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
</script>

{#if showReactionPicker}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-40" on:click|stopPropagation={() => showReactionPicker = false} on:touchstart|stopPropagation={() => showReactionPicker = false}></div>
  <div class="absolute z-50 -top-10 left-12 flex items-center gap-1 bg-[#222] border border-white/10 rounded-full px-2 py-1.5 shadow-2xl animate-scale-in">
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
  <div class="fixed inset-0 z-40" on:click|stopPropagation={() => showContextMenu = false} on:touchstart|stopPropagation={() => showContextMenu = false}></div>
  <div 
    class="fixed z-50 bg-[#222] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[160px] animate-scale-in"
    style="left: {contextMenuX}px; top: {contextMenuY}px;"
  >
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
      on:click|stopPropagation={() => { showContextMenu = false; showReactionPicker = true; }}
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
  class="group relative px-4 md:px-5 {showHeader ? 'mt-4 pt-1' : 'mt-0.5'}"
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchmove={handleTouchMove}
  on:touchcancel={handleTouchEnd}
  on:contextmenu={handleContextMenu}
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
      <div class="text-[14.5px] text-white/80 leading-relaxed break-words whitespace-pre-wrap">
        {@html parsedContent}
      </div>

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

    <!-- Action buttons -->
    <div class="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
      <!-- Reply in thread button -->
      {#if onOpenThread}
        <button
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
          on:click={handleDelete}
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
