"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
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
      try {
        const res = await fetch(`/api/messages?channelId=${channelId}`);
        const data: Message[] = await res.json();
        setMessages(data);
      } catch (error) {
        console.error("Failed to fetch messages:", error);
      }
    };

    fetchMessages();

    // Subscribe to new messages via SSE
    const eventSource = new EventSource("/api/messages/stream");
    eventSource.onmessage = (event) => {
      const msg: Message = JSON.parse(event.data);
      if (msg.channel_id === channelId) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || !channelId) return;

    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          channel_id: channelId,
          profile_id: "anonymous",
        }),
      });
    } catch (error) {
      console.error("Failed to send message:", error);
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
                  {new Date(msg.created).toLocaleTimeString()}
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
