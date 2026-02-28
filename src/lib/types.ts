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
