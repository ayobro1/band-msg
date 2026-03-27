<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  let selectedDevice: 'android' | 'ios' | null = null;
  
  function selectDevice(device: 'android' | 'ios') {
    selectedDevice = device;
  }
  
  function skip() {
    dispatch('skip');
  }
  
  function done() {
    dispatch('done');
  }
</script>

<div class="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-black via-[#0a0a0a] to-black px-6 overflow-y-auto py-8">
  <!-- Animated background elements -->
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse-subtle"></div>
    <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse-subtle" style="animation-delay: 1s;"></div>
  </div>

  <div class="w-full max-w-2xl relative z-10">
    <!-- Logo -->
    <div class="flex justify-center mb-6 animate-fade-in">
      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300"></div>
        <div class="relative w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-2xl">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Card -->
    <div class="relative group">
      <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      
      <div class="relative bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl animate-scale-in backdrop-blur-xl">
        {#if !selectedDevice}
          <!-- Device Selection -->
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-white mb-3">Install Band Chat</h1>
            <p class="text-white/60 text-lg">Add to your home screen for the best experience</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <!-- Android Card -->
            <button
              on:click={() => selectDevice('android')}
              class="device-card group/card"
            >
              <div class="device-icon-wrapper">
                <svg class="device-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/>
                </svg>
              </div>
              <div class="text-left">
                <h3 class="text-xl font-bold text-white mb-1">Android</h3>
                <p class="text-white/50 text-sm">Chrome, Samsung Internet, Firefox</p>
              </div>
              <svg class="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>

            <!-- iOS Card -->
            <button
              on:click={() => selectDevice('ios')}
              class="device-card group/card"
            >
              <div class="device-icon-wrapper">
                <svg class="device-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              </div>
              <div class="text-left">
                <h3 class="text-xl font-bold text-white mb-1">iOS / iPadOS</h3>
                <p class="text-white/50 text-sm">Safari browser required</p>
              </div>
              <svg class="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          <button
            on:click={skip}
            class="w-full py-3 text-white/40 hover:text-white/80 transition-all duration-200 text-sm font-medium"
          >
            Skip for now
          </button>
        {:else}
          <!-- Installation Instructions -->
          <button
            on:click={() => selectedDevice = null}
            class="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Back
          </button>

          <div class="text-center mb-8">
            <h2 class="text-2xl font-bold text-white mb-2">
              {selectedDevice === 'android' ? 'Android' : 'iOS'} Installation
            </h2>
            <p class="text-white/60">Follow these steps to add Band Chat to your home screen</p>
          </div>

          {#if selectedDevice === 'android'}
            <!-- Android Instructions -->
            <div class="space-y-6 mb-8">
              <div class="instruction-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <h3 class="step-title">Open Chrome Menu</h3>
                  <p class="step-description">Tap the three dots (⋮) in the top right corner</p>
                  <div class="step-visual">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2"/>
                      <circle cx="12" cy="12" r="2"/>
                      <circle cx="12" cy="19" r="2"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div class="instruction-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <h3 class="step-title">Add to Home Screen</h3>
                  <p class="step-description">Select "Add to Home screen" or "Install app"</p>
                  <div class="step-visual">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div class="instruction-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <h3 class="step-title">Confirm Installation</h3>
                  <p class="step-description">Tap "Add" or "Install" to complete</p>
                  <div class="step-visual">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <!-- iOS Instructions -->
            <div class="space-y-6 mb-8">
              <div class="instruction-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <h3 class="step-title">Open in Safari</h3>
                  <p class="step-description">Make sure you're using Safari browser (not Chrome)</p>
                  <div class="step-visual">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div class="instruction-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <h3 class="step-title">Tap Share Button</h3>
                  <p class="step-description">Tap the share icon at the bottom of the screen</p>
                  <div class="step-visual">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                      <polyline points="16 6 12 2 8 6"/>
                      <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div class="instruction-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <h3 class="step-title">Add to Home Screen</h3>
                  <p class="step-description">Scroll down and tap "Add to Home Screen"</p>
                  <div class="step-visual">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                      <line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div class="instruction-step">
                <div class="step-number">4</div>
                <div class="step-content">
                  <h3 class="step-title">Confirm</h3>
                  <p class="step-description">Tap "Add" in the top right corner</p>
                  <div class="step-visual">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          {/if}

          <button
            on:click={done}
            class="submit-btn w-full"
          >
            <span class="submit-text">Got it!</span>
            <svg class="submit-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <p class="text-center text-white/20 text-xs mt-6 animate-fade-in">
      Band Chat works great in your browser too!
    </p>
  </div>
</div>

<style>
  .device-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 24px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }

  .device-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1));
    opacity: 0;
    transition: opacity 0.3s;
  }

  .device-card:hover {
    transform: translateY(-4px);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .device-card:hover::before {
    opacity: 1;
  }

  .device-card:active {
    transform: translateY(-2px);
  }

  .device-icon-wrapper {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    position: relative;
    z-index: 1;
  }

  .device-icon {
    width: 32px;
    height: 32px;
    color: white;
  }

  .arrow-icon {
    margin-left: auto;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.3);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    z-index: 1;
  }

  .device-card:hover .arrow-icon {
    color: white;
    transform: translateX(4px);
  }

  .instruction-step {
    display: flex;
    gap: 20px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    transition: all 0.2s;
  }

  .instruction-step:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .step-number {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #8b5cf6, #3b82f6);
    border-radius: 50%;
    font-weight: 700;
    font-size: 18px;
    color: white;
  }

  .step-content {
    flex: 1;
  }

  .step-title {
    font-size: 16px;
    font-weight: 600;
    color: white;
    margin-bottom: 4px;
  }

  .step-description {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
  }

  .step-visual {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.4);
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

  .submit-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.2);
  }

  .submit-btn:active {
    transform: scale(0.98);
  }

  .submit-icon {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .submit-btn:hover .submit-icon {
    transform: scale(1.1);
  }

  .submit-text {
    position: relative;
    z-index: 1;
  }
</style>
