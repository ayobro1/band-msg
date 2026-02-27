"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { Channel } from "@/lib/types";
import ChannelList from "@/components/ChannelList";
import MessageArea from "@/components/MessageArea";
import MemberList from "@/components/MemberList";
import UsernameModal from "@/components/UsernameModal";
import CreateChannelModal from "@/components/CreateChannelModal";

const USERNAME_KEY = "band-chat-username";
const HEARTBEAT_INTERVAL_MS = 120000; // 2 minutes

let storageListeners: Array<() => void> = [];

function subscribeToStorage(callback: () => void) {
  storageListeners.push(callback);
  window.addEventListener("storage", callback);
  return () => {
    storageListeners = storageListeners.filter((l) => l !== callback);
    window.removeEventListener("storage", callback);
  };
}

function getStoredUsername() {
  return localStorage.getItem(USERNAME_KEY) ?? "";
}

function getServerSnapshot() {
  return "";
}

function setStoredUsername(name: string) {
  localStorage.setItem(USERNAME_KEY, name);
  // Notify all subscribers of the change
  for (const fn of storageListeners) {
    fn();
  }
}

export default function ChatPage() {
  const username = useSyncExternalStore(
    subscribeToStorage,
    getStoredUsername,
    getServerSnapshot
  );
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showMembers, setShowMembers] = useState(true);

  // Register user as active on login
  useEffect(() => {
    if (!username) return;
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: username }),
    }).catch(() => {});

    // Heartbeat every 2 minutes
    const interval = setInterval(() => {
      fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: username }),
      }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [username]);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await fetch("/api/channels");
        const data: Channel[] = await res.json();
        if (data.length > 0) {
          setChannels(data);
          setActiveChannelId((prev) => prev ?? data[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch channels:", error);
      }
    };

    fetchChannels();
  }, []);

  const handleSetUsername = useCallback((name: string) => {
    setStoredUsername(name);
  }, []);

  const handleCreateChannel = useCallback(
    async (name: string, description: string) => {
      try {
        const res = await fetch("/api/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        });
        if (res.ok) {
          const channel: Channel = await res.json();
          setChannels((prev) => [...prev, channel]);
          setActiveChannelId(channel.id);
          setShowCreateChannel(false);
        }
      } catch (error) {
        console.error("Failed to create channel:", error);
      }
    },
    []
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // Show username modal if not set
  if (!username) {
    return <UsernameModal onSubmit={handleSetUsername} />;
  }

  return (
    <div className="flex h-screen overflow-hidden text-gray-300">
      {/* Server icon sidebar */}
      <div className="flex w-[72px] flex-col items-center gap-2 bg-[#1e1f22] py-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5865f2] text-lg font-bold text-white transition-all hover:rounded-xl"
          title="Band Chat"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <div className="mx-auto h-0.5 w-8 rounded bg-[#35373c]" />
      </div>

      {/* Channel list sidebar */}
      <ChannelList
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={setActiveChannelId}
        onCreateChannel={() => setShowCreateChannel(true)}
      />

      {/* Message area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <MessageArea
            channelId={activeChannelId}
            channelName={activeChannel?.name ?? ""}
            channelDescription={activeChannel?.description ?? ""}
            username={username}
            showMembers={showMembers}
            onToggleMembers={() => setShowMembers(!showMembers)}
          />

          {/* Member list sidebar */}
          {showMembers && <MemberList currentUser={username} />}
        </div>
      </div>

      {/* Create channel modal */}
      {showCreateChannel && (
        <CreateChannelModal
          onSubmit={handleCreateChannel}
          onClose={() => setShowCreateChannel(false)}
        />
      )}
    </div>
  );
}
