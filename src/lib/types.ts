export interface Channel {
  id: string;
  name: string;
  created_at: string;
}

export interface Message {
  id: string;
  content: string;
  profile_id: string;
  channel_id: string;
  inserted_at: string;
}
