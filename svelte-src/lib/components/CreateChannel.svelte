<script lang="ts">
  import { Drawer } from 'vaul-svelte';
  import { fade } from 'svelte/transition';
  import { convexChannelStore } from '../stores/convexChannels';
  import { authStore } from '../stores/auth';
  import { apiPost } from '../utils/api';
  import MemberSelector from './MemberSelector.svelte';

  export let onClose: () => void;

  let name = '';
  let description = '';
  let isPrivate = false;
  let selectedMemberIds: string[] = [];
  let showMemberSelector = false;
  let error = '';
  let isLoading = false;

  async function handleCreate() {
    error = '';
    
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanName || cleanName.length < 2) {
      error = 'Channel name must be at least 2 characters';
      return;
    }
    
    if (!/^[a-z0-9-]+$/.test(cleanName)) {
      error = 'Channel name can only contain letters, numbers, and hyphens';
      return;
    }
    
    if (isPrivate && selectedMemberIds.length === 0) {
      error = 'Please select at least one member for the private channel';
      return;
    }

    isLoading = true;
    try {
      const res = await apiPost('/api/channels', { 
        name: cleanName, 
        description: description.trim(), 
        isPrivate,
        memberIds: isPrivate ? selectedMemberIds : []
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        error = data.error || 'Failed to create channel';
        return;
      }
      
      await convexChannelStore.loadChannels();
      convexChannelStore.selectChannel(data.id);
      onClose();
    } catch (err: any) {
      error = 'An unexpected error occurred';
    } finally {
      isLoading = false;
    }
  }
  
  function handlePrivateToggle() {
    isPrivate = !isPrivate;
    if (isPrivate) {
      showMemberSelector = true;
    } else {
      selectedMemberIds = [];
    }
  }
</script>

