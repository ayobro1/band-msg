<script lang="ts">
  import { authStore } from '../stores/auth';
  import { messageStore } from '../stores/messages';
  import { channelStore } from '../stores/channels';
  import { parseMarkdown } from '$lib/markdown';
  import Avatar from './Avatar.svelte';

  export let message: any;
  export let showHeader: boolean;

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

  async function handleReactionClick(emoji: string) {
    if (!$channelStore.selectedChannelId) return;
    
    const reaction = message.reactions?.find((r: any) => r.emoji === emoji);
    const hasReacted = reaction?.users.includes($authStore.user?.username);
    
    if (hasReacted) {
      await messageStore.removeReaction(message.id, emoji, $channelStore.selectedChannelId);
    } else {
      await messageStore.addReaction(message.id, emoji, $channelStore.selectedChannelId);
    }
  }

  async function handleDelete() {
    if (!$channelStore.selectedChannelId) return;
    await messageStore.deleteMessage(message.id, $channelStore.selectedChannelId);
  }
</script>

<div class="group relative px-4 md:px-5 {showHeader ? 'mt-4 pt-1' : 'mt-0.5'}">
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
          <span class="text-[11px] text-white/20 font-medium">
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
            <button
              on:click={() => handleReactionClick(reaction.emoji)}
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all border {hasReacted ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}"
            >
              <span>{reaction.emoji}</span>
              <span class="font-medium">{reaction.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Delete button for own messages -->
    {#if isOwn}
      <button
        on:click={handleDelete}
        class="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-white/30 hover:text-white"
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
