import { writable } from 'svelte/store';
import { apiGet, apiPost } from '../utils/api';

type Channel = {
  id: string;
  name: string;
  description: string;
};

type ChannelState = {
  channels: Channel[];
  selectedChannelId: string | null;
  isLoading: boolean;
};

function createChannelStore() {
  const { subscribe, set, update } = writable<ChannelState>({
    channels: [],
    selectedChannelId: null,
    isLoading: false,
  });

  return {
    subscribe,

    async loadChannels() {
      update(state => ({ ...state, isLoading: true }));
      try {
        const res = await apiGet('/api/channels');
        if (res.ok) {
          const channels = await res.json();
          update(state => ({
            ...state,
            channels,
            selectedChannelId: state.selectedChannelId || (channels[0]?.id ?? null),
            isLoading: false,
          }));
        }
      } catch (error) {
        update(state => ({ ...state, isLoading: false }));
      }
    },

    selectChannel(channelId: string) {
      update(state => ({ ...state, selectedChannelId: channelId }));
    },

    async createChannel(name: string, description: string) {
      const res = await apiPost('/api/channels', { name, description });
      if (res.ok) {
        await this.loadChannels();
        return { success: true };
      }
      const error = await res.json();
      return { success: false, error: error.error || 'Failed to create channel' };
    },
  };
}

export const channelStore = createChannelStore();
