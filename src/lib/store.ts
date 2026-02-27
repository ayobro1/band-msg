import { Channel, Message } from "./types";

let channelIdCounter = 1;
let messageIdCounter = 1;

function nextChannelId(): string {
  return `ch_${channelIdCounter++}`;
}

function nextMessageId(): string {
  return `msg_${messageIdCounter++}`;
}

// Default channels seeded on startup
const defaultChannelNames = ["general", "setlists", "practice"];

export const channels: Channel[] = defaultChannelNames.map((name) => ({
  id: nextChannelId(),
  name,
  created: new Date().toISOString(),
}));

export const messages: Message[] = [];

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
  notifySubscribers(msg);
  return msg;
}

// Simple pub/sub for SSE
type Subscriber = (msg: Message) => void;
const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function notifySubscribers(msg: Message) {
  for (const fn of subscribers) {
    fn(msg);
  }
}
