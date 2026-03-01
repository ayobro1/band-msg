"use client";

import { Channel } from "@/lib/types";

interface ChannelListProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onCreateChannel: () => void;
  canCreateChannel: boolean;
  mobile?: boolean;
}

export default function ChannelList({
  channels,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  canCreateChannel,
  mobile,
}: ChannelListProps) {
  if (mobile) {
    return (
      <nav className="scroll-area flex-1 px-3 pt-3 pb-6">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Channels
          </p>
          {canCreateChannel && (
            <button
              onClick={onCreateChannel}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#404249] text-gray-300 active:bg-[#5865f2]"
              title="Create Channel"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelectChannel(channel.id)}
            className={`mb-1 flex w-full items-center rounded-lg px-3 py-3 text-left active:bg-[#404249] ${
              activeChannelId === channel.id
                ? "bg-[#404249] text-white"
                : "text-gray-300 hover:bg-[#35373c] hover:text-white"
            }`}
          >
            <span className={`mr-2 text-lg ${activeChannelId === channel.id ? "text-gray-300" : "text-gray-500"}`}>
              {channel.visibility === "private" ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : "#"}
            </span>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{channel.name}</span>
              {channel.description && (
                <span className="block truncate text-xs text-gray-500">{channel.description}</span>
              )}
            </div>
            {/* Chevron */}
            <svg className="ml-2 h-4 w-4 shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <div className="flex h-full w-60 flex-col bg-[#2b2d31] text-gray-300">
      <div className="flex h-12 items-center border-b border-[#1e1f22] px-4 font-semibold text-white shadow-sm">
        <svg className="mr-2 h-5 w-5 text-[#5865f2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        Band Chat
      </div>
      <nav className="scroll-area flex-1 p-2">
        <div className="mb-1 flex items-center justify-between px-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Channels
          </p>
          {canCreateChannel && (
            <button
              onClick={onCreateChannel}
              className="text-gray-500 hover:text-gray-300"
              title="Create Channel"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelectChannel(channel.id)}
            className={`group mb-0.5 flex w-full items-center rounded px-2 py-1.5 text-left text-sm ${
              activeChannelId === channel.id
                ? "bg-[#404249] text-white"
                : "hover:bg-[#35373c] hover:text-white"
            }`}
            title={channel.description || undefined}
          >
            <span className={`mr-1.5 ${activeChannelId === channel.id ? "text-gray-300" : "text-gray-500"}`}>
              {channel.visibility === "private" ? (
                <svg className="inline h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : "#"}
            </span>
            <span className="truncate">{channel.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
