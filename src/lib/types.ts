export interface Channel {
  id: string;
  name: string;
  description: string;
  created: string;
  visibility?: "public" | "private";
  allowed_users?: string[];
}

export interface Message {
  id: string;
  content: string;
  profile_id: string;
  channel_id: string;
  created: string;
  attachment_url?: string;
  attachment_mime?: string;
  attachment_expires?: string;
}

export interface TypingEvent {
  profile_id: string;
  channel_id: string;
}

export interface Reaction {
  id: string;
  message_id: string;
  username: string;
  gif_url: string;
  gif_id: string;
  created: string;
}

export interface StreamEvent {
  type: "message" | "typing" | "reaction";
  payload: Message | TypingEvent | Reaction;
}

export type UserRole = "admin" | "member";
export type AccountStatus = "pending" | "approved";

export interface UserAccount {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  passwordAlgorithm: "pbkdf2" | "sha256";
  role: UserRole;
  status: AccountStatus;
  created: string;
}

export interface AuthUser {
  username: string;
  role: UserRole;
  status: AccountStatus;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
