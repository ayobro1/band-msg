import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { isPushSubscribed as checkPushSubscribed, subscribeToPushNotifications, unsubscribeFromPushNotifications } from '../firebase';
import { apiGet, apiPost } from '../utils/api';

type NotificationState = {
  isSubscribed: boolean;
  mutedChannelIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  permission: NotificationPermission;
};

function createNotificationStore() {
  const { subscribe, set, update } = writable<NotificationState>({
    isSubscribed: false,
    mutedChannelIds: new Set(),
    isLoading: false,
    error: null,
    permission: 'default'
  });

  return {
    subscribe,

    async init() {
      if (!browser) return;

      update(state => ({ ...state, isLoading: true }));

      try {
        if ('Notification' in window) {
          const permission = Notification.permission;
          const subscribed = await checkPushSubscribed();
          
          update(state => ({
            ...state,
            permission,
            isSubscribed: subscribed
          }));
        }

        await this.loadMutedChannels();
      } catch (err) {
        console.error('[NotificationStore] Init error:', err);
      } finally {
        update(state => ({ ...state, isLoading: false }));
      }
    },

    async loadMutedChannels() {
      try {
        const res = await apiGet('/api/channels/current/mute');
        if (res.ok) {
          const ids = await res.json();
          update(state => ({ ...state, mutedChannelIds: new Set(ids) }));
        }
      } catch (e) {
        console.error('[NotificationStore] Failed to load muted channels:', e);
      }
    },

    async toggleNotifications() {
      const state = get({ subscribe });
      update(s => ({ ...s, isLoading: true, error: null }));

      try {
        if (state.isSubscribed) {
          const result = await unsubscribeFromPushNotifications();
          if (result.success) {
            update(s => ({ ...s, isSubscribed: false }));
          } else {
            update(s => ({ ...s, error: result.error || 'Failed to unsubscribe' }));
          }
        } else {
          const result = await subscribeToPushNotifications();
          if (result.success) {
            update(s => ({ ...s, isSubscribed: true, permission: 'granted' }));
          } else {
            // Permission might have been denied or prompt closed
            const currentPermission = 'Notification' in window ? Notification.permission : 'default';
            update(s => ({ 
              ...s, 
              permission: currentPermission,
              error: result.error || 'Failed to subscribe' 
            }));
          }
        }
      } catch (err) {
        console.error('[NotificationStore] Toggle error:', err);
        update(s => ({ ...s, error: 'An unexpected error occurred' }));
      } finally {
        update(s => ({ ...s, isLoading: false }));
      }
    },

    async toggleChannelMute(channelId: string) {
      const state = get({ subscribe });
      const isMuted = state.mutedChannelIds.has(channelId);
      
      // Optimistic update
      update(s => {
        const next = new Set(s.mutedChannelIds);
        if (isMuted) next.delete(channelId);
        else next.add(channelId);
        return { ...s, mutedChannelIds: next };
      });

      try {
        const res = await apiPost(`/api/channels/${channelId}/mute`, { muted: !isMuted });
        if (!res.ok) {
          // Revert on failure
          update(s => {
            const next = new Set(s.mutedChannelIds);
            if (isMuted) next.add(channelId);
            else next.delete(channelId);
            return { ...s, mutedChannelIds: next, error: 'Failed to update channel settings' };
          });
        }
      } catch (err) {
        console.error('[NotificationStore] Channel mute toggle error:', err);
        // Revert on error
        update(s => {
          const next = new Set(s.mutedChannelIds);
          if (isMuted) next.add(channelId);
          else next.delete(channelId);
          return { ...s, mutedChannelIds: next, error: 'An error occurred' };
        });
      }
    },

    setError(msg: string | null) {
      update(s => ({ ...s, error: msg }));
    }
  };
}

export const notificationStore = createNotificationStore();
