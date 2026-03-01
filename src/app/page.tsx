"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AuthUser, Channel } from "@/lib/types";
import ChannelList from "@/components/ChannelList";
import MessageArea from "@/components/MessageArea";
import MemberList from "@/components/MemberList";
import UsernameModal from "@/components/UsernameModal";
import CreateChannelModal from "@/components/CreateChannelModal";
import AdminApprovalModal from "@/components/AdminApprovalModal";
import PushNotificationManager from "@/components/PushNotificationManager";

const HEARTBEAT_INTERVAL_MS = 120000; // 2 minutes
const MOBILE_BREAKPOINT = 768; // md

type MobileView = "channels" | "chat";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function ChatPage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [mobileView, setMobileView] = useState<MobileView>("channels");

  const isMobile = useIsMobile();

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          setAuthUser(null);
          return;
        }
        const user: AuthUser = await res.json();
        setAuthUser(user);
      } catch {
        setAuthUser(null);
      } finally {
        setAuthResolved(true);
      }
    };

    loadCurrentUser();
  }, []);

  // Register user as active on login
  useEffect(() => {
    if (!authUser) return;

    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});

    // Heartbeat every 2 minutes
    const interval = setInterval(() => {
      fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;

    const fetchChannels = async () => {
      try {
        const res = await fetch("/api/channels");
        if (res.status === 401 || res.status === 403) {
          setAuthUser(null);
          return;
        }
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
  }, [authUser]);

  const handleAuthenticated = useCallback((user: AuthUser) => {
    setAuthUser(user);
  }, []);

  const handleSelectChannel = useCallback(
    (id: string) => {
      setActiveChannelId(id);
    },
    []
  );

  // ── Mobile slide animation state ──
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const isAnimatingRef = useRef(false);
  const isSwiping = useRef(false);
  const [slideIn, setSlideIn] = useState(false);

  const handleBackToChannels = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    if (chatPanelRef.current) {
      chatPanelRef.current.style.transform = "translateX(100%)";
    }
    setTimeout(() => {
      setMobileView("channels");
      setSlideIn(false);
      isAnimatingRef.current = false;
    }, 300);
  }, []);

  const handleSwipeProgress = useCallback((offset: number) => {
    if (!chatPanelRef.current) return;
    if (offset === 0) {
      isSwiping.current = false;
      chatPanelRef.current.style.transform = "translateX(0)";
    } else {
      isSwiping.current = true;
      chatPanelRef.current.style.transform = `translateX(${offset}px)`;
    }
  }, []);

  const handleSelectChannelMobile = useCallback(
    (id: string) => {
      setActiveChannelId(id);
      setSlideIn(true);
      setMobileView("chat");
    },
    []
  );

  // Trigger slide-in animation after chat panel mounts
  useEffect(() => {
    if (!slideIn || mobileView !== "chat") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (chatPanelRef.current) {
          chatPanelRef.current.style.transform = "translateX(0)";
        }
        setSlideIn(false);
      });
    });
  }, [slideIn, mobileView]);

  const handleCreateChannel = useCallback(
    async (name: string, description: string, visibility: "public" | "private" = "public", allowedUsers: string[] = []) => {
      try {
        const res = await fetch("/api/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, visibility, allowed_users: allowedUsers }),
        });
        if (!res.ok) {
          return;
        }
        if (res.ok) {
          const channel: Channel = await res.json();
          setChannels((prev) => [...prev, channel]);
          setActiveChannelId(channel.id);
          setShowCreateChannel(false);
          if (isMobile) {
            handleSelectChannelMobile(channel.id);
          }
        }
      } catch (error) {
        console.error("Failed to create channel:", error);
      }
    },
    [isMobile, handleSelectChannelMobile]
  );

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAuthUser(null);
    setChannels([]);
    setActiveChannelId(null);
    setMobileView("channels");
  }, []);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  if (!authResolved) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#313338] text-gray-300">
        Loading...
      </div>
    );
  }

  if (!authUser) {
    return <UsernameModal onAuthenticated={handleAuthenticated} />;
  }

  /* ───────── MOBILE LAYOUT ───────── */
  if (isMobile) {
    return (
      <div className="relative h-dvh overflow-hidden text-gray-300">
        {/* Base layer: Channel list (always rendered) */}
        <div className="absolute inset-0 flex flex-col bg-[#2b2d31]">
          {/* Mobile header */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#1e1f22] px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5865f2] text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-white">Band Chat</span>
            </div>
            <div className="flex items-center gap-1">
              <PushNotificationManager channels={channels} />
              {authUser.role === "admin" && (
                <button
                  onClick={() => setShowApprovals(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#23a55a]"
                  title="Approve Accounts"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
              <button
                onClick={handleLogout}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400"
                title="Sign Out"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1m0-10V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-1" />
                </svg>
              </button>
            </div>
          </div>

          <ChannelList
            channels={channels}
            activeChannelId={activeChannelId}
            onSelectChannel={handleSelectChannelMobile}
            onCreateChannel={() => setShowCreateChannel(true)}
            canCreateChannel={authUser.role === "admin"}
            mobile
          />
        </div>

        {/* Overlay layer: Chat panel (slides in from right) */}
        {mobileView === "chat" && (
          <div
            ref={chatPanelRef}
            className="absolute inset-0 z-10"
            style={{ transform: "translateX(100%)" }}
          >
            <MessageArea
              channelId={activeChannelId}
              channelName={activeChannel?.name ?? ""}
              channelDescription={activeChannel?.description ?? ""}
              username={authUser.username}
              showMembers={false}
              onToggleMembers={() => {}}
              mobile
              onBack={handleBackToChannels}
              onSwipeProgress={handleSwipeProgress}
            />
          </div>
        )}

        {showCreateChannel && (
          <CreateChannelModal
            onSubmit={handleCreateChannel}
            onClose={() => setShowCreateChannel(false)}
          />
        )}
        {showApprovals && authUser.role === "admin" && (
          <AdminApprovalModal onClose={() => setShowApprovals(false)} />
        )}
      </div>
    );
  }

  /* ───────── DESKTOP LAYOUT ───────── */
  return (
    <div className="flex h-dvh overflow-hidden text-gray-300">
      {/* Server icon sidebar */}
      <div className="flex w-[72px] flex-col items-center gap-2 bg-[#1e1f22] py-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5865f2] text-lg font-bold text-white hover:rounded-xl"
          title="Band Chat"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <div className="mx-auto h-0.5 w-8 rounded bg-[#35373c]" />
        <div className="mt-auto flex flex-col gap-2 pb-2">
          <PushNotificationManager channels={channels} />
          {authUser.role === "admin" && (
            <button
              onClick={() => setShowApprovals(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#23a55a] text-white hover:bg-[#1f944f]"
              title="Approve Accounts"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3f4147] text-gray-200 hover:bg-[#4a4d55]"
            title="Sign Out"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1m0-10V6m0 0a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Channel list sidebar */}
      <ChannelList
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={handleSelectChannel}
        onCreateChannel={() => setShowCreateChannel(true)}
        canCreateChannel={authUser.role === "admin"}
      />

      {/* Message area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <MessageArea
            channelId={activeChannelId}
            channelName={activeChannel?.name ?? ""}
            channelDescription={activeChannel?.description ?? ""}
            username={authUser.username}
            showMembers={showMembers}
            onToggleMembers={() => setShowMembers(!showMembers)}
          />

          {/* Member list sidebar */}
          {showMembers && <MemberList currentUser={authUser.username} />}
        </div>
      </div>

      {/* Create channel modal */}
      {showCreateChannel && (
        <CreateChannelModal
          onSubmit={handleCreateChannel}
          onClose={() => setShowCreateChannel(false)}
        />
      )}

      {showApprovals && authUser.role === "admin" && (
        <AdminApprovalModal onClose={() => setShowApprovals(false)} />
      )}
    </div>
  );
}
