<script lang="ts">
  import { Drawer } from 'vaul-svelte';
  import { fade } from 'svelte/transition';
  import { authStore } from '../stores/auth';
  import { convexMessageStore } from '../stores/convexMessages';
  import { convex } from '../convex';
  import { api } from '../../../convex/_generated/api';
  import Avatar from './Avatar.svelte';
  import Spinner from './Spinner.svelte';

  export let open = false;
  export let onClose: () => void;

  let username = '';
  let bio = '';
  let avatarUrl = '';
  let isLoading = false;
  let error = '';
  let success = false;
  let fileInput: HTMLInputElement;

  $: if (open && $authStore.user) {
    username = $authStore.user.username || '';
    bio = $authStore.user.bio || '';
    avatarUrl = $authStore.user.avatarUrl || '';
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error = 'Please select an image file';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      error = 'Image must be under 2MB';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      avatarUrl = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!$convexMessageStore.sessionToken) {
      error = 'Not authenticated';
      return;
    }

    isLoading = true;
    error = '';
    success = false;

    try {
      await convex.mutation(api.users.updateProfile, {
        sessionToken: $convexMessageStore.sessionToken,
        username: username.trim() || undefined,
        bio: bio.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
      });

      authStore.updateUser({
        username: username.trim(),
        bio: bio.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
      });

      success = true;
      setTimeout(() => {
        success = false;
      }, 2000);
    } catch (err: any) {
      error = err.message || 'Failed to save profile';
    } finally {
      isLoading = false;
    }
  }

  function handleSignOut() {
    authStore.logout();
    onClose();
  }
</script>

<Drawer.Root bind:open onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 bg-black/60 z-[200]" transition={fade} transitionConfig={{ duration: 150 }} />
    <Drawer.Content class="fixed bottom-0 left-0 right-0 z-[201] flex flex-col bg-[#1a1a1a] rounded-t-[20px] outline-none max-h-[85vh]" style="padding-bottom: env(safe-area-inset-bottom);">
      <div class="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/20 my-3"></div>

      <div class="px-6 pb-8 overflow-y-auto">
        <div class="flex items-center gap-4 mb-6">
          <Avatar alt={$authStore.user?.username || 'User'} size="lg" status="online" />
          <div>
            <h2 class="text-xl font-bold text-white">{$authStore.user?.username || 'User'}</h2>
            <p class="text-sm text-white/50">{$authStore.user?.role || 'member'}</p>
          </div>
        </div>

        {#if error}
          <div class="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        {/if}

        {#if success}
          <div class="mb-4 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm flex items-center gap-2 animate-pulse">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Profile saved!
          </div>
        {/if}

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-white/70 mb-2">Avatar</label>
            <div class="flex items-center gap-3">
              <div class="relative">
                {#if avatarUrl}
                  <img src={avatarUrl} alt="Avatar preview" class="w-16 h-16 rounded-full object-cover" />
                {:else}
                  <div class="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                    <svg class="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                {/if}
              </div>
              <div class="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  bind:this={fileInput}
                  on:change={handleFileSelect}
                  class="hidden"
                  id="avatar-upload"
                />
                <button
                  type="button"
                  on:click={() => fileInput?.click()}
                  disabled={isLoading}
                  class="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  Upload Image
                </button>
                <p class="text-xs text-white/30 mt-1">Max 2MB, JPG/PNG</p>
              </div>
            </div>
            <input
              type="url"
              bind:value={avatarUrl}
              disabled={isLoading}
              class="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors disabled:opacity-50 mt-2 text-sm"
              placeholder="Or paste image URL"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-white/70 mb-2">Username</label>
            <input
              type="text"
              bind:value={username}
              disabled={isLoading}
              maxlength="20"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors disabled:opacity-50"
              placeholder="Your username"
            />
            <p class="text-xs text-white/30 mt-1">3-20 characters, letters, numbers, hyphens, underscores</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-white/70 mb-2">Bio</label>
            <textarea
              bind:value={bio}
              disabled={isLoading}
              maxlength="160"
              rows="3"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors resize-none disabled:opacity-50"
              placeholder="Tell others about yourself..."
            ></textarea>
            <p class="text-xs text-white/30 mt-1">{bio.length}/160 characters</p>
          </div>

          <button
            type="button"
            on:click={saveProfile}
            disabled={isLoading}
            class="w-full px-4 py-3 bg-white text-black rounded-xl hover:bg-white/90 transition-all duration-200 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if isLoading}
              <Spinner size="sm" />
              <span>Saving...</span>
            {:else}
              Save Changes
            {/if}
          </button>

          <button
            type="button"
            on:click={handleSignOut}
            disabled={isLoading}
            class="w-full px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/20 transition-all duration-200 font-medium flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
