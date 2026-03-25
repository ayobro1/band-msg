<script lang="ts">
  import { onMount } from 'svelte';
  import { Drawer } from 'vaul-svelte';
  import { fade } from 'svelte/transition';
  import { authStore } from '../stores/auth';
  import { convex } from '../convex';
  import { getBrowserUserAgentHash } from '../userAgentHash';
  import { api } from '../../../convex/_generated/api';
  import type { Id } from '../../../convex/_generated/dataModel';

  export let onClose: () => void;
  export let sessionToken: string;

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
  let hasCheckedAdmin = false;
  let isAdmin = false;

  onMount(async () => {
    if (sessionToken) {
      await checkAdminAndLoad();
    }
  });

  async function getAdminAuthArgs() {
    return {
      sessionToken,
      userAgentHash: await getBrowserUserAgentHash()
    };
  }

  async function checkAdminAndLoad() {
    // Prevent multiple checks
    if (hasCheckedAdmin) return;
    hasCheckedAdmin = true;
    
    if (!sessionToken) {
      console.error('[AdminPanel] No session token available');
      return;
    }
    
    try {
      await authStore.refreshUser();

      if ($authStore.user?.role !== 'admin') {
        isAdmin = false;
        return;
      }
      
      isAdmin = true;
      await loadData();
    } catch (error) {
      console.error('[AdminPanel] Session check failed:', error);
    }
  }

  async function loadData() {
    if (!sessionToken) {
      console.error('[AdminPanel] No session token available');
      return;
    }
    
    isLoading = true;
    try {
      const authArgs = await getAdminAuthArgs();
      const requests = await convex.query(api.signupRequests.getPending, authArgs);
      const users = await convex.query(api.auth.getAllUsers, authArgs);
      
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
      const authArgs = await getAdminAuthArgs();
      await convex.mutation(api.signupRequests.approve, { 
        ...authArgs,
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
      const authArgs = await getAdminAuthArgs();
      await convex.mutation(api.signupRequests.reject, { 
        ...authArgs,
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
      const authArgs = await getAdminAuthArgs();
      await convex.mutation(api.auth.promoteUser, { ...authArgs, userId: userId as Id<"users"> });
      await loadData();
    } catch (error) {
      console.error('[AdminPanel] Failed to promote:', error);
    } finally {
      isLoading = false;
    }
  }

  async function demoteUser(userId: string) {
    // Prevent self-demotion
    const currentUser = allUsers.find(u => u.id === userId);
    if (currentUser && currentUser.username.toLowerCase() === 'nolanc') {
      alert('Cannot demote yourself! You need to remain admin.');
      return;
    }
    
    if (!sessionToken || isLoading) return;
    isLoading = true;
    try {
      const authArgs = await getAdminAuthArgs();
      await convex.mutation(api.auth.demoteUser, { ...authArgs, userId: userId as Id<"users"> });
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
      const authArgs = await getAdminAuthArgs();
      await convex.mutation(api.auth.removeUser, { ...authArgs, userId: userId as Id<"users"> });
      await loadData();
    } catch (error) {
      console.error('[AdminPanel] Failed to remove:', error);
    } finally {
      isLoading = false;
    }
  }

  async function approveUser(userId: string) {
    if (!sessionToken || isLoading) {
      return;
    }
    isLoading = true;
    try {
      const authArgs = await getAdminAuthArgs();
      await convex.mutation(api.auth.approveUser, { ...authArgs, userId: userId as Id<"users"> });
      await loadData();
    } catch (error: any) {
      console.error('[AdminPanel] Failed to approve user:', error?.message || error);
      console.error('[AdminPanel] Error details:', error);
      alert('Failed to approve user: ' + (error?.message || 'Unknown error'));
    } finally {
      isLoading = false;
    }
  }
</script>

<!-- Unified Drawer for Mobile and Desktop -->
<Drawer.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 bg-black/80 z-[200]" transition={fade} transitionConfig={{ duration: 150 }} />
    <Drawer.Content class="fixed bottom-0 left-0 right-0 md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:bottom-auto md:right-auto z-[200] flex flex-col bg-black rounded-t-[20px] md:rounded-2xl max-h-[75vh] md:max-h-[85vh] md:w-full md:max-w-2xl outline-none" style="padding-bottom: env(safe-area-inset-bottom);">
      <div class="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/10 my-3 md:hidden"></div>
      
      <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 md:px-6 md:py-4">
        <h2 class="text-lg font-bold text-white md:text-xl">Admin Settings</h2>
        <button type="button" on:click={() => { if (!isLoading) onClose(); }} disabled={isLoading} class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 scrollbar-hide md:p-6">
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
            {#if allUsers.length === 0}
              <div class="bg-white/5 border border-white/8 rounded-xl p-4 text-center">
                <p class="text-white/40 text-sm">No users found</p>
                <p class="text-white/30 text-xs mt-1">Session token: {sessionToken ? 'Available' : 'Missing'}</p>
                <button type="button" on:click={loadData} class="mt-2 px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs">
                  Retry
                </button>
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
                          {:else if user.status === 'pending'}
                            <span class="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">Pending</span>
                          {/if}
                        </div>
                        <p class="text-xs text-white/35">{user.email || 'No email'} • {user.status}</p>
                      </div>
                      <div class="flex gap-2 shrink-0">
                        {#if user.status === 'pending'}
                          <button type="button" on:click|stopPropagation={() => approveUser(user.id)} disabled={isLoading} class="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-xs font-semibold disabled:opacity-50">
                            Approve
                          </button>
                        {:else if user.role === 'admin'}
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
            {/if}
          </div>
        {/if}
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