<Drawer.Root open={true} onOpenChange={(o) => !o && onClose()}>
  <Drawer.Portal>
    <Drawer.Overlay
      class="fixed inset-0 bg-black/80 z-[200]"
      transition={fade}
      transitionConfig={{ duration: 150 }}
      on:click={onClose}
    />
    <Drawer.Content
      class="fixed bottom-0 left-0 right-0 z-[200] flex flex-col bg-[#0a0a0a] rounded-t-[20px] max-h-[96vh] md:hidden outline-none"
      style="padding-bottom: env(safe-area-inset-bottom);"
    >
      <div class="flex-1 overflow-y-auto w-full max-w-md mx-auto relative px-4 pb-6">
        <div class="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/10 my-3"></div>
        
        <div class="flex items-center justify-between mb-6">
          <Drawer.Title class="text-[20px] font-bold text-white tracking-tight">Create Channel</Drawer.Title>
          <button type="button" on:click={onClose} class="p-2 -mr-2 text-white/40 hover:text-white transition-all duration-200 bg-white/5 rounded-full hover:scale-110 active:scale-95" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form class="space-y-4" on:submit|preventDefault={handleCreate}>
          {#if error}
            <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm font-medium">
              {error}
            </div>
          {/if}

          <div class="space-y-1.5">
            <label for="channel-name" class="text-[11px] font-bold text-white/40 uppercase tracking-widest pl-1">Channel Name</label>
              <input
                type="text"
                bind:value={name}
                placeholder="new-channel"
                maxlength={32}
                class="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-8 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
              />
            <p class="text-[11px] text-white/30 pl-1">Only lowercase letters, numbers, and hyphens.</p>
          </div>

          <div class="space-y-1.5">
            <label for="channel-desc" class="text-[11px] font-bold text-white/40 uppercase tracking-widest pl-1">Description (optional)</label>
            <input
              type="text"
              bind:value={description}
              placeholder="What's this channel about?"
              maxlength={100}
              class="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>

          <div class="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl mt-2">
            <div>
              <h4 class="text-sm font-bold text-white">Private Channel</h4>
              <p class="text-[11px] text-white/40 mt-0.5">Only selected members can see and message here.</p>
            </div>
            <button 
              type="button" 
              role="switch"
              aria-checked={isPrivate}
              on:click={handlePrivateToggle}
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 {isPrivate ? 'bg-white' : 'bg-white/20'}"
              aria-label="Toggle Private Channel"
            >
              <span class="inline-block h-4 w-4 transform rounded-full bg-black transition-all duration-200 {isPrivate ? 'translate-x-6' : 'translate-x-1'}"></span>
            </button>
          </div>
          
          {#if isPrivate}
            <button
              type="button"
              on:click={() => showMemberSelector = true}
              class="w-full p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-200 text-left hover:scale-[1.01] active:scale-99"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-white">Select Members</p>
                  <p class="text-xs text-white/40 mt-0.5">
                    {selectedMemberIds.length === 0 ? 'No members selected' : `${selectedMemberIds.length} member${selectedMemberIds.length === 1 ? '' : 's'} selected`}
                  </p>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </button>
          {/if}

          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            class="w-full mt-2 h-12 bg-white text-black font-bold rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 hover:scale-[1.02]"
          >
            {#if isLoading}
              <div class="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
              <span>Creating...</span>
            {:else}
              Create Channel
            {/if}
          </button>
        </form>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Desktop Modal Version -->
<div class="hidden md:flex fixed inset-0 z-[200] items-center justify-center p-4">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute inset-0 bg-black/80"
    transition:fade={{ duration: 150 }}
    on:click={onClose}
  ></div>
  <div 
    class="relative bg-[#0a0a0a] border border-white/10 w-full max-w-[400px] rounded-2xl shadow-2xl p-6"
    role="dialog"
    aria-modal="true"
    on:click|stopPropagation
  >
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-[20px] font-bold text-white tracking-tight">Create Channel</h2>
      <button type="button" on:click={onClose} class="p-2 -mr-2 text-white/40 hover:text-white transition-colors bg-white/5 rounded-full" aria-label="Close modal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <form class="space-y-4" on:submit|preventDefault={handleCreate}>
      {#if error}
        <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm font-medium">
          {error}
        </div>
      {/if}

      <div class="space-y-1.5">
        <label for="channel-name-desktop" class="text-[11px] font-bold text-white/40 uppercase tracking-widest pl-1">Channel Name</label>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 font-medium">#</span>
          <input
            type="text"
            bind:value={name}
            placeholder="new-channel"
            maxlength={32}
            class="pl-7 w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>
        <p class="text-[11px] text-white/30 pl-1">Only lowercase letters, numbers, and hyphens.</p>
      </div>

      <div class="space-y-1.5">
        <label for="channel-desc-desktop" class="text-[11px] font-bold text-white/40 uppercase tracking-widest pl-1">Description (optional)</label>
        <input
          type="text"
          bind:value={description}
          placeholder="What's this channel about?"
          maxlength={100}
          class="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
        />
      </div>

      <div class="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl mt-2">
        <div>
          <h4 class="text-sm font-bold text-white">Private Channel</h4>
          <p class="text-[11px] text-white/40 mt-0.5">Only members you invite can see and message here.</p>
        </div>
        <button 
          type="button" 
          role="switch"
          aria-checked={isPrivate}
          on:click={handlePrivateToggle}
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {isPrivate ? 'bg-white' : 'bg-white/20'}"
          aria-label="Toggle Private Channel"
        >
          <span class="inline-block h-4 w-4 transform rounded-full bg-black transition-transform {isPrivate ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>
      
      {#if isPrivate}
        <button
          type="button"
          on:click={() => showMemberSelector = true}
          class="w-full p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors text-left"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-white">Select Members</p>
              <p class="text-xs text-white/40 mt-0.5">
                {selectedMemberIds.length === 0 ? 'No members selected' : `${selectedMemberIds.length} member${selectedMemberIds.length === 1 ? '' : 's'} selected`}
              </p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </button>
      {/if}

      <button
        type="submit"
        disabled={isLoading || !name.trim()}
        class="w-full mt-2 h-11 bg-white text-black font-bold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
      >
        {#if isLoading}
          <div class="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
          <span>Creating...</span>
        {:else}
          Create Channel
        {/if}
      </button>
    </form>
  </div>
</div>

<!-- Member Selector Modal (Mobile - Drawer) -->
{#if showMemberSelector}
  <div class="md:hidden">
    <Drawer.Root open={true} onOpenChange={(o) => !o && (showMemberSelector = false)}>
      <Drawer.Portal>
        <Drawer.Overlay
          class="fixed inset-0 bg-black/80 z-[300]"
          transition={fade}
          transitionConfig={{ duration: 150 }}
        />
        <Drawer.Content
          class="fixed bottom-0 left-0 right-0 z-[300] flex flex-col bg-[#0a0a0a] rounded-t-[20px] h-[85vh] outline-none"
          style="padding-bottom: env(safe-area-inset-bottom);"
        >
          <div class="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/10 my-3"></div>
          <MemberSelector 
            bind:selectedMemberIds 
            onClose={() => showMemberSelector = false}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  </div>
  
  <!-- Member Selector Modal (Desktop) -->
  <div class="hidden md:flex fixed inset-0 z-[300] items-center justify-center p-4">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute inset-0 bg-black/80"
      transition:fade={{ duration: 150 }}
      on:click={() => showMemberSelector = false}
    ></div>
    <div 
      class="relative bg-[#0a0a0a] border border-white/10 w-full max-w-[500px] h-[600px] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      role="dialog"
      aria-modal="true"
      on:click|stopPropagation
    >
      <MemberSelector 
        bind:selectedMemberIds 
        onClose={() => showMemberSelector = false}
      />
    </div>
  </div>
{/if}
