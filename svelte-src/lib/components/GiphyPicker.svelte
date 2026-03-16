<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet } from '../utils/api';
  
  export let onClose: () => void;
  export let onSelect: (url: string) => void;
  
  let query = '';
  let gifs: any[] = [];
  let isLoading = false;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  async function loadGifs(overrideQuery?: string) {
    isLoading = true;
    try {
      const q = overrideQuery !== undefined ? overrideQuery : query;
      const res = await apiGet(`/api/giphy?q=${encodeURIComponent(q)}&limit=24`);
      if (res.ok) {
        const data = await res.json();
        gifs = data.gifs || [];
      }
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadGifs(); // Loads trending by default
  });

  function handleInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadGifs();
    }, 400); // 400ms debounce
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="hidden md:block">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/80 z-[200]"
    style="padding-top: env(safe-area-inset-top);"
    on:click={onClose}
  ></div>
  <div class="fixed inset-0 z-[201] flex items-end md:items-center md:justify-center animate-fade-in pointer-events-none" style="padding-top: env(safe-area-inset-top);">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-black border-t border-white/10 md:border md:rounded-2xl w-full md:max-w-md flex flex-col rounded-t-2xl h-[70vh] md:h-[600px] max-h-[92vh] animate-slide-up md:animate-scale-in pointer-events-auto"
      on:click|stopPropagation
    >
    <!-- Header/Search -->
    <div class="px-4 py-3 border-b border-white/10 shrink-0 flex items-center gap-3">
      <div class="flex-1 relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          bind:value={query}
          on:input={handleInput}
          placeholder="Search GIPHY..."
          class="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
          autofocus
        />
      </div>
      <button
        type="button"
        on:click={onClose}
        class="p-2 -mr-2 text-white/40 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95"
        aria-label="Close"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- GIF Grid -->
    <div class="flex-1 overflow-y-auto p-4 scrollbar-hide" style="padding-bottom: max(1rem, env(safe-area-inset-bottom));">
      {#if isLoading && gifs.length === 0}
        <div class="text-center py-12 text-white/30 text-sm animate-pulse-subtle">Searching...</div>
      {:else if gifs.length === 0}
        <div class="text-center py-12 text-white/30 text-sm animate-fade-in">No GIFs found</div>
      {:else}
        <div class="grid grid-cols-2 gap-2 stagger-fade-in">
          {#each gifs as gif}
            <button
              type="button"
              on:click={() => onSelect(gif.url)}
              class="relative rounded-lg overflow-hidden bg-white/5 aspect-square hover:opacity-80 transition-all duration-200 touch-manipulation focus:outline-none focus:ring-2 focus:ring-white/50 hover:scale-105 active:scale-95"
            >
              <img
                src={gif.preview}
                alt={gif.title || 'GIF'}
                class="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  </div>
</div>
