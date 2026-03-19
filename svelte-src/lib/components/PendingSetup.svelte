<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { browser } from '$app/environment';

  let username = '';
  let displayName = '';
  let isLoading = false;
  let error = '';

  onMount(async () => {
    await authStore.checkAuth();
    
    // If not pending or already approved, redirect away
    if (!$authStore.user || $authStore.user.status === 'approved') {
      goto('/');
      return;
    }

    // Pre-fill with existing username
    username = $authStore.user?.username || '';
    displayName = $authStore.user?.display_name || '';
  });

  async function updateProfile() {
    if (!username.trim()) {
      error = 'Username is required';
      return;
    }

    isLoading = true;
    error = '';

    try {
      const { apiPost } = await import('$lib/utils/api');
      const result = await apiPost('/api/auth/set-username', {
        username: username.trim(),
        displayName: displayName.trim()
      });

      if (result.success) {
        await authStore.checkAuth();
      } else {
        error = result.error || 'Failed to update profile';
      }
    } catch (err) {
      error = 'Failed to update profile';
      console.error(err);
    } finally {
      isLoading = false;
    }
  }

  async function logout() {
    try {
      const { apiPost } = await import('$lib/utils/api');
      await apiPost('/api/auth/logout', {});
      goto('/');
    } catch (err) {
      console.error('Logout failed:', err);
      goto('/');
    }
  }
</script>

<svelte:head>
  <title>Complete Your Profile - Band Chat</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="bg-gray-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 p-8">
      <!-- Logo / Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-4">
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white mb-2">Complete Your Profile</h1>
        <p class="text-gray-400 text-sm">Set up your profile while waiting for admin approval</p>
      </div>

      <!-- Pending Status Banner -->
      <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0">
            <svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-yellow-400 font-medium text-sm">Awaiting Admin Approval</p>
            <p class="text-yellow-400/70 text-xs mt-0.5">An admin will review your account soon</p>
          </div>
        </div>
      </div>

      <!-- Profile Form -->
      <form on:submit|preventDefault={updateProfile} class="space-y-5">
        <div>
          <label for="username" class="block text-sm font-medium text-gray-300 mb-1.5">
            Username <span class="text-red-400">*</span>
          </label>
          <input
            id="username"
            type="text"
            bind:value={username}
            class="w-full px-4 py-2.5 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
            placeholder="your_username"
            minlength="3"
            maxlength="20"
            pattern="[a-zA-Z0-9_]+"
          />
          <p class="text-xs text-gray-500 mt-1">3-20 characters, letters, numbers, underscores only</p>
        </div>

        <div>
          <label for="displayName" class="block text-sm font-medium text-gray-300 mb-1.5">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            bind:value={displayName}
            class="w-full px-4 py-2.5 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
            placeholder="Your Display Name"
            maxlength="50"
          />
        </div>

        {#if error}
          <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            <p class="text-red-400 text-sm">{error}</p>
          </div>
        {/if}

        <button
          type="submit"
          disabled={isLoading}
          class="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {#if isLoading}
            <span class="flex items-center justify-center gap-2">
              <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </span>
          {:else}
            Save Profile
          {/if}
        </button>
      </form>

      <!-- Logout Link -->
      <div class="mt-6 pt-6 border-t border-gray-700/50 text-center">
        <button
          on:click={logout}
          class="text-gray-400 hover:text-gray-300 text-sm transition"
        >
          Sign out and use a different account
        </button>
      </div>
    </div>
  </div>
</div>
