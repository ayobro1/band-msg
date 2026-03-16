import Pusher from 'pusher';

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher | null {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || 'us2';

  if (!appId || !key || !secret) {
    console.warn('Pusher credentials not configured');
    return null;
  }

  if (!pusherInstance) {
    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true
    });
  }

  return pusherInstance;
}

export function triggerNewMessage(channelId: string, message: any) {
  const pusher = getPusher();
  if (pusher) {
    pusher.trigger(`channel-${channelId}`, 'new-message', message);
  }
}

export function triggerMessageDeleted(channelId: string, messageId: string) {
  const pusher = getPusher();
  if (pusher) {
    pusher.trigger(`channel-${channelId}`, 'message-deleted', { messageId });
  }
}

export function triggerReactionUpdate(channelId: string, messageId: string, reactions: any[]) {
  const pusher = getPusher();
  if (pusher) {
    pusher.trigger(`channel-${channelId}`, 'reaction-update', { messageId, reactions });
  }
}

export function triggerTyping(channelId: string, username: string, isTyping: boolean) {
  const pusher = getPusher();
  if (pusher) {
    pusher.trigger(`channel-${channelId}`, 'typing', { username, isTyping });
  }
}

export function triggerPresenceUpdate(userId: string, status: string) {
  const pusher = getPusher();
  if (pusher) {
    pusher.trigger('presence', 'status-change', { userId, status });
  }
}
