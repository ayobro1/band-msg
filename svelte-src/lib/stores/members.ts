import { writable } from 'svelte/store';
import { apiGet } from '../utils/api';
import { browser } from '$app/environment';

type Member = {
  id: string;
  username: string;
  role: string;
  presenceStatus: 'online' | 'idle' | 'dnd' | 'offline';
};

type MemberState = {
  members: Member[];
  showUserList: boolean;
};

let pollInterval: ReturnType<typeof setInterval> | null = null;

function createMemberStore() {
  const { subscribe, set, update } = writable<MemberState>({
    members: [],
    showUserList: true,
  });

  return {
    subscribe,

    async loadMembers() {
      try {
        const response = await apiGet('/api/members');
        if (response.ok) {
          const data = await response.json();
          update(state => ({ ...state, members: data.members || [] }));
        } else {
          // If API fails, just show empty list
          update(state => ({ ...state, members: [] }));
        }
      } catch (error) {
        console.error('Failed to load members:', error);
        update(state => ({ ...state, members: [] }));
      }
    },

    startPolling() {
      if (!browser || pollInterval) return;
      
      // Poll every 10 seconds
      pollInterval = setInterval(() => {
        this.loadMembers();
      }, 10000);
    },

    stopPolling() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },

    toggleUserList() {
      update(state => ({ ...state, showUserList: !state.showUserList }));
    },

    setShowUserList(show: boolean) {
      update(state => ({ ...state, showUserList: show }));
    },
  };
}

export const memberStore = createMemberStore();
