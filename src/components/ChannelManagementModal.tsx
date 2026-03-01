"use client";

import { Channel } from "@/lib/types";

interface ChannelManagementModalProps {
  channels: Channel[];
  onDeleteChannel: (channel: Channel) => Promise<void> | void;
  onClose: () => void;
}

export default function ChannelManagementModal({ channels, onDeleteChannel, onClose }: ChannelManagementModalProps) {
  const sortedChannels = [...channels].sort((a, b) => a.name.localeCompare(b.name));

  const confirmAndDelete = async (channel: Channel) => {
    const ok = window.confirm(`Delete #${channel.name}? This removes its messages and media.`);
    if (!ok) return;
    await onDeleteChannel(channel);
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content w-full max-w-lg rounded-lg bg-[#313338] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Manage Channels</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {sortedChannels.length === 0 ? (
          <div className="rounded bg-[#1e1f22] px-3 py-2 text-sm text-gray-400">
            No channels available.
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {sortedChannels.map((channel) => (
              <div key={channel.id} className="flex items-center justify-between rounded bg-[#1e1f22] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-200">#{channel.name}</p>
                  {channel.description && (
                    <p className="truncate text-xs text-gray-500">{channel.description}</p>
                  )}
                </div>
                <button
                  onClick={() => confirmAndDelete(channel)}
                  className="rounded bg-[#a12828] px-3 py-1 text-xs font-semibold text-white hover:bg-[#8f2020]"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-[#5865f2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752c4]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
