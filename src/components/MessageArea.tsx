"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Message } from "@/lib/types";

interface MessageAreaProps {
  channelId: string | null;
  channelName: string;
}

export default function MessageArea({
  channelId,
  channelName,
}: MessageAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!channelId) return;

    // Fetch existing messages for the channel
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("inserted_at", { ascending: true });
      if (error) {
        console.error("Failed to fetch messages:", error.message);
        return;
      }
      if (data) setMessages(data as Message[]);
    };

    fetchMessages();

    // Subscribe to new messages in realtime
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || !channelId) return;

    // TODO: Replace "anonymous" with actual user ID from auth
    const { error } = await supabase.from("messages").insert({
      content,
      channel_id: channelId,
      profile_id: "anonymous",
    });

    if (error) {
      console.error("Failed to send message:", error.message);
      return;
    }

    setNewMessage("");
  };

  if (!channelId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#313338] text-gray-500">
        Select a channel to start chatting
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[#313338]">
      {/* Channel header */}
      <div className="flex h-12 items-center border-b border-[#1e1f22] px-4 shadow-sm">
        <span className="mr-2 text-gray-500">#</span>
        <span className="font-semibold text-white">{channelName}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div key={msg.id} className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-sm font-semibold text-white">
              {msg.profile_id.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-white">
                  {msg.profile_id}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(msg.inserted_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-gray-300">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Message input */}
      <form onSubmit={handleSend} className="px-4 pb-6">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={`Message #${channelName}`}
          className="w-full rounded-lg bg-[#383a40] px-4 py-3 text-sm text-gray-200 placeholder-gray-500 outline-none"
        />
      </form>
    </div>
  );
}
