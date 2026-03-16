import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import PusherClient from 'pusher-js';

type PusherStore = {
  connected: boolean;
  client: PusherClient | null;
};

function createPusherStore() {
  const { subscribe, set, update } = writable<PusherStore>({
    connected: false,
    client: null
  });

  let pusher: PusherClient | null = null;
  let currentChannel: any = null;

  function connect() {
    if (!browser) return;

    // Get Pusher key from environment (exposed via Vite)
    const key = import.meta.env.VITE_PUSHER_KEY;
    const cluster = import.meta.env.VITE_PUSHER_CLUSTER || 'us2';

    if (!key) {
      console.warn('Pusher key not configured');
      return;
    }

    if (pusher) return; // Already connected

    pusher = new PusherClient(key, {
      cluster,
      forceTLS: true
    });

    pusher.connection.bind('connected', () => {
      console.log('Pusher connected');
      update(state => ({ ...state, connected: true, client: pusher }));
    });

    pusher.connection.bind('disconnected', () => {
      console.log('Pusher disconnected');
      update(state => ({ ...state, connected: false }));
    });

    pusher.connection.bind('error', (err: any) => {
      console.error('Pusher error:', err);
    });
  }

  function disconnect() {
    if (pusher) {
      pusher.disconnect();
      pusher = null;
      currentChannel = null;
      set({ connected: false, client: null });
    }
  }

  function subscribeToChannel(channelId: string, handlers: {
    onNewMessage?: (data: any) => void;
    onMessageDeleted?: (data: any) => void;
    onReactionUpdate?: (data: any) => void;
    onTyping?: (data: any) => void;
  }) {
    if (!pusher) {
      console.warn('Pusher not connected');
      return;
    }

    // Unsubscribe from previous channel
    if (currentChannel) {
      pusher.unsubscribe(currentChannel.name);
    }

    const channelName = `channel-${channelId}`;
    currentChannel = pusher.subscribe(channelName);

    if (handlers.onNewMessage) {
      currentChannel.bind('new-message', handlers.onNewMessage);
    }

    if (handlers.onMessageDeleted) {
      currentChannel.bind('message-deleted', handlers.onMessageDeleted);
    }

    if (handlers.onReactionUpdate) {
      currentChannel.bind('reaction-update', handlers.onReactionUpdate);
    }

    if (handlers.onTyping) {
      currentChannel.bind('typing', handlers.onTyping);
    }
  }

  function sendTyping(channelId: string, isTyping: boolean) {
    // Typing is sent via API, Pusher broadcasts it
    fetch('/api/typing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ channelId, action: isTyping ? 'start' : 'stop' })
    }).catch(console.error);
  }

  return {
    subscribe,
    connect,
    disconnect,
    subscribeToChannel,
    sendTyping
  };
}

export const pusherStore = createPusherStore();
