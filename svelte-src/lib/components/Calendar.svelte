<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet, apiPost } from '../utils/api';

  export let onClose: () => void;

  type Event = {
    id: string;
    title: string;
    description: string;
    location: string;
    startsAt: number;
    endsAt: number;
    createdBy: string;
  };

  let events: Event[] = [];
  let isLoading = false;
  let showCreateForm = false;
  let editingEvent: Event | null = null;
  
  let newEventTitle = '';
  let newEventDescription = '';
  let newEventLocation = '';
  let newEventStartsAt = '';
  let newEventEndsAt = '';

  onMount(async () => {
    await loadEvents();
  });

  async function loadEvents() {
    isLoading = true;
    try {
      const res = await apiGet('/api/events');
      if (res.ok) {
        events = await res.json();
      }
    } finally {
      isLoading = false;
    }
  }

  async function createEvent() {
    if (!newEventTitle || !newEventStartsAt || !newEventEndsAt) return;

    const endpoint = editingEvent ? `/api/events/${editingEvent.id}` : '/api/events';
    const method = editingEvent ? 'PUT' : 'POST';

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: newEventTitle,
        description: newEventDescription,
        location: newEventLocation,
        startsAt: new Date(newEventStartsAt).getTime(),
        endsAt: new Date(newEventEndsAt).getTime(),
      }),
    });

    if (res.ok) {
      newEventTitle = '';
      newEventDescription = '';
      newEventLocation = '';
      newEventStartsAt = '';
      newEventEndsAt = '';
      showCreateForm = false;
      editingEvent = null;
      await loadEvents();
    }
  }

  function startEdit(event: Event) {
    editingEvent = event;
    newEventTitle = event.title;
    newEventDescription = event.description || '';
    newEventLocation = event.location || '';
    newEventStartsAt = new Date(event.startsAt).toISOString().slice(0, 16);
    newEventEndsAt = new Date(event.endsAt).toISOString().slice(0, 16);
    showCreateForm = true;
  }

  function cancelEdit() {
    editingEvent = null;
    newEventTitle = '';
    newEventDescription = '';
    newEventLocation = '';
    newEventStartsAt = '';
    newEventEndsAt = '';
    showCreateForm = false;
  }

  async function deleteEvent(eventId: string) {
    if (!confirm('Delete this event?')) return;

    const res = await fetch(`/api/events/${eventId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (res.ok) {
      await loadEvents();
    }
  }

  function formatEventTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center md:justify-center animate-fade-in"
  style="padding-top: env(safe-area-inset-top);"
  on:click={onClose}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bg-black border-t border-white/10 md:border md:rounded-2xl w-full md:max-w-lg md:max-h-[85vh] flex flex-col rounded-t-2xl max-h-[92vh] animate-slide-up md:animate-scale-in"
    on:click|stopPropagation
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
      <h2 class="text-lg font-bold text-white">Events</h2>
      <div class="flex items-center gap-2">
        {#if !showCreateForm}
          <button
            type="button"
            on:click|stopPropagation={() => showCreateForm = true}
            class="px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-all duration-200 text-sm font-medium hover:scale-105 active:scale-95"
          >
            + New
          </button>
        {/if}
        <button
          type="button"
          on:click|stopPropagation={onClose}
          class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 scrollbar-hide" style="padding-bottom: max(1rem, env(safe-area-inset-bottom));">
      {#if showCreateForm}
        <div class="bg-white/5 border border-white/8 rounded-xl p-4 mb-4 animate-slide-down">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-white/70 uppercase tracking-wide">{editingEvent ? 'Edit Event' : 'Create Event'}</h3>
            <button
              type="button"
              on:click|stopPropagation={cancelEdit}
              class="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Cancel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="space-y-3">
            <div>
              <input
                type="text"
                bind:value={newEventTitle}
                placeholder="Event title"
                class="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/25 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <textarea
                bind:value={newEventDescription}
                placeholder="Description (optional)"
                rows="2"
                class="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/25 outline-none focus:border-white/30 resize-none transition-colors"
              ></textarea>
            </div>
            <div>
              <input
                type="text"
                bind:value={newEventLocation}
                placeholder="Location (optional)"
                class="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/25 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-white/40 mb-1 px-1">Starts</label>
                <input
                  type="datetime-local"
                  bind:value={newEventStartsAt}
                  class="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-white/40 mb-1 px-1">Ends</label>
                <input
                  type="datetime-local"
                  bind:value={newEventEndsAt}
                  class="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-white/30 transition-colors"
                />
              </div>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                on:click|stopPropagation={cancelEdit}
                class="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-200 font-medium text-sm hover:scale-[1.02] active:scale-98"
              >
                Cancel
              </button>
              <button
                type="button"
                on:click|stopPropagation={createEvent}
                disabled={!newEventTitle || !newEventStartsAt || !newEventEndsAt}
                class="flex-1 px-4 py-2.5 bg-white text-black rounded-xl hover:bg-white/90 transition-all duration-200 font-semibold text-sm hover:scale-[1.02] active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingEvent ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if isLoading}
        <div class="text-center py-12 text-white/30 text-sm">Loading events...</div>
      {:else if events.length === 0}
        <div class="text-center py-12">
          <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-white/20">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p class="text-sm text-white/30">No events yet</p>
          <p class="text-xs text-white/20 mt-1">Tap + New to create one</p>
        </div>
      {:else}
        <div class="space-y-2 stagger-fade-in">
          {#each events as event}
            <div class="bg-white/5 border border-white/8 rounded-xl p-3.5 hover:bg-white/8 transition-all duration-200 hover-lift">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-white text-sm mb-1">{event.title}</h3>
                  {#if event.description}
                    <p class="text-xs text-white/50 mb-2 leading-relaxed">{event.description}</p>
                  {/if}
                  <div class="flex flex-wrap gap-3 text-xs text-white/35">
                    <div class="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {formatEventTime(event.startsAt)}
                    </div>
                    {#if event.location}
                      <div class="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {event.location}
                      </div>
                    {/if}
                  </div>
                </div>
                <div class="flex gap-1 shrink-0">
                  <button
                    type="button"
                    on:click|stopPropagation={() => startEdit(event)}
                    class="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Edit event"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    on:click|stopPropagation={() => deleteEvent(event.id)}
                    class="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    aria-label="Delete event"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
