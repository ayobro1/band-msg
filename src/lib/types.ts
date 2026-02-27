export interface Channel {
  id: string;
  name: string;
  description: string;
  created: string;
}

export interface Message {
  id: string;
  content: string;
  profile_id: string;
  channel_id: string;
  created: string;
}

export interface TypingEvent {
  profile_id: string;
  channel_id: string;
}

export interface StreamEvent {
  type: "message" | "typing";
  payload: Message | TypingEvent;
}
