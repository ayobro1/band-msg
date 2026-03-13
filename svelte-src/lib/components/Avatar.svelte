<script lang="ts">
  type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  type Status = 'online' | 'offline' | 'away' | 'busy' | null;
  
  export let src: string | null = null;
  export let alt: string = '';
  export let size: Size = 'md';
  export let status: Status = null;
  export let initials: string = '';
  
  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-14 h-14 text-lg',
    '2xl': 'w-16 h-16 text-xl'
  };
  
  const statusSizes = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-3.5 h-3.5',
    '2xl': 'w-4 h-4'
  };
  
  const statusColors = {
    online: 'bg-white',
    offline: 'bg-white/20',
    away: 'bg-white/60',
    busy: 'bg-white/40'
  };
  
  function getAvatarColor(name: string): string {
    const colors = ['#7c3aed', '#2563eb', '#e11d48', '#059669', '#d97706', '#db2777'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
  
  $: displayInitials = initials || alt.charAt(0).toUpperCase();
</script>

<div class="relative inline-block">
  <div
    class="rounded-full flex items-center justify-center font-semibold overflow-hidden {sizeClasses[size]}"
    style={!src ? `background: ${getAvatarColor(alt)};` : ''}
  >
    {#if src}
      <img {src} {alt} class="w-full h-full object-cover" />
    {:else}
      <span class="text-white">{displayInitials}</span>
    {/if}
  </div>
  
  {#if status}
    <div
      class="absolute bottom-0 right-0 rounded-full border-2 border-[#0a0a0a] {statusSizes[size]} {statusColors[status]}"
    ></div>
  {/if}
</div>
