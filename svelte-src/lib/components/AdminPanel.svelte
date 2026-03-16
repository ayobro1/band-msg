<script lang="ts">
  import { onMount } from 'svelte';
  import { Drawer } from 'vaul-svelte';
  import { fade } from 'svelte/transition';
  import { convex } from '../convex';
  import { api } from '../../../convex/_generated/api';
  import type { Id } from '../../../convex/_generated/dataModel';
  import { convexMessageStore } from '../stores/convexMessages';
  import { apiPost } from '../utils/api';

  export let onClose: () => void;

  type User = {
    id: string;
    username: string;
    email?: string;
    role: string;
    status: string;
    createdAt: number;
  };

  type SignupRequest = {
    id: string;
    username: string;
    status: string;
    createdAt: number;
  };

  let pendingUsers: User[] = [];
  let signupRequests: SignupRequest[] = [];
  let allUsers: User[] = [];
  let isLoading = false;
  let activeTab: 'requests' | 'pending' | 'users' = 'requests';
  let sessionToken = '';

  onMount(() => {
    // Get session token from store
    const unsubscribe = convexMessageStore.subscribe(async state => {
      sessionToken = state.sessionToken;
      console.log('[AdminPanel] Session token updated:', !!sessionToken);

      if (sessionToken) {
        await loadSignupRequests();
        await loadPendingUsers();
        await loadAllUsers();
      }
    });

    return unsubscribe;
  });

  async function loadSignupRequests() {
    if (!sessionToken) return;
    
    console.log('[AdminPanel] Loading signup requests...');
    isLoading = true;
    try {
      const requests = await convex.query(api.signupRequests.getPending, { sessionToken });
      console.log('[AdminPanel] Signup requests loaded:', requests);
      signupRequests = requests;
    } catch (error) {
      console.error('[AdminPanel] Failed to load signup requests:', error);
    } finally {
      isLoading = false;
    }
  }

  async function loadPendingUsers() {
    if (!sessionToken) return;
    
    console.log('[AdminPanel] Loading pending users...');
    isLoading = true;
    try {
      const users = await convex.query(api.auth.getPendingUsers, { sessionToken });
      console.log('[AdminPanel] Pending users loaded:', users);
      pendingUsers = users;
    } catch (error) {
      console.error('[AdminPanel] Failed to load pending users:', error);
    } finally {
      isLoading = false;
    }
  }

  async function loadAllUsers() {
    if (!sessionToken) return;
    
    console.log('[AdminPanel] Loading all users...');
    try {
      const users = await convex.query(api.auth.getAllUsers, { sessionToken });
      console.log('[AdminPanel] All users loaded:', users);
      allUsers = users;
    } catch (error) {
      console.error('[AdminPanel] Failed to load all users:', error);
    }
  }

  async function approveSignupRequest(requestId: string) {
    if (!sessionToken) return;
    
    console.log('[AdminPanel] Approving signup request:', requestId);
    try {
      const result = await convex.mutation(api.signupRequests.approve, { 
        sessionToken, 
        requestId: requestId as Id<"signupRequests"> 
      });
      console.log('[AdminPanel] Signup request approved successfully:', result);
      // Reload the list to remove the approved request
      await loadSignupRequests();
    } catch (error) {
      console.error('[AdminPanel] Failed to approve signup request:', error);
      alert('Failed to approve: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  async function rejectSignupRequest(requestId: string) {
    if (!sessionToken) return;
    
    console.log('[AdminPanel] Rejecting signup request:', requestId);
    try {
      const result = await convex.mutation(api.signupRequests.reject, { 
        sessionToken, 
        requestId: requestId as Id<"signupRequests"> 
      });
      console.log('[AdminPanel] Signup request rejected successfully:', result);
      // Reload the list to remove the rejected request
      await loadSignupRequests();
    } catch (error) {
      console.error('[AdminPanel] Failed to reject signup request:', error);
      alert('Failed to reject: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  async function approveUser(userId: string, username: string) {
    if (!sessionToken) return;
    
    try {
      await convex.mutation(api.auth.approveUser, { 
        sessionToken, 
        userId: userId as Id<"users"> 
      });
      // Also approve in SQL via SvelteKit API
      await apiPost('/api/admin/users/approve', { username });
      
      await loadPendingUsers();
      await loadAllUsers();
    } catch (error) {
      console.error('[AdminPanel] Failed to approve user:', error);
    }
  }

  async function rejectUser(userId: string, username: string) {
    if (!sessionToken) return;
    
    try {
      await convex.mutation(api.auth.rejectUser, { 
        sessionToken, 
        userId: userId as Id<"users"> 
      });
      // Also reject in SQL via SvelteKit API
      await apiPost('/api/admin/users/reject', { username });
      
      await loadPendingUsers();
      await loadAllUsers();
    } catch (error) {
      console.error('[AdminPanel] Failed to reject user:', error);
    }
  }

  async function promoteUser(userId: string, username: string) {
    if (!sessionToken) return;
    
    try {
      await convex.mutation(api.auth.promoteUser, { 
        sessionToken, 
        userId: userId as Id<"users"> 
      });
      // Also promote in SQL
      await apiPost('/api/admin/users/promote', { username });
      
      await loadAllUsers();
    } catch (error) {
      console.error('[AdminPanel] Failed to promote user:', error);
    }
  }

  async function demoteUser(userId: string, username: string) {
    if (!sessionToken) return;
    
    try {
      await convex.mutation(api.auth.demoteUser, { 
        sessionToken, 
        userId: userId as Id<"users"> 
      });
      // Also demote in SQL
      await apiPost('/api/admin/users/demote', { username });
      
      await loadAllUsers();
    } catch (error) {
      console.error('[AdminPanel] Failed to demote user:', error);
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
          on:click={() => activeTab = 'requests'}
          class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors {activeTab === 'requests' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/60'}"
        >
          Requests ({signupRequests.length})
        </button>
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
        {#if activeTab === 'requests'}
          {#if isLoading}
            <div class="text-center py-12 text-white/30 text-sm">Loading...</div>
          {:else if signupRequests.length === 0}
            <div class="text-center py-12">
              <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-white/20">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <polyline points="17 11 19 13 23 9" />
                </svg>
              </div>
              <p class="text-sm text-white/30">No signup requests</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each signupRequests as request}
                <div class="bg-white/5 border border-white/8 rounded-xl p-3.5">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium text-white text-sm truncate">{request.username}</p>
                      <p class="text-xs text-white/35">
                        {new Date(request.createdAt).toLocaleDateString()} • {request.status}
                      </p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                      <button
                        type="button"
                        on:click={() => approveSignupRequest(request.id)}
                        class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        on:click={() => rejectSignupRequest(request.id)}
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
        {:else if activeTab === 'pending'}
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
                        on:click={() => approveUser(user.id, user.username)}
                        class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        on:click={() => rejectUser(user.id, user.username)}
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
          {#if allUsers.length === 0}
            <div class="text-center py-12">
              <p class="text-sm text-white/30">No users found</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each allUsers as user}
                <div class="bg-white/5 border border-white/8 rounded-xl p-3.5">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <p class="font-medium text-white text-sm truncate">{user.username}</p>
                        {#if user.role === 'admin'}
                          <span class="px-1.5 py-0.5 bg-white/10 text-white/60 rounded text-xs font-medium">Admin</span>
                        {/if}
                      </div>
                      <p class="text-xs text-white/35">
                        {user.email || 'No email'} • {user.status}
                      </p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                      {#if user.role === 'admin'}
                        <button
                          type="button"
                          on:click={() => demoteUser(user.id, user.username)}
                          class="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-medium"
                        >
                          Demote
                        </button>
                      {:else}
                        <button
                          type="button"
                          on:click={() => promoteUser(user.id, user.username)}
                          class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold"
                        >
                          Promote
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
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
        on:click={() => activeTab = 'requests'}
        class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors {activeTab === 'requests' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/60'}"
      >
        Requests ({signupRequests.length})
      </button>
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
      {#if activeTab === 'requests'}
        {#if isLoading}
          <div class="text-center py-12 text-white/30 text-sm">Loading...</div>
        {:else if signupRequests.length === 0}
          <div class="text-center py-12">
            <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-white/20">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <polyline points="17 11 19 13 23 9" />
              </svg>
            </div>
            <p class="text-sm text-white/30">No signup requests</p>
          </div>
        {:else}
          <div class="space-y-2">
            {#each signupRequests as request}
              <div class="bg-white/5 border border-white/8 rounded-xl p-3.5">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-white text-sm truncate">{request.username}</p>
                    <p class="text-xs text-white/35">
                      {new Date(request.createdAt).toLocaleDateString()} • {request.status}
                    </p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button
                      type="button"
                      on:click={() => approveSignupRequest(request.id)}
                      class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      on:click={() => rejectSignupRequest(request.id)}
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
      {:else if activeTab === 'pending'}
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
                      on:click={() => approveUser(user.id, user.username)}
                      class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      on:click={() => rejectUser(user.id, user.username)}
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
        {#if allUsers.length === 0}
          <div class="text-center py-12">
            <p class="text-sm text-white/30">No users found</p>
          </div>
        {:else}
          <div class="space-y-2">
            {#each allUsers as user}
              <div class="bg-white/5 border border-white/8 rounded-xl p-3.5">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p class="font-medium text-white text-sm truncate">{user.username}</p>
                      {#if user.role === 'admin'}
                        <span class="px-1.5 py-0.5 bg-white/10 text-white/60 rounded text-xs font-medium">Admin</span>
                      {/if}
                    </div>
                    <p class="text-xs text-white/35">
                      {user.email || 'No email'} • {user.status}
                    </p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    {#if user.role === 'admin'}
                      <button
                        type="button"
                        on:click={() => demoteUser(user.id, user.username)}
                        class="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-medium"
                      >
                        Demote
                      </button>
                    {:else}
                      <button
                        type="button"
                        on:click={() => promoteUser(user.id, user.username)}
                        class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold"
                      >
                        Promote
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
