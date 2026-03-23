<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { apiPost } from '../utils/api';
  
  const dispatch = createEventDispatcher();
  
  export let suggestedUsername = '';
  
  let username = suggestedUsername;
  let error = '';
  let isLoading = false;
  
  async function handleSubmit() {
    error = '';
    
    if (!username || username.trim().length < 3) {
      error = 'Username must be at least 3 characters';
      return;
    }
    
    if (username.length > 20) {
      error = 'Username must be 20 characters or less';
      return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      error = 'Username can only contain letters, numbers, hyphens, and underscores';
      return;
    }
    
    isLoading = true;
    
    try {
      const response = await apiPost('/api/auth/set-username', { username: username.trim() });
      
      if (response.ok) {
        dispatch('complete');
      } else {
        const data = await response.json();
        error = data.error || 'Failed to set username';
      }
    } catch (err) {
      error = 'Network error. Please try again.';
    } finally {
      isLoading = false;
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }
</script>

<div class="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-black via-[#0a0a0a] to-black px-6">
  <!-- Animated background elements -->
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse-subtle"></div>
    <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse-subtle" style="animation-delay: 1s;"></div>
  </div>

  <div class="w-full max-w-md relative z-10">
    <!-- Logo -->
    <div class="flex justify-center mb-8 animate-fade-in">
      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300"></div>
        <div class="relative w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-2xl hover-lift">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- Card -->
    <div class="relative group">
      <!-- Glow effect -->
      <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      
      <div class="relative bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl animate-scale-in backdrop-blur-xl">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-white mb-2">Choose Your Username</h1>
          <p class="text-white/60">This is how others will see you in Band Chat</p>
        </div>

        {#if error}
          <div class="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-slide-down flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        {/if}

        <div class="space-y-6">
          <!-- Username Input -->
          <div class="wave-group">
            <input
              id="username-setup-input"
              required
              type="text"
              class="input"
              bind:value={username}
              on:keydown={handleKeyDown}
              disabled={isLoading}
              maxlength="20"
            />
            <span class="bar"></span>
            <label class="label" for="username-setup-input">
              <span class="label-char" style="--index: 0">U</span>
              <span class="label-char" style="--index: 1">s</span>
              <span class="label-char" style="--index: 2">e</span>
              <span class="label-char" style="--index: 3">r</span>
              <span class="label-char" style="--index: 4">n</span>
              <span class="label-char" style="--index: 5">a</span>
              <span class="label-char" style="--index: 6">m</span>
              <span class="label-char" style="--index: 7">e</span>
            </label>
          </div>

          <div class="text-xs text-white/40 -mt-2">
            <p>• 3-20 characters</p>
            <p>• Letters, numbers, hyphens, and underscores only</p>
          </div>

          <button
            type="button"
            on:click={handleSubmit}
            disabled={isLoading}
            class="submit-btn w-full"
          >
            {#if isLoading}
              <svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span class="submit-text">Setting up...</span>
            {:else}
              <span class="submit-text">Continue</span>
              <svg class="submit-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </div>

    <p class="text-center text-white/20 text-xs mt-6 animate-fade-in" style="animation-delay: 200ms;">
      You can change this later in settings
    </p>
  </div>
</div>

<style>
  .wave-group {
    position: relative;
  }

  .wave-group .input {
    font-size: 16px;
    padding: 10px 10px 10px 5px;
    display: block;
    width: 100%;
    border: none;
    border-bottom: 1px solid #515151;
    background: transparent;
    color: white;
  }

  .wave-group .input:focus {
    outline: none;
  }

  .wave-group .input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .wave-group .label {
    color: #999;
    font-size: 18px;
    font-weight: normal;
    position: absolute;
    pointer-events: none;
    left: 5px;
    top: 10px;
    display: flex;
  }

  .wave-group .label-char {
    transition: 0.2s ease all;
    transition-delay: calc(var(--index) * .05s);
  }

  .wave-group .input:focus ~ label .label-char,
  .wave-group .input:valid ~ label .label-char {
    transform: translateY(-20px);
    font-size: 14px;
    color: #ffffff;
  }

  .wave-group .bar {
    position: relative;
    display: block;
    width: 100%;
  }

  .wave-group .bar:before,
  .wave-group .bar:after {
    content: '';
    height: 2px;
    width: 0;
    bottom: 1px;
    position: absolute;
    background: #ffffff;
    transition: 0.2s ease all;
  }

  .wave-group .bar:before {
    left: 50%;
  }

  .wave-group .bar:after {
    right: 50%;
  }

  .wave-group .input:focus ~ .bar:before,
  .wave-group .input:focus ~ .bar:after {
    width: 50%;
  }

  .submit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 28px;
    background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    color: #000000;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
    position: relative;
    overflow: hidden;
  }

  .submit-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0));
    transform: translateX(-100%);
    transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .submit-btn:hover::before {
    transform: translateX(100%);
  }

  .submit-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.2);
  }

  .submit-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  .submit-icon {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .submit-btn:hover:not(:disabled) .submit-icon {
    transform: translateX(4px);
  }

  .submit-text {
    position: relative;
    z-index: 1;
  }
</style>
