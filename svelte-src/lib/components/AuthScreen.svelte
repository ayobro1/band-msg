<script lang="ts">
  import { authStore } from '../stores/auth';
  import Spinner from './Spinner.svelte';

  let mode: 'login' | 'register' = 'login';
  let username = '';
  let password = '';
  let error = '';

  async function handleSubmit() {
    error = '';
    
    if (!username || !password) {
      error = 'Please fill in all fields';
      return;
    }

    if (mode === 'register' && password.length < 12) {
      error = 'Password must be at least 12 characters';
      return;
    }

    const result = mode === 'login'
      ? await authStore.login(username, password)
      : await authStore.register(username, password);

    if (!result.success) {
      error = result.error || 'An error occurred';
    } else if (mode === 'register') {
      error = '';
      mode = 'login';
      password = '';
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }

  function handleGoogleSignIn() {
    window.location.href = '/api/auth/google';
  }
</script>

{#if $authStore.isLoading}
  <Spinner fullscreen={true} />
{/if}

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
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Card -->
    <div class="relative group">
      <!-- Glow effect -->
      <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      
      <div class="relative bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl animate-scale-in backdrop-blur-xl">
        <h1 class="text-2xl font-bold text-white mb-2 text-center">
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h1>
        <p class="text-white/40 text-center mb-6">
          {mode === 'login' ? 'Sign in to your band chat' : 'Join your band chat'}
        </p>

        {#if error}
          <div class="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-slide-down flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        {:else if $authStore.user?.status === 'pending'}
          <div class="mb-4 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm animate-slide-down flex flex-col gap-1">
            <div class="flex items-center gap-2 font-semibold">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Approval Pending
            </div>
            <p class="text-xs opacity-70">Your account is waiting for admin approval. Please check back later.</p>
          </div>
        {/if}

        <!-- Google Sign In Button -->
        <button
          type="button"
          on:click={handleGoogleSignIn}
          class="google-btn w-full mb-6"
        >
          <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span class="google-text">Continue with Google</span>
        </button>

        <!-- Divider -->
        <div class="flex items-center gap-3 mb-6">
          <div class="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
          <span class="text-xs text-white/30 font-medium">OR</span>
          <div class="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        </div>

        <div class="space-y-6">
          <!-- Username Input -->
          <div class="wave-group">
            <input
              required
              type="text"
              class="input"
              bind:value={username}
              on:keydown={handleKeyDown}
            />
            <span class="bar"></span>
            <label class="label">
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

          <!-- Password Input -->
          <div class="wave-group">
            <input
              required
              type="password"
              class="input"
              bind:value={password}
              on:keydown={handleKeyDown}
            />
            <span class="bar"></span>
            <label class="label">
              <span class="label-char" style="--index: 0">P</span>
              <span class="label-char" style="--index: 1">a</span>
              <span class="label-char" style="--index: 2">s</span>
              <span class="label-char" style="--index: 3">s</span>
              <span class="label-char" style="--index: 4">w</span>
              <span class="label-char" style="--index: 5">o</span>
              <span class="label-char" style="--index: 6">r</span>
              <span class="label-char" style="--index: 7">d</span>
            </label>
          </div>

          {#if mode === 'register'}
            <p class="text-xs text-white/30 -mt-4">Minimum 12 characters</p>
          {/if}

          <button
            type="button"
            on:click={handleSubmit}
            disabled={$authStore.isLoading}
            class="submit-btn w-full"
          >
            <span class="submit-text">{mode === 'login' ? 'Sign in' : 'Create account'}</span>
            <svg class="submit-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>

        <div class="mt-6 text-center">
          <button
            type="button"
            on:click={() => { mode = mode === 'login' ? 'register' : 'login'; error = ''; }}
            class="text-sm text-white/40 hover:text-white/80 transition-all duration-200 hover:scale-105 font-medium"
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>

    <p class="text-center text-white/20 text-xs mt-6 animate-fade-in" style="animation-delay: 200ms;">
      Band Chat - Secure Team Communication
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
    -moz-transition: 0.2s ease all;
    -webkit-transition: 0.2s ease all;
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

  /* Google Button - Uiverse inspired */
  .google-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 24px;
    background: white;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    color: #1f1f1f;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
  }

  .google-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(66, 133, 244, 0.1), rgba(234, 67, 53, 0.1));
    opacity: 0;
    transition: opacity 0.3s;
  }

  .google-btn:hover::before {
    opacity: 1;
  }

  .google-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .google-btn:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .google-icon {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
  }

  .google-text {
    position: relative;
    z-index: 1;
  }

  /* Submit Button - Uiverse inspired */
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

  .submit-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.2);
  }

  .submit-btn:active {
    transform: scale(0.98);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .submit-icon {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .submit-btn:hover .submit-icon {
    transform: translateX(4px);
  }

  .submit-text {
    position: relative;
    z-index: 1;
  }
</style>
