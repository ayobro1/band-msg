<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { authStore } from '../stores/auth';
  import Spinner from './Spinner.svelte';
  import ForgotPassword from './ForgotPassword.svelte';

  const dispatch = createEventDispatcher();

  let mode: 'login' | 'register' | 'forgot' = 'login';
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
    }

    // Start polling if user is pending (after login or auto-login from register)
    if ($authStore.user?.status === 'pending') {
      dispatch('pending');
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

{#if mode === 'forgot'}
  <ForgotPassword on:back={() => { mode = 'login'; error = ''; }} />
{:else}
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
              Waiting for approval
            </div>
            <p class="text-xs opacity-70">
              Your account <strong>{$authStore.user.username}</strong> is waiting for admin approval. You'll be let in automatically once approved.
            </p>
            <div class="flex items-center gap-1.5 mt-1 text-xs opacity-50">
              <div class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>
              Checking...
            </div>
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
          <div>
            <label class="block text-sm font-medium text-white/70 mb-2">Username</label>
            <input
              required
              type="text"
              bind:value={username}
              on:keydown={handleKeyDown}
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
              placeholder="Enter your username"
            />
          </div>

          <!-- Password Input -->
          <div>
            <label class="block text-sm font-medium text-white/70 mb-2">Password</label>
            <input
              required
              type="password"
              bind:value={password}
              on:keydown={handleKeyDown}
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
              placeholder="Enter your password"
            />
          </div>

          {#if mode === 'register'}
            <p class="text-xs text-white/30 -mt-4">Minimum 12 characters</p>
          {:else}
            <div class="flex justify-end -mt-4">
              <button
                type="button"
                on:click={() => { mode = 'forgot'; error = ''; }}
                class="text-xs text-white/40 hover:text-white/80 transition-colors"
              >
                Forgot password?
              </button>
            </div>
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
{/if}

<style>
  /* Google Button - Dark theme version */
  .google-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 24px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    overflow: hidden;
  }

  .google-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
  }

  .google-btn:active {
    transform: translateY(0);
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

  /* Submit Button - Uiverse style */
  .submit-btn {
    padding: 17px 40px;
    border-radius: 10px;
    border: 0;
    background: linear-gradient(135deg, #ff3838 0%, #e63946 100%);
    letter-spacing: 1.5px;
    font-size: 15px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: rgba(201, 46, 70, 1) 0px 10px 0px 0px;
    position: relative;
    overflow: hidden;
  }

  .submit-btn:hover {
    box-shadow: rgba(201, 46, 70, 1) 0px 7px 0px 0px;
  }

  .submit-btn:active {
    background: linear-gradient(135deg, #ff3838 0%, #e63946 100%);
    box-shadow: rgba(201, 46, 70, 1) 0px 0px 0px 0px;
    transform: translateY(5px);
    transition: 200ms;
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
