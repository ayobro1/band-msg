import { writable } from 'svelte/store';
import { apiGet, apiPost } from '../utils/api';

type Reaction = {
  emoji: string;
  count: number;
  users: string[];
};

type Message = {
  id: string;
  author: string;
  content: string;
  createdAt: number;
  reactions?: Reaction[];
};

type MessageState = {
  messages: Message[];
  isLoading: boolean;
  typingUsers: string[];
};

function createMessageStore() {
  const { subscribe, set, update } = writable<MessageState>({
    messages: [],
    isLoading: false,
    typingUsers: [],
  });

  return {
    subscribe,

    async loadMessages(channelId: string) {
      update(state => ({ ...state, isLoading: true }));
      try {
        const res = await apiGet(`/api/messages?channelId=${encodeURIComponent(channelId)}`);
        if (res.ok) {
          const messages = await res.json();
          
          // Load reactions for all messages
          const messageIds = messages.map((m: Message) => m.id);
          if (messageIds.length > 0) {
            const reactionsRes = await apiGet(`/api/reactions?messageIds=${messageIds.join(',')}`);
            if (reactionsRes.ok) {
              const allReactions = await reactionsRes.json();
              messages.forEach((msg: Message) => {
                msg.reactions = allReactions[msg.id] || [];
              });
            }
          }
          
          // Only update if messages actually changed
          update(state => {
            const currentIds = state.messages.map(m => m.id).join(',');
            const newIds = messages.map((m: Message) => m.id).join(',');
            const reactionsChanged = JSON.stringify(state.messages.map(m => m.reactions)) !== JSON.stringify(messages.map((m: Message) => m.reactions));
            
            if (currentIds !== newIds || reactionsChanged) {
              return { ...state, messages, isLoading: false };
            }
            return { ...state, isLoading: false };
          });
        }
      } catch (error) {
        update(state => ({ ...state, isLoading: false }));
      }
    },

    async sendMessage(channelId: string, content: string) {
      const res = await apiPost('/api/messages', { channelId, content });
      if (res.ok) {
        await this.loadMessages(channelId);
        return { success: true };
      }
      const error = await res.json();
      return { success: false, error: error.error || 'Failed to send message' };
    },

    async deleteMessage(messageId: string, channelId: string) {
      const res = await apiPost('/api/messages', { messageId }, 'DELETE');
      if (res.ok) {
        await this.loadMessages(channelId);
        return { success: true };
      }
      return { success: false };
    },

    async addReaction(messageId: string, emoji: string, channelId: string) {
      const res = await apiPost('/api/reactions', { messageId, emoji, action: 'add' });
      if (res.ok) {
        await this.loadMessages(channelId);
      }
    },

    async removeReaction(messageId: string, emoji: string, channelId: string) {
      const res = await apiPost('/api/reactions', { messageId, emoji, action: 'remove' });
      if (res.ok) {
        await this.loadMessages(channelId);
      }
    },

    async startTyping(channelId: string) {
      await apiPost('/api/typing', { channelId, action: 'start' });
    },

    async stopTyping(channelId: string) {
      await apiPost('/api/typing', { channelId, action: 'stop' });
    },

    async loadTypingUsers(channelId: string) {
      try {
        const res = await apiGet(`/api/typing?channelId=${encodeURIComponent(channelId)}`);
        if (res.ok) {
          const users = await res.json();
          update(state => ({ ...state, typingUsers: users.map((u: any) => u.username) }));
        }
      } catch (error) {
        // Ignore typing errors
      }
    },
  };
}

export const messageStore = createMessageStore();
