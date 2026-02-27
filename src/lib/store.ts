import { Channel, Message, StreamEvent, TypingEvent } from "./types";

let channelIdCounter = 1;
let messageIdCounter = 1;

function nextChannelId(): string {
  return `ch_${channelIdCounter++}`;
}

function nextMessageId(): string {
  return `msg_${messageIdCounter++}`;
}

// Default channels seeded on startup
interface ChannelSeed {
  name: string;
  description: string;
}

const defaultChannels: ChannelSeed[] = [
  { name: "general", description: "General band discussion" },
  { name: "setlists", description: "Plan your setlists here" },
  { name: "practice", description: "Schedule and discuss practice sessions" },
];

export const channels: Channel[] = defaultChannels.map(({ name, description }) => ({
  id: nextChannelId(),
  name,
  description,
  created: new Date().toISOString(),
}));

export const messages: Message[] = [];

// Track active users (profile_id -> last seen timestamp)
const activeUsers = new Map<string, number>();

export function trackUser(profileId: string): void {
  activeUsers.set(profileId, Date.now());
}

export function getActiveUsers(): string[] {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
  const active: string[] = [];
  for (const [id, lastSeen] of activeUsers) {
    if (lastSeen > cutoff) {
      active.push(id);
    } else {
      activeUsers.delete(id);
    }
  }
  return active.sort();
}

export function addChannel(name: string, description = ""): Channel | null {
  const normalized = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!normalized) return null;
  if (channels.some((c) => c.name === normalized)) return null;
  const channel: Channel = {
    id: nextChannelId(),
    name: normalized,
    description,
    created: new Date().toISOString(),
  };
  channels.push(channel);
  return channel;
}

export function addMessage(
  content: string,
  channelId: string,
  profileId: string
): Message {
  const msg: Message = {
    id: nextMessageId(),
    content,
    channel_id: channelId,
    profile_id: profileId,
    created: new Date().toISOString(),
  };
  messages.push(msg);
  trackUser(profileId);
  notifySubscribers({ type: "message", payload: msg });
  return msg;
}

export function broadcastTyping(channelId: string, profileId: string): void {
  const event: TypingEvent = { channel_id: channelId, profile_id: profileId };
  notifySubscribers({ type: "typing", payload: event });
}

// Simple pub/sub for SSE
type Subscriber = (event: StreamEvent) => void;
const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function notifySubscribers(event: StreamEvent) {
  for (const fn of subscribers) {
    fn(event);
  }
}
