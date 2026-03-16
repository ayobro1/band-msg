<script lang="ts">
  import { onMount } from 'svelte';
  import { Drawer } from 'vaul-svelte';
  import { fade } from 'svelte/transition';

  export let channelId: string;
  export let channelName: string;
  export let onClose: () => void;

  let members: any[] = [];
  let isLoading = true;
  let newUsername = '';
  let addingUser = false;
  let error = '';

  async function loadMembers() {
    try {
      const res = await fetch(`/api/channels/${channelId}/members`);
      if (res.ok) {
        members = await res.json();
      }
    } catch (err) {
      console.error(err);
    } finally {
      isLoading = false;
    }
  }

  async function addMember() {
    if (!newUsername.trim()) return;
    
    addingUser = true;
    error = '';
    
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim() })
      });
      
      const data = await res.json();
      if (!res.ok) {
        error = data.error || 'Failed to add user';
      } else {
        newUsername = '';
        await loadMembers();
      }
    } catch (err) {
      error = 'Unexpected error occurred';
    } finally {
      addingUser = false;
    }
  }

  async function removeMember(username: string) {
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      
      if (res.ok) {
        await loadMembers();
      }
    } catch (err) {
      console.error(err);
    }
  }

  onMount(() => {
    loadMembers();
  });
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
      class="fixed bottom-0 left-0 right-0 z-[200] flex flex-col bg-[#2a2a2a] rounded-t-[20px] max-h-[96vh] md:hidden outline-none"
      style="padding-bottom: env(safe-area-inset-bottom);"
    >
      <div class="flex-1 overflow-y-auto w-full max-w-md mx-auto relative px-4 pb-6">
        <div class="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/10 my-3"></div>
        
        <div class="flex items-center justify-between mb-6">
          <div>
            <Drawer.Title class="text-[20px] font-bold text-white tracking-tight">Channel Settings</Drawer.Title>
            <p class="text-[13px] text-white/40 mt-1">#{channelName}</p>
          </div>
          <button type="button" on:click={onClose} class="p-2 -mr-2 text-white/40 hover:text-white transition-colors bg-white/5 rounded-full" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="space-y-6">
          <section>
            <h3 class="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3 pl-1">Add Member</h3>
            <form on:submit|preventDefault={addMember} class="flex gap-2">
              <input
                type="text"
                bind:value={newUsername}
                placeholder="Username (e.g. nolanc)"
                class="flex-1 bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                disabled={addingUser}
              />
              <button
                type="submit"
                disabled={!newUsername.trim() || addingUser}
                class="px-4 bg-white text-black font-bold rounded-xl disabled:opacity-50 text-sm whitespace-nowrap"
              >
                Add
              </button>
            </form>
            {#if error}
              <p class="text-xs text-red-400 mt-2 pl-1">{error}</p>
            {/if}
          </section>

          <section>
            <h3 class="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3 pl-1">Members ({members.length})</h3>
            
            <div class="space-y-1">
              {#if isLoading}
                <div class="p-4 text-center text-sm text-white/40">Loading members...</div>
              {:else if members.length === 0}
                <div class="p-4 text-center text-sm text-white/40">No members added yet.</div>
              {:else}
                {#each members as member}
                  <div class="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                    <span class="text-sm font-medium text-white">{member.username}</span>
                    <button
                      type="button"
                      on:click={() => removeMember(member.username)}
                      class="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1"
                    >
                      Remove
                    </button>
                  </div>
                {/each}
              {/if}
            </div>
          </section>
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Desktop Modal -->
<div class="hidden md:flex fixed inset-0 z-[200] items-center justify-center p-4">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="absolute inset-0 bg-black/80" transition:fade={{ duration: 150 }} on:click={onClose}></div>
  <div class="relative bg-[#2a2a2a] border border-white/30 w-full max-w-[400px] rounded-2xl shadow-2xl p-6" role="dialog" aria-modal="true">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-[20px] font-bold text-white tracking-tight">Channel Settings</h2>
        <p class="text-[13px] text-white/40 mt-1">#{channelName}</p>
      </div>
      <button type="button" on:click={onClose} class="p-2 -mr-2 text-white/40 hover:text-white transition-colors bg-white/5 rounded-full" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="space-y-6">
      <section>
        <h3 class="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3 pl-1">Add Member</h3>
        <form on:submit|preventDefault={addMember} class="flex gap-2">
          <input
            type="text"
            bind:value={newUsername}
            placeholder="Username (e.g. nolanc)"
            class="flex-1 bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
            disabled={addingUser}
          />
          <button
            type="submit"
            disabled={!newUsername.trim() || addingUser}
            class="px-4 bg-white text-black font-bold rounded-xl disabled:opacity-50 text-sm whitespace-nowrap"
          >
            Add
          </button>
        </form>
        {#if error}
          <p class="text-xs text-red-400 mt-2 pl-1">{error}</p>
        {/if}
      </section>

      <section>
        <h3 class="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3 pl-1">Members ({members.length})</h3>
        
        <div class="max-h-[300px] overflow-y-auto space-y-1 pr-1">
          {#if isLoading}
            <div class="p-4 text-center text-sm text-white/40">Loading members...</div>
          {:else if members.length === 0}
            <div class="p-4 text-center text-sm text-white/40">No members added yet.</div>
          {:else}
            {#each members as member}
              <div class="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <span class="text-sm font-medium text-white">{member.username}</span>
                <button
                  type="button"
                  on:click={() => removeMember(member.username)}
                  class="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1"
                >
                  Remove
                </button>
              </div>
            {/each}
          {/if}
        </div>
      </section>
    </div>
  </div>
</div>
