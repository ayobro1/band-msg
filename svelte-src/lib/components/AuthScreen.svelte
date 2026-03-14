<script lang="ts">
  import { authStore } from '../stores/auth';
  import SocialButton from './SocialButton.svelte';
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

<div class="fixed inset-0 flex items-center justify-center bg-black px-6">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="flex justify-center mb-8">
      <div class="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-2xl">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
    </div>

    <!-- Card -->
    <div class="bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl">
      <h1 class="text-2xl font-bold text-white mb-2 text-center">
        {mode === 'login' ? 'Welcome back' : 'Create account'}
      </h1>
      <p class="text-white/40 text-center mb-6">
        {mode === 'login' ? 'Sign in to your band chat' : 'Join your band chat'}
      </p>

      {#if error}
        <div class="mb-4 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-sm">
          {error}
        </div>
      {/if}

      <!-- Social Sign In -->
      <div class="space-y-3">
        <SocialButton social="google" theme="gray" on:click={handleGoogleSignIn}>
          Sign in with Google
        </SocialButton>
      </div>

      <!-- Divider -->
      <div class="flex items-center gap-3 my-6">
        <div class="flex-1 h-px bg-white/10"></div>
        <span class="text-xs text-white/30">OR</span>
        <div class="flex-1 h-px bg-white/10"></div>
      </div>

      <div class="space-y-8">
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
          class="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </div>

      <div class="mt-6 text-center">
        <button
          type="button"
          on:click={() => { mode = mode === 'login' ? 'register' : 'login'; error = ''; }}
          class="text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>

    <p class="text-center text-white/20 text-xs mt-6">
      Band Chat - Discord Clone
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
</style>
