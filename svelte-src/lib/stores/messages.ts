import { writable } from 'svelte/store';
import { apiGet, apiPost } from '../utils/api';
import { pusherStore } from './pusher';

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

  let typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

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
          
          update(state => ({ ...state, messages, isLoading: false, typingUsers: [] }));
          
          // Subscribe to Pusher channel for real-time updates
          pusherStore.subscribeToChannel(channelId, {
            onNewMessage: (data) => {
              update(state => ({
                ...state,
                messages: [...state.messages, data]
              }));
            },
            onMessageDeleted: (data) => {
              update(state => ({
                ...state,
                messages: state.messages.filter(m => m.id !== data.messageId)
              }));
            },
            onReactionUpdate: (data) => {
              update(state => ({
                ...state,
                messages: state.messages.map(m =>
                  m.id === data.messageId ? { ...m, reactions: data.reactions } : m
                )
              }));
            },
            onTyping: (data) => {
              update(state => {
                let typingUsers = [...state.typingUsers];
                
                // Clear existing timeout for this user
                const existingTimeout = typingTimeouts.get(data.username);
                if (existingTimeout) {
                  clearTimeout(existingTimeout);
                }
                
                if (data.isTyping) {
                  if (!typingUsers.includes(data.username)) {
                    typingUsers.push(data.username);
                  }
                  
                  // Auto-remove after 3 seconds
                  const timeout = setTimeout(() => {
                    update(s => ({
                      ...s,
                      typingUsers: s.typingUsers.filter(u => u !== data.username)
                    }));
                    typingTimeouts.delete(data.username);
                  }, 3000);
                  
                  typingTimeouts.set(data.username, timeout);
                } else {
                  typingUsers = typingUsers.filter(u => u !== data.username);
                  typingTimeouts.delete(data.username);
                }
                
                return { ...state, typingUsers };
              });
            }
          });
        }
      } catch (error) {
        update(state => ({ ...state, isLoading: false }));
      }
    },

    async sendMessage(channelId: string, content: string) {
      const res = await apiPost('/api/messages', { channelId, content });
      if (res.ok) {
        // Pusher will handle adding the message via real-time event
        return { success: true };
      }
      const error = await res.json();
      return { success: false, error: error.error || 'Failed to send message' };
    },

    async deleteMessage(messageId: string, channelId: string) {
      const res = await apiPost('/api/messages', { messageId }, 'DELETE');
      if (res.ok) {
        // Pusher will handle removing the message via real-time event
        return { success: true };
      }
      return { success: false };
    },

    async addReaction(messageId: string, emoji: string, channelId: string) {
      await apiPost('/api/reactions', { messageId, emoji, action: 'add' });
      // Pusher will handle updating reactions via real-time event
    },

    async removeReaction(messageId: string, emoji: string, channelId: string) {
      await apiPost('/api/reactions', { messageId, emoji, action: 'remove' });
      // Pusher will handle updating reactions via real-time event
    },

    async startTyping(channelId: string) {
      pusherStore.sendTyping(channelId, true);
    },

    async stopTyping(channelId: string) {
      pusherStore.sendTyping(channelId, false);
    },

    async loadTypingUsers(channelId: string) {
      // Typing is now handled via Pusher real-time events
    },
  };
}

export const messageStore = createMessageStore();
