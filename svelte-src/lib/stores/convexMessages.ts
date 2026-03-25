import { writable } from 'svelte/store';
import { convex } from '../convex';
import { apiPost } from '../utils/api';
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
  editedAt?: number | null;
  reactions?: Reaction[];
  replyCount?: number;
};

type MessageState = {
  messages: Message[];
  isLoading: boolean;
  sessionToken: string | null;
  typingUsers: string[];
};

function createConvexMessageStore() {
  const { subscribe, set, update } = writable<MessageState>({
    messages: [],
    isLoading: false,
    sessionToken: null,
    typingUsers: []
  });

  let unsubscribe: (() => void) | null = null;
  let typingUnsubscribe: (() => void) | null = null;
  let currentSessionToken: string | null = null;
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let currentTypingChannelId: string | null = null;
  let currentMessageChannelId: string | null = null;
  let pendingMessageChannelId: string | null = null;
  let activeMessageRequestId = 0;

  return {
    subscribe,

    setSessionToken(token: string | null) {
      currentSessionToken = token;
      update(state => ({ ...state, sessionToken: token }));
    },

    async loadMessages(channelId: string) {
      if (!currentSessionToken) {
        console.error('[Convex] No session token available for loading messages');
        update(state => ({ ...state, isLoading: false }));
        return;
      }

      if (currentMessageChannelId === channelId && unsubscribe) {
        return;
      }

      if (pendingMessageChannelId === channelId) {
        return;
      }

      const requestId = ++activeMessageRequestId;
      const sessionToken = currentSessionToken;
      pendingMessageChannelId = channelId;
      update(state => ({ ...state, messages: [], isLoading: true }));

      try {
        // Unsubscribe from previous channel
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }

        // First, get initial messages with a query
        const initialMessages = await convex.query(api.messages.list, {
          channelId: channelId as Id<"channels">,
          sessionToken
        });

        if (requestId !== activeMessageRequestId || pendingMessageChannelId !== channelId || sessionToken !== currentSessionToken) {
          return;
        }

        currentMessageChannelId = channelId;
        update(state => ({ messages: initialMessages, isLoading: false, sessionToken, typingUsers: state.typingUsers }));

        // Then subscribe to real-time updates
        unsubscribe = convex.onUpdate(
          api.messages.list,
          { channelId: channelId as Id<"channels">, sessionToken },
          (messages) => {
            if (currentMessageChannelId !== channelId) {
              return;
            }

            update(state => ({ messages, isLoading: false, sessionToken: currentSessionToken, typingUsers: state.typingUsers }));
          }
        );
      } catch (error) {
        console.error('[Convex] Error loading messages:', error);
        if (requestId === activeMessageRequestId) {
          if (currentMessageChannelId === channelId) {
            currentMessageChannelId = null;
          }

          update(state => ({ ...state, isLoading: false }));
        }
      } finally {
        if (requestId === activeMessageRequestId && pendingMessageChannelId === channelId) {
          pendingMessageChannelId = null;
        }
      }
    },

    clearMessages() {
      currentMessageChannelId = null;
      pendingMessageChannelId = null;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      update(state => ({ ...state, messages: [], isLoading: false }));
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

    async createReport(message: string) {
      console.log('[createReport] Starting, sessionToken:', currentSessionToken ? 'exists' : 'null');
      if (!currentSessionToken) {
        throw new Error('Not authenticated - session token is null');
      }

      const response = await apiPost('/api/reports', { message });
      console.log('[createReport] Response:', response.status);

      if (!response.ok) {
        throw new Error('Failed to submit report');
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

    async editMessage(messageId: string, content: string) {
      if (!currentSessionToken) {
        return { success: false, error: "Not authenticated" };
      }

      try {
        await convex.mutation(api.messages.update, {
          messageId: messageId as Id<"messages">,
          content,
          sessionToken: currentSessionToken,
        });
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error?.message || "Failed to edit message" };
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

    async setTyping(channelId: string) {
      if (!currentSessionToken) return;

      try {
        await convex.mutation(api.typing.setTyping, {
          channelId: channelId as Id<"channels">,
          sessionToken: currentSessionToken
        });

        // Reset the typing timeout
        if (typingTimer) {
          clearTimeout(typingTimer);
        }
        typingTimer = setTimeout(() => {
          this.stopTyping(channelId);
        }, 3000);
      } catch (error) {
        console.error('[setTyping] Error:', error);
      }
    },

    async stopTyping(channelId: string) {
      if (!currentSessionToken) return;

      try {
        if (typingTimer) {
          clearTimeout(typingTimer);
          typingTimer = null;
        }
        await convex.mutation(api.typing.stopTyping, {
          channelId: channelId as Id<"channels">,
          sessionToken: currentSessionToken
        });
      } catch (error) {
        console.error('[stopTyping] Error:', error);
      }
    },

    subscribeToTyping(channelId: string) {
      if (!currentSessionToken) return;

      // Unsubscribe from previous typing subscription
      if (typingUnsubscribe) {
        typingUnsubscribe();
        typingUnsubscribe = null;
      }

      currentTypingChannelId = channelId;

      // First, get initial typing users (silently fail if API not deployed)
      convex.query(api.typing.getTypingUsers, {
        channelId: channelId as Id<"channels">,
        sessionToken: currentSessionToken
      }).then(usernames => {
        // Only update if still subscribed to this channel
        if (currentTypingChannelId === channelId) {
          update(state => ({ ...state, typingUsers: usernames || [] }));
        }
      }).catch(() => {
        // Silently ignore - typing API may not be deployed yet
      });

      // Then subscribe to updates (silently fail if API not deployed)
      try {
        typingUnsubscribe = convex.onUpdate(
          api.typing.getTypingUsers,
          { channelId: channelId as Id<"channels">, sessionToken: currentSessionToken },
          (usernames) => {
            // Only update if still subscribed to this channel
            if (currentTypingChannelId === channelId) {
              update(state => ({ ...state, typingUsers: usernames || [] }));
            }
          }
        );
      } catch {
        // Silently ignore - typing API may not be deployed yet
        typingUnsubscribe = null;
      }
    },

    unsubscribeFromTyping() {
      if (typingUnsubscribe) {
        typingUnsubscribe();
        typingUnsubscribe = null;
      }
      currentTypingChannelId = null;
      update(state => ({ ...state, typingUsers: [] }));
    },

    cleanup() {
      activeMessageRequestId += 1;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (typingUnsubscribe) {
        typingUnsubscribe();
        typingUnsubscribe = null;
      }
      currentTypingChannelId = null;
      currentMessageChannelId = null;
      pendingMessageChannelId = null;
    }
  };
}

export const convexMessageStore = createConvexMessageStore();
