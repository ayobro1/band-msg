<script lang="ts">
  import { onMount } from 'svelte';
  import { memberStore } from '../stores/members';
  import Avatar from './Avatar.svelte';
  
  export let selectedMemberIds: string[] = [];
  export let onClose: () => void;
  
  let searchQuery = '';
  
  onMount(async () => {
    await memberStore.loadMembers();
  });
  
  $: filteredMembers = $memberStore.members.filter(member => 
    member.username.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  function toggleMember(memberId: string) {
    if (selectedMemberIds.includes(memberId)) {
      selectedMemberIds = selectedMemberIds.filter(id => id !== memberId);
    } else {
      selectedMemberIds = [...selectedMemberIds, memberId];
    }
  }
  
  function selectAll() {
    selectedMemberIds = $memberStore.members.map(m => m.id);
  }
  
  function clearAll() {
    selectedMemberIds = [];
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
    <h3 class="text-base font-bold text-white">Select Members</h3>
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
  
  <!-- Search -->
  <div class="px-4 py-3 border-b border-white/10 shrink-0">
    <div class="relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search members..."
        class="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
      />
    </div>
  </div>
  
  <!-- Actions -->
  <div class="flex items-center gap-2 px-4 py-2 border-b border-white/10 shrink-0">
    <button
      type="button"
      on:click={selectAll}
      class="text-xs text-white/50 hover:text-white transition-colors"
    >
      Select All
    </button>
    <span class="text-white/20">•</span>
    <button
      type="button"
      on:click={clearAll}
      class="text-xs text-white/50 hover:text-white transition-colors"
    >
      Clear All
    </button>
    <div class="flex-1"></div>
    <span class="text-xs text-white/40">
      {selectedMemberIds.length} selected
    </span>
  </div>
  
  <!-- Member List -->
  <div class="flex-1 overflow-y-auto px-4 py-3 scrollbar-hide">
    {#if filteredMembers.length === 0}
      <div class="text-center py-8 text-white/30 text-sm">
        No members found
      </div>
    {:else}
      <div class="space-y-1">
        {#each filteredMembers as member}
          {@const isSelected = selectedMemberIds.includes(member.id)}
          <button
            type="button"
            on:click={() => toggleMember(member.id)}
            class="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors {isSelected ? 'bg-white/10' : ''}"
          >
            <Avatar
              alt={member.username}
              size="sm"
              status={member.presenceStatus === 'online' ? 'online' : member.presenceStatus === 'idle' ? 'away' : member.presenceStatus === 'dnd' ? 'busy' : 'offline'}
            />
            <div class="flex-1 min-w-0 text-left">
              <p class="text-sm font-medium text-white truncate">
                {member.username}
              </p>
              <p class="text-xs text-white/30 truncate">{member.role}</p>
            </div>
            <div class="shrink-0">
              {#if isSelected}
                <div class="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              {:else}
                <div class="w-5 h-5 rounded-full border-2 border-white/20"></div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Done Button -->
  <div class="px-4 py-3 border-t border-white/10 shrink-0" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
    <button
      type="button"
      on:click={onClose}
      class="w-full h-11 bg-white text-black font-bold rounded-xl transition-all active:scale-[0.98] hover:bg-white/90"
    >
      Done ({selectedMemberIds.length} selected)
    </button>
  </div>
</div>
