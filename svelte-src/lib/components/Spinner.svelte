<script lang="ts">
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let fullscreen: boolean = false;
  
  const sizeMap = {
    sm: '16px',
    md: '24px',
    lg: '32px'
  };
</script>

<style>
  .spinner {
    display: inline-block;
    width: var(--spinner-size);
    height: var(--spinner-size);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spinner-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .spinner-fullscreen {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 9999;
  }
</style>

{#if fullscreen}
  <div class="spinner-fullscreen">
    <div class="spinner" style="--spinner-size: {sizeMap[size]}"></div>
  </div>
{:else}
  <div class="spinner-wrapper">
    <div class="spinner" style="--spinner-size: {sizeMap[size]}"></div>
  </div>
{/if}
