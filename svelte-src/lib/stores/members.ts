import { writable } from 'svelte/store';
import { apiGet } from '../utils/api';

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

    toggleUserList() {
      update(state => ({ ...state, showUserList: !state.showUserList }));
    },

    setShowUserList(show: boolean) {
      update(state => ({ ...state, showUserList: show }));
    },
  };
}

export const memberStore = createMemberStore();
