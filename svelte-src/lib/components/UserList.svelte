<script lang="ts">
  import { memberStore } from '../stores/members';
  import Avatar from './Avatar.svelte';

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
            <button type="button" class="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all duration-200 group hover:scale-[1.02] active:scale-98">
              <Avatar
                alt={user.username}
                size="sm"
                status={null}
              />
              <div class="flex-1 min-w-0 text-left">
                <p class="text-[13px] font-medium truncate text-white/70">
                  {user.username}
                </p>
                <p class="text-[10px] text-white/20 truncate">{user.role}</p>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
