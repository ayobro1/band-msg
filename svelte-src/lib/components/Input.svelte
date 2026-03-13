<script lang="ts">
  export let type: string = 'text';
  export let value: string = '';
  export let placeholder: string = '';
  export let disabled: boolean = false;
  export let maxlength: number | undefined = undefined;
  export let autocomplete: string = 'off';
  
  let focused = false;
  let inputElement: HTMLInputElement | HTMLTextAreaElement;
  
  export function focus() {
    inputElement?.focus();
  }
</script>

<div class="relative group">
  {#if type === 'textarea'}
    <textarea
      bind:this={inputElement}
      bind:value
      {placeholder}
      {disabled}
      {maxlength}
      {autocomplete}
      on:focus={() => focused = true}
      on:blur={() => focused = false}
      on:input
      on:keydown
      class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/20 outline-none transition-all duration-200 resize-none
        focus:bg-white/10 focus:border-white/30 focus:ring-2 focus:ring-white/10
        hover:border-white/20
        disabled:opacity-50 disabled:cursor-not-allowed"
      rows="3"
    ></textarea>
  {:else}
    <input
      bind:this={inputElement}
      {type}
      bind:value
      {placeholder}
      {disabled}
      {maxlength}
      {autocomplete}
      on:focus={() => focused = true}
      on:blur={() => focused = false}
      on:input
      on:keydown
      class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/20 outline-none transition-all duration-200
        focus:bg-white/10 focus:border-white/30 focus:ring-2 focus:ring-white/10
        hover:border-white/20
        disabled:opacity-50 disabled:cursor-not-allowed"
    />
  {/if}
  
  <!-- Focus indicator -->
  <div 
    class="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-200 {focused ? 'opacity-100' : 'opacity-0'}"
    style="box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.05);"
  ></div>
</div>
