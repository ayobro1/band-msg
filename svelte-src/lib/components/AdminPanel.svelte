<script lang="ts">
  import { onMount } from 'svelte';
  import { Drawer } from 'vaul-svelte';
  import { fade } from 'svelte/transition';
  import { authStore } from '../stores/auth';
  import { apiGet, apiPost } from '../utils/api';

  export let onClose: () => void;

  type PendingUser = {
    id: string;
    username: string;
    role: string;
    status: string;
    createdAt: number;
  };

  let pendingUsers: PendingUser[] = [];
  let allUsers: any[] = [];
  let isLoading = false;
  let activeTab: 'pending' | 'users' = 'pending';

  onMount(async () => {
    await loadPendingUsers();
    await loadAllUsers();
  });

  async function loadPendingUsers() {
    isLoading = true;
    try {
      const res = await apiGet('/api/admin/users');
      if (res.ok) {
        pendingUsers = await res.json();
      }
    } finally {
      isLoading = false;
    }
  }

  async function loadAllUsers() {
    allUsers = [];
  }

  async function approveUser(username: string) {
    const res = await apiPost('/api/admin/users/approve', { username });
    if (res.ok) {
      await loadPendingUsers();
    }
  }

  async function rejectUser(username: string) {
    const res = await apiPost('/api/admin/users/reject', { username });
    if (res.ok) {
      await loadPendingUsers();
    }
  }

  async function promoteUser(username: string) {
    const res = await apiPost('/api/admin/users/promote', { username });
    if (res.ok) {
      await loadPendingUsers();
    }
  }

  async function demoteUser(username: string) {
    const res = await apiPost('/api/admin/users/demote', { username });
    if (res.ok) {
      await loadPendingUsers();
    }
  }
</script>

<!-- Mobile Drawer -->
<Drawer.Root open={true} onOpenChange={(o) => !o && onClose()}>
  <Drawer.Portal>
    <Drawer.Overlay
      class="fixed inset-0 bg-black/80 z-[200] md:hidden"
      transition={fade}
      transitionConfig={{ duration: 150 }}
    />
    <Drawer.Content
      class="fixed bottom-0 left-0 right-0 z-[200] flex flex-col bg-black rounded-t-[20px] max-h-[92vh] md:hidden outline-none"
      style="padding-bottom: env(safe-area-inset-bottom);"
    >
      <div class="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/10 my-3"></div>
      
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <h2 class="text-lg font-bold text-white">Admin</h2>
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

      <!-- Tabs -->
      <div class="flex border-b border-white/10 shrink-0">
        <button
          type="button"
          on:click={() => activeTab = 'pending'}
          class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors {activeTab === 'pending' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/60'}"
        >
          Pending ({pendingUsers.length})
        </button>
        <button
          type="button"
          on:click={() => activeTab = 'users'}
          class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors {activeTab === 'users' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/60'}"
        >
          All Users
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {#if activeTab === 'pending'}
          {#if isLoading}
            <div class="text-center py-12 text-white/30 text-sm">Loading...</div>
          {:else if pendingUsers.length === 0}
            <div class="text-center py-12">
              <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-white/20">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <polyline points="17 11 19 13 23 9" />
                </svg>
              </div>
              <p class="text-sm text-white/30">No pending approvals</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each pendingUsers as user}
                <div class="bg-white/5 border border-white/8 rounded-xl p-3.5">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium text-white text-sm truncate">{user.username}</p>
                      <p class="text-xs text-white/35">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                      <button
                        type="button"
                        on:click={() => approveUser(user.username)}
                        class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        on:click={() => rejectUser(user.username)}
                        class="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-medium"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="text-center py-12">
            <p class="text-sm text-white/30">User management coming soon</p>
          </div>
        {/if}
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Desktop Modal -->
<div class="hidden md:flex fixed inset-0 bg-black/80 z-[200] items-center justify-center" style="padding-top: env(safe-area-inset-top);">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="absolute inset-0" on:click={onClose}></div>
  
  <div class="relative bg-black border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
      <h2 class="text-lg font-bold text-white">Admin</h2>
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

    <!-- Tabs -->
    <div class="flex border-b border-white/10 shrink-0">
      <button
        type="button"
        on:click={() => activeTab = 'pending'}
        class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors {activeTab === 'pending' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/60'}"
      >
        Pending ({pendingUsers.length})
      </button>
      <button
        type="button"
        on:click={() => activeTab = 'users'}
        class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors {activeTab === 'users' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/60'}"
      >
        All Users
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 scrollbar-hide">
      {#if activeTab === 'pending'}
        {#if isLoading}
          <div class="text-center py-12 text-white/30 text-sm">Loading...</div>
        {:else if pendingUsers.length === 0}
          <div class="text-center py-12">
            <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-white/20">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <polyline points="17 11 19 13 23 9" />
              </svg>
            </div>
            <p class="text-sm text-white/30">No pending approvals</p>
          </div>
        {:else}
          <div class="space-y-2">
            {#each pendingUsers as user}
              <div class="bg-white/5 border border-white/8 rounded-xl p-3.5">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-white text-sm truncate">{user.username}</p>
                    <p class="text-xs text-white/35">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button
                      type="button"
                      on:click={() => approveUser(user.username)}
                      class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      on:click={() => rejectUser(user.username)}
                      class="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-medium"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="text-center py-12">
          <p class="text-sm text-white/30">User management coming soon</p>
        </div>
      {/if}
    </div>
  </div>
</div>
