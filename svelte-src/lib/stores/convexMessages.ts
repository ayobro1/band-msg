import { writable } from 'svelte/store';
import { convex } from '../convex';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

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
  sessionToken: string | null;
};

function createConvexMessageStore() {
  const { subscribe, set, update } = writable<MessageState>({
    messages: [],
    isLoading: false,
    sessionToken: null
  });

  let unsubscribe: (() => void) | null = null;
  let currentSessionToken: string | null = null;

  return {
    subscribe,

    setSessionToken(token: string | null) {
      currentSessionToken = token;
      update(state => ({ ...state, sessionToken: token }));
    },

    async loadMessages(channelId: string) {
      update(state => ({ ...state, isLoading: true }));
      
      if (!currentSessionToken) {
        console.error('[Convex] No session token available for loading messages');
        update(state => ({ ...state, isLoading: false }));
        return;
      }

      console.log('[Convex] Loading messages for channel:', channelId, 'with session token:', currentSessionToken.substring(0, 10) + '...');

      try {
        // Unsubscribe from previous channel
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }

        // Subscribe to real-time messages
        unsubscribe = convex.onUpdate(
          api.messages.list,
          { channelId: channelId as Id<"channels">, sessionToken: currentSessionToken },
          (messages) => {
            console.log('[Convex] Loaded messages:', messages.length, 'messages');
            set({ messages, isLoading: false, sessionToken: currentSessionToken });
          }
        );
      } catch (error) {
        console.error('[Convex] Error loading messages:', error);
        update(state => ({ ...state, isLoading: false }));
      }
    },

    async sendMessage(channelId: string, content: string) {
      if (!currentSessionToken) {
        return { success: false, error: 'Not authenticated' };
      }

      try {
        await convex.mutation(api.messages.send, {
          channelId: channelId as Id<"channels">,
          content,
          sessionToken: currentSessionToken
        });
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    async deleteMessage(messageId: string, channelId: string) {
      if (!currentSessionToken) {
        return { success: false };
      }

      try {
        await convex.mutation(api.messages.remove, {
          messageId: messageId as Id<"messages">,
          sessionToken: currentSessionToken
        });
        return { success: true };
      } catch (error) {
        return { success: false };
      }
    },

    async addReaction(messageId: string, emoji: string, channelId: string) {
      if (!currentSessionToken) return;

      try {
        await convex.mutation(api.reactions.add, {
          messageId: messageId as Id<"messages">,
          emoji,
          sessionToken: currentSessionToken
        });
      } catch (error) {
        console.error('Failed to add reaction:', error);
      }
    },

    async removeReaction(messageId: string, emoji: string, channelId: string) {
      if (!currentSessionToken) return;

      try {
        await convex.mutation(api.reactions.remove, {
          messageId: messageId as Id<"messages">,
          emoji,
          sessionToken: currentSessionToken
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
