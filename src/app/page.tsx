"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Channel } from "@/lib/types";
import ChannelList from "@/components/ChannelList";
import MessageArea from "@/components/MessageArea";

export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  useEffect(() => {
    const fetchChannels = async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Failed to fetch channels:", error.message);
        return;
      }
      if (data && data.length > 0) {
        setChannels(data as Channel[]);
        setActiveChannelId(data[0].id);
      }
    };

    fetchChannels();
  }, []);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div className="flex h-screen overflow-hidden text-gray-300">
      {/* Server icon sidebar */}
      <div className="flex w-[72px] flex-col items-center gap-2 bg-[#1e1f22] py-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5865f2] text-lg font-bold text-white transition-all hover:rounded-xl">
          BC
        </div>
        <div className="mx-auto h-0.5 w-8 rounded bg-[#35373c]" />
      </div>

      {/* Channel list sidebar */}
      <ChannelList
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={setActiveChannelId}
      />

      {/* Message area */}
      <MessageArea
        channelId={activeChannelId}
        channelName={activeChannel?.name ?? ""}
      />
    </div>
  );
}
