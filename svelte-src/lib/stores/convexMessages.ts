import { writable } from 'svelte/store';
import { convex } from '../convex';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

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
  replyCount?: number;
};

type MessageState = {
  messages: Message[];
  isLoading: boolean;
};

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const prefix = `${encodeURIComponent(name)}=`;
  const found = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : '';
}

function createConvexMessageStore() {
  const { subscribe, set, update } = writable<MessageState>({
    messages: [],
    isLoading: false
  });

  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,

    async loadMessages(channelId: string) {
      update(state => ({ ...state, isLoading: true }));
      
      const sessionToken = getCookie('band_chat_session');
      if (!sessionToken) {
        update(state => ({ ...state, isLoading: false }));
        return;
      }

      // Unsubscribe from previous channel
      if (unsubscribe) {
        unsubscribe();
      }

      // Subscribe to real-time messages
      unsubscribe = convex.onUpdate(
        api.messages.list,
        { channelId: channelId as Id<"channels">, sessionToken },
        (messages) => {
          set({ messages, isLoading: false });
        }
      );
    },

    async sendMessage(channelId: string, content: string) {
      const sessionToken = getCookie('band_chat_session');
      if (!sessionToken) {
        return { success: false, error: 'Not authenticated' };
      }

      try {
        await convex.mutation(api.messages.send, {
          channelId: channelId as Id<"channels">,
          content,
          sessionToken
        });
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    async deleteMessage(messageId: string, channelId: string) {
      const sessionToken = getCookie('band_chat_session');
      if (!sessionToken) {
        return { success: false };
      }

      try {
        await convex.mutation(api.messages.remove, {
          messageId: messageId as Id<"messages">,
          sessionToken
        });
        return { success: true };
      } catch (error) {
        return { success: false };
      }
    },

    async addReaction(messageId: string, emoji: string, channelId: string) {
      const sessionToken = getCookie('band_chat_session');
      if (!sessionToken) return;

      try {
        await convex.mutation(api.reactions.add, {
          messageId: messageId as Id<"messages">,
          emoji,
          sessionToken
        });
      } catch (error) {
        console.error('Failed to add reaction:', error);
      }
    },

    async removeReaction(messageId: string, emoji: string, channelId: string) {
      const sessionToken = getCookie('band_chat_session');
      if (!sessionToken) return;

      try {
        await convex.mutation(api.reactions.remove, {
          messageId: messageId as Id<"messages">,
          emoji,
          sessionToken
        });
      } catch (error) {
        console.error('Failed to remove reaction:', error);
      }
    },

    cleanup() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  };
}

export const convexMessageStore = createConvexMessageStore();
