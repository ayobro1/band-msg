import { writable } from 'svelte/store';
import { convex } from '../convex';
import { api } from '../../../convex/_generated/api';

type Channel = {
  id: string;
  name: string;
  description: string;
  isPrivate?: boolean;
};

type ChannelState = {
  channels: Channel[];
  selectedChannelId: string | null;
  isLoading: boolean;
};

function createConvexChannelStore() {
  const { subscribe, set, update } = writable<ChannelState>({
    channels: [],
    selectedChannelId: null,
    isLoading: false,
  });

  let currentSessionToken: string | null = null;

  return {
    subscribe,

    setSessionToken(token: string | null) {
      currentSessionToken = token;
    },

    async loadChannels() {
      if (!currentSessionToken) {
        console.error('[Convex Channels] No session token');
        return;
      }

      update(state => ({ ...state, isLoading: true }));
      try {
        const channels = await convex.query(api.channels.list, {
          sessionToken: currentSessionToken
        });
        
        update(state => ({
          ...state,
          channels,
          selectedChannelId: state.selectedChannelId || (channels[0]?.id ?? null),
          isLoading: false,
        }));
      } catch (error) {
        console.error('[Convex Channels] Error loading channels:', error);
        update(state => ({ ...state, isLoading: false }));
      }
    },

    selectChannel(channelId: string) {
      update(state => ({ ...state, selectedChannelId: channelId }));
    },
  };
}

export const convexChannelStore = createConvexChannelStore();
