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
  let unsubscribe: (() => void) | null = null;
  let _selectedChannelId: string | null = null;
  let activeLoadId = 0;

  function canUseStorage() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  function getStorageSuffix() {
    return currentSessionToken ? currentSessionToken.slice(0, 16) : 'anonymous';
  }

  function getChannelsCacheKey() {
    return `band-chat:channels-cache:v1:${getStorageSuffix()}`;
  }

  function getSelectedChannelKey() {
    return `band-chat:selected-channel:v1:${getStorageSuffix()}`;
  }

  function readCachedChannels(): Channel[] {
    if (!canUseStorage()) return [];

    try {
      const raw = window.localStorage.getItem(getChannelsCacheKey());
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeCachedChannels(channels: Channel[]) {
    if (!canUseStorage()) return;

    try {
      window.localStorage.setItem(getChannelsCacheKey(), JSON.stringify(channels));
    } catch {
      // Ignore storage failures
    }
  }

  function readSelectedChannelId() {
    if (!canUseStorage()) return null;

    try {
      return window.localStorage.getItem(getSelectedChannelKey());
    } catch {
      return null;
    }
  }

  function writeSelectedChannelId(channelId: string | null) {
    if (!canUseStorage()) return;

    try {
      if (channelId) {
        window.localStorage.setItem(getSelectedChannelKey(), channelId);
      } else {
        window.localStorage.removeItem(getSelectedChannelKey());
      }
    } catch {
      // Ignore storage failures
    }
  }

  function resolveSelectedChannelId(channels: Channel[]) {
    if (_selectedChannelId && channels.some((channel) => channel.id === _selectedChannelId)) {
      writeSelectedChannelId(_selectedChannelId);
      return _selectedChannelId;
    }

    _selectedChannelId = channels[0]?.id ?? null;
    writeSelectedChannelId(_selectedChannelId);
    return _selectedChannelId;
  }

  return {
    subscribe,

    setSessionToken(token: string | null) {
      currentSessionToken = token;

      if (!_selectedChannelId) {
        _selectedChannelId = readSelectedChannelId();
      }

      const cachedChannels = readCachedChannels();
      if (cachedChannels.length > 0) {
        const selectedChannelId = resolveSelectedChannelId(cachedChannels);
        update(state => ({
          ...state,
          channels: state.channels.length > 0 ? state.channels : cachedChannels,
          selectedChannelId: state.selectedChannelId ?? selectedChannelId,
          isLoading: false,
        }));
      }
    },

    async loadChannels() {
      if (!currentSessionToken) {
        console.error('[Convex Channels] No session token available for loading channels');
        return;
      }

      const loadId = ++activeLoadId;
      update(state => ({ ...state, isLoading: state.channels.length === 0 }));
      
      try {
        // Unsubscribe from previous subscription
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }

        // First, get initial channels with a query
        const initialChannels = await convex.query(api.channels.list, {
          sessionToken: currentSessionToken
        });

        if (loadId !== activeLoadId) {
          return;
        }

        const selectedChannelId = resolveSelectedChannelId(initialChannels);
        writeCachedChannels(initialChannels);

        update(state => ({
          ...state,
          channels: initialChannels,
          selectedChannelId,
          isLoading: false,
        }));

        // Then subscribe to real-time updates
        unsubscribe = convex.onUpdate(
          api.channels.list,
          { sessionToken: currentSessionToken },
          (channels) => {
            if (loadId !== activeLoadId) {
              return;
            }

            const selectedChannelId = resolveSelectedChannelId(channels);
            writeCachedChannels(channels);
            
            update(state => ({
              ...state,
              channels,
              selectedChannelId,
              isLoading: false,
            }));
          }
        );
      } catch (error) {
        console.error('[Convex Channels] Error loading channels:', error);
        if (loadId === activeLoadId) {
          update(state => ({ ...state, isLoading: false }));
        }
      }
    },

    selectChannel(channelId: string) {
      _selectedChannelId = channelId;
      writeSelectedChannelId(channelId);
      update(state => ({ ...state, selectedChannelId: channelId }));
    },

    cleanup() {
      activeLoadId += 1;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  };
}

export const convexChannelStore = createConvexChannelStore();
