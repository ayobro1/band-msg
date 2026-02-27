"use client";

import { Channel } from "@/lib/types";

interface ChannelListProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
}

export default function ChannelList({
  channels,
  activeChannelId,
  onSelectChannel,
}: ChannelListProps) {
  return (
    <div className="flex h-full w-60 flex-col bg-[#2b2d31] text-gray-300">
      <div className="flex h-12 items-center border-b border-[#1e1f22] px-4 font-semibold text-white shadow-sm">
        Band Chat
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Channels
        </p>
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelectChannel(channel.id)}
            className={`mb-0.5 flex w-full items-center rounded px-2 py-1.5 text-left text-sm transition-colors ${
              activeChannelId === channel.id
                ? "bg-[#404249] text-white"
                : "hover:bg-[#35373c] hover:text-white"
            }`}
          >
            <span className="mr-1.5 text-gray-500">#</span>
            {channel.name}
          </button>
        ))}
      </nav>
    </div>
  );
}
