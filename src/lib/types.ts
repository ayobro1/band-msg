export interface Channel {
  id: string;
  name: string;
  created: string;
}

export interface Message {
  id: string;
  content: string;
  profile_id: string;
  channel_id: string;
  created: string;
}
