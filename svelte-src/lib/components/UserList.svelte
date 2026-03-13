<script lang="ts">
  import { memberStore } from '../stores/members';
  import Avatar from './Avatar.svelte';

  const statusLabels: Record<string, string> = {
    online: 'Online',
    idle: 'Away',
    dnd: 'In Session',
    offline: 'Offline',
  };

  $: grouped = {
    online: $memberStore.members.filter(u => u.presenceStatus === 'online'),
    idle: $memberStore.members.filter(u => u.presenceStatus === 'idle'),
    dnd: $memberStore.members.filter(u => u.presenceStatus === 'dnd'),
    offline: $memberStore.members.filter(u => u.presenceStatus === 'offline'),
  };
</script>

{#if $memberStore.showUserList}
  <div class="hidden md:flex flex-col w-56 bg-[#0a0a0a] border-l border-white/10 overflow-hidden">
    <div class="h-14 flex items-center px-4 border-b border-white/10 shrink-0">
      <h3 class="text-[12px] font-semibold text-white/30 uppercase tracking-widest">
        Band Members
      </h3>
    </div>
    <div class="flex-1 overflow-y-auto py-3 px-3 scrollbar-hide">
      {#each Object.entries(grouped) as [status, users]}
        {#if users.length > 0}
          <div class="mb-4">
            <h4 class="text-[11px] font-semibold text-white/25 uppercase tracking-widest px-2 mb-2">
              {statusLabels[status]} — {users.length}
            </h4>
            <div class="space-y-0.5">
              {#each users as user}
                <button class="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group">
                  <Avatar
                    alt={user.username}
                    size="sm"
                    status={status === 'online' ? 'online' : status === 'idle' ? 'away' : status === 'dnd' ? 'busy' : 'offline'}
                  />
                  <div class="flex-1 min-w-0 text-left">
                    <p class="text-[13px] font-medium truncate {status === 'offline' ? 'text-white/30' : 'text-white/70'}">
                      {user.username}
                    </p>
                    <p class="text-[10px] text-white/20 truncate">{user.role}</p>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}
