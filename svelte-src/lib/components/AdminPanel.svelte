<script lang="ts">
  import { onMount } from 'svelte';
  import { Drawer } from 'vaul-svelte';
  import { fade } from 'svelte/transition';
  import { convex } from '../convex';
  import { api } from '../../../convex/_generated/api';
  import type { Id } from '../../../convex/_generated/dataModel';
  import { convexMessageStore } from '../stores/convexMessages';

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

  let signupRequests: SignupRequest[] = [];
  let allUsers: User[] = [];
  let isLoading = false;
  let sessionToken = '';

  onMount(() => {
    const unsubscribe = convexMessageStore.subscribe(async state => {
      sessionToken = state.sessionToken;
      if (sessionToken) {
        await loadData();
      }
    });
    return unsubscribe;
  });

  async function loadData() {
    if (!sessionToken) return;
    isLoading = true;
    try {
      const [requests, users] = await Promise.all([
        convex.query(api.signupRequests.getPending, { sessionToken }),
        convex.query(api.auth.getAllUsers, { sessionToken })
      ]);
      signupRequests = requests;
      allUsers = users;
    } catch (error) {
      console.error('[AdminPanel] Failed to load data:', error);
    } finally {
      isLoading = false;
    }
  }

  async function approveSignupRequest(requestId: string) {
    if (!sessionToken || isLoading) return;
    isLoading = true;
    try {
      await convex.mutation(api.signupRequests.approve, { 
        sessionToken, 
        requestId: requestId as Id<"signupRequests"> 
      });
      await loadData();
    } catch (error) {
      console.error('[AdminPanel] Failed to approve:', error);
    } finally {
      isLoading = false;
    }
  }

  async function rejectSignupRequest(requestId: string) {
    if (!sessionToken || isLoading) return;
    isLoading = true;
    try {
      await convex.mutation(api.signupRequests.reject, { 
        sessionToken, 
        requestId: requestId as Id<"signupRequests"> 
      });
      await loadData();
    } catch (error) {
      console.error('[AdminPanel] Failed to reject:', error);
    } finally {
      isLoading = false;
    }
  }

  async function promoteUser(userId: string) {
    if (!sessionToken || isLoading) return;
    isLoading = true;
    try {
      await convex.mutation(api.auth.promoteUser, { sessionToken, userId: userId as Id<"users"> });
      await loadData();
    } catch (error) {
      console.error('[AdminPanel] Failed to promote:', error);
    } finally {
      isLoading = false;
    }
  }

  async function demoteUser(userId: string) {
    if (!sessionToken || isLoading) return;
    isLoading = true;
    try {
      await convex.mutation(api.auth.demoteUser, { sessionToken, userId: userId as Id<"users"> });
      await loadData();
    } catch (error) {
      console.error('[AdminPanel] Failed to demote:', error);
    } finally {
      isLoading = false;
    }
  }

  async function removeUser(userId: string, username: string) {
    if (!sessionToken || isLoading) return;
    if (!confirm(`Remove ${username}? This cannot be undone.`)) return;
    isLoading = true;
    try {
      await convex.mutation(api.auth.removeUser, { sessionToken, userId: userId as Id<"users"> });
      await loadData();
    } catch (error) {
      console.error('[AdminPanel] Failed to remove:', error);
    } finally {
      isLoading = false;
    }
  }
</script>

