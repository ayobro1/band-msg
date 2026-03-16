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
  
  $: allUsers = $memberStore.members;
</script>

<style>
  .members-sidebar {
    display: none;
    flex-direction: column;
    background-color: #0a0a0a;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
    width: 240px;
    min-width: 240px;
    max-width: 240px;
    flex-shrink: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  
  /* Only show on desktop (1024px+), hide on tablets and mobile */
  @media (min-width: 1024px) {
    .members-sidebar {
      display: flex;
    }
  }
</style>

{#if $memberStore.showUserList}
  <div class="members-sidebar">
    <div class="h-14 flex items-center px-4 border-b border-white/10 shrink-0">
      <h3 class="text-[12px] font-semibold text-white/30 uppercase tracking-widest">
        Band Members
      </h3>
    </div>
    <div class="flex-1 overflow-y-auto py-3 px-3 scrollbar-hide">
      <!-- All Users Section -->
      <div class="mb-4">
        <h4 class="text-[11px] font-semibold text-white/25 uppercase tracking-widest px-2 mb-2">
          All Users — {allUsers.length}
        </h4>
        <div class="space-y-0.5">
          {#each allUsers as user}
            {@const status = user.presenceStatus || 'offline'}
            <button type="button" class="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all duration-200 group hover:scale-[1.02] active:scale-98">
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
      
      <!-- Status Groups -->
      {#each Object.entries(grouped) as [status, users]}
        {#if users.length > 0}
          <div class="mb-4">
            <h4 class="text-[11px] font-semibold text-white/25 uppercase tracking-widest px-2 mb-2">
              {statusLabels[status]} — {users.length}
            </h4>
            <div class="space-y-0.5">
              {#each users as user}
                <button type="button" class="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all duration-200 group hover:scale-[1.02] active:scale-98">
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
