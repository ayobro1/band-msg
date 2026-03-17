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
      console.log('[NotificationStore] Toggle notifications called');
      const state = get({ subscribe });
      console.log('[NotificationStore] Current state:', { isSubscribed: state.isSubscribed, permission: state.permission });
      
      update(s => ({ ...s, isLoading: true, error: null }));

      try {
        if (state.isSubscribed) {
          console.log('[NotificationStore] Unsubscribing from notifications...');
          const result = await unsubscribeFromPushNotifications();
          console.log('[NotificationStore] Unsubscribe result:', result);
          if (result.success) {
            update(s => ({ ...s, isSubscribed: false }));
          } else {
            update(s => ({ ...s, error: result.error || 'Failed to unsubscribe' }));
          }
        } else {
          console.log('[NotificationStore] Subscribing to notifications...');
          
          // First check if permission is already denied
          if ('Notification' in window && Notification.permission === 'denied') {
            console.log('[NotificationStore] Permission already denied');
            update(s => ({ ...s, permission: 'denied', error: 'Notifications are blocked. Please enable them in your browser settings.' }));
            return;
          }
          
          const result = await subscribeToPushNotifications();
          console.log('[NotificationStore] Subscribe result:', result);
          if (result.success) {
            update(s => ({ ...s, isSubscribed: true, permission: 'granted' }));
          } else {
            // Permission might have been denied or prompt closed
            const currentPermission = 'Notification' in window ? Notification.permission : 'default';
            console.log('[NotificationStore] Subscribe failed, current permission:', currentPermission);
            update(s => ({ 
              ...s, 
              permission: currentPermission,
              error: result.error || 'Failed to subscribe to notifications' 
            }));
          }
        }
      } catch (err) {
        console.error('[NotificationStore] Toggle error:', err);
        update(s => ({ ...s, error: 'An unexpected error occurred' }));
      } finally {
        console.log('[NotificationStore] Toggle complete, setting loading to false');
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