<!-- Mobile Drawer -->
<Drawer.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 bg-black/80 z-[200] md:hidden" transition={fade} transitionConfig={{ duration: 150 }} />
    <Drawer.Content class="fixed bottom-0 left-0 right-0 z-[200] flex flex-col bg-black rounded-t-[20px] max-h-[92vh] md:hidden outline-none" style="padding-bottom: env(safe-area-inset-bottom);">
      <div class="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/10 my-3"></div>
      
      <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <h2 class="text-lg font-bold text-white">Admin Settings</h2>
        <button type="button" on:click={onClose} class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {#if isLoading}
          <div class="text-center py-12 text-white/30 text-sm">Loading...</div>
        {:else}
          <!-- Signup Requests -->
          {#if signupRequests.length > 0}
            <div class="mb-6">
              <h3 class="text-sm font-semibold text-white/60 mb-3">Signup Requests ({signupRequests.length})</h3>
              <div class="space-y-2">
                {#each signupRequests as request}
                  <div class="bg-white/5 border border-white/8 rounded-xl p-3.5">
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <p class="font-medium text-white text-sm truncate">{request.username}</p>
                        <p class="text-xs text-white/35">{new Date(request.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div class="flex gap-2 shrink-0">
                        <button type="button" on:click|stopPropagation={() => approveSignupRequest(request.id)} disabled={isLoading} class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold disabled:opacity-50">
                          Approve
                        </button>
                        <button type="button" on:click|stopPropagation={() => rejectSignupRequest(request.id)} disabled={isLoading} class="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-medium disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- All Users -->
          <div>
            <h3 class="text-sm font-semibold text-white/60 mb-3">All Users ({allUsers.length})</h3>
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
                      <p class="text-xs text-white/35">{user.email || 'No email'} • {user.status}</p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                      {#if user.role === 'admin'}
                        <button type="button" on:click|stopPropagation={() => demoteUser(user.id)} disabled={isLoading} class="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-medium disabled:opacity-50">
                          Demote
                        </button>
                      {:else}
                        <button type="button" on:click|stopPropagation={() => promoteUser(user.id)} disabled={isLoading} class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold disabled:opacity-50">
                          Promote
                        </button>
                      {/if}
                      <button type="button" on:click|stopPropagation={() => removeUser(user.id, user.username)} disabled={isLoading} class="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-xs font-medium disabled:opacity-50">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Desktop Modal -->
<div class="hidden md:flex fixed inset-0 z-[200] items-center justify-center" style="padding-top: env(safe-area-inset-top);">
  <!-- Overlay Background -->
  <div class="absolute inset-0 bg-black/80"></div>
  
  <!-- Modal Content -->
  <div class="relative bg-black border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col z-10">
    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
      <h2 class="text-lg font-bold text-white">Admin Settings</h2>
      <button type="button" on:click={() => { if (!isLoading) onClose(); }} disabled={isLoading} class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 scrollbar-hide">
      {#if isLoading}
        <div class="text-center py-12 text-white/30 text-sm">Loading...</div>
      {:else}
        <!-- Signup Requests -->
        {#if signupRequests.length > 0}
          <div class="mb-6">
            <h3 class="text-sm font-semibold text-white/60 mb-3">Signup Requests ({signupRequests.length})</h3>
            <div class="space-y-2">
              {#each signupRequests as request}
                <div class="bg-white/5 border border-white/8 rounded-xl p-3.5">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium text-white text-sm truncate">{request.username}</p>
                      <p class="text-xs text-white/35">{new Date(request.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                      <button type="button" on:click|stopPropagation={() => approveSignupRequest(request.id)} disabled={isLoading} class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold disabled:opacity-50">
                        Approve
                      </button>
                      <button type="button" on:click|stopPropagation={() => rejectSignupRequest(request.id)} disabled={isLoading} class="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-medium disabled:opacity-50">
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- All Users -->
        <div>
          <h3 class="text-sm font-semibold text-white/60 mb-3">All Users ({allUsers.length})</h3>
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
                    <p class="text-xs text-white/35">{user.email || 'No email'} • {user.status}</p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    {#if user.role === 'admin'}
                      <button type="button" on:click|stopPropagation={() => demoteUser(user.id)} disabled={isLoading} class="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-medium disabled:opacity-50">
                        Demote
                      </button>
                    {:else}
                      <button type="button" on:click|stopPropagation={() => promoteUser(user.id)} disabled={isLoading} class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors text-xs font-semibold disabled:opacity-50">
                        Promote
                      </button>
                    {/if}
                    <button type="button" on:click|stopPropagation={() => removeUser(user.id, user.username)} disabled={isLoading} class="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-xs font-medium disabled:opacity-50">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
