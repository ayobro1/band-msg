"use client";

import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import { Message, StreamEvent, TypingEvent, Reaction } from "@/lib/types";
import { getAvatarColor, formatTimestamp } from "@/lib/utils";
import GiphyPicker from "@/components/GiphyPicker";

const MESSAGE_GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const ALLOWED_MEDIA_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "video/mp4", "video/webm", "video/quicktime",
];

interface MessageAreaProps {
  channelId: string | null;
  channelName: string;
  channelDescription: string;
  username: string;
  showMembers: boolean;
  onToggleMembers: () => void;
  mobile?: boolean;
  onBack?: () => void;
}

export default function MessageArea({
  channelId,
  channelName,
  channelDescription,
  username,
  showMembers,
  onToggleMembers,
  mobile,
  onBack,
}: MessageAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showGiphy, setShowGiphy] = useState(false);
  const [giphyTarget, setGiphyTarget] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    if (!channelId) return;

    setIsLoading(true);

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/messages?channelId=${channelId}`);
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const data: unknown = await res.json();
        if (Array.isArray(data)) {
          setMessages(data as Message[]);
        } else {
          setMessages([]);
        }
      } catch (error) {
        console.error("Failed to fetch messages:", error);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();

    const eventSource = new EventSource("/api/messages/stream");
    eventSource.onmessage = (event) => {
      const streamEvent: StreamEvent = JSON.parse(event.data);

      if (streamEvent.type === "message") {
        const msg = streamEvent.payload as Message;
        if (msg.channel_id === channelId) {
          setMessages((prev) => [...prev, msg]);
        }
        // Remove typing indicator for user who sent message
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(msg.profile_id);
          return next;
        });
      } else if (streamEvent.type === "typing") {
        const typing = streamEvent.payload as TypingEvent;
        if (typing.channel_id === channelId && typing.profile_id !== username) {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.set(typing.profile_id, Date.now());
            return next;
          });
        }
      } else if (streamEvent.type === "reaction") {
        const reaction = streamEvent.payload as Reaction;
        setReactions((prev) => {
          const next = new Map(prev);
          const existing = next.get(reaction.message_id) ?? [];
          if (!existing.find((r) => r.id === reaction.id)) {
            next.set(reaction.message_id, [...existing, reaction]);
          }
          return next;
        });
      }
    };

    return () => {
      eventSource.close();
      setTypingUsers(new Map());
    };
  }, [channelId, username]);

  // Clean up stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next = new Map<string, number>();
        for (const [user, ts] of prev) {
          if (now - ts < 3000) {
            next.set(user, ts);
          }
        }
        return next.size !== prev.size ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendTypingIndicator = useCallback(() => {
    if (!channelId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;

    fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: channelId }),
    }).catch((err) => {
      console.error("Failed to send typing indicator:", err);
    });
  }, [channelId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (sendError) {
      setSendError("");
    }
    if (e.target.value.trim()) {
      sendTypingIndicator();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !channelId) return;
    e.target.value = "";

    if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
      setSendError("Only images and videos are allowed.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setSendError("File must be under 500 MB.");
      return;
    }

    setUploading(true);
    setSendError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("channel_id", channelId);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(data.error ?? "Upload failed");
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleGiphyReaction = async (messageId: string, gifUrl: string, gifId: string) => {
    try {
      await fetch("/api/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId, gif_url: gifUrl, gif_id: gifId }),
      });
    } catch {
      /* ignore */
    }
    setGiphyTarget(null);
    setShowGiphy(false);
  };

  const openGiphyForReaction = (messageId: string) => {
    setGiphyTarget(messageId);
    setShowGiphy(true);
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || !channelId) return;

    setNewMessage("");

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          channel_id: channelId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        const errorMessage =
          data.error ??
          (res.status === 401 || res.status === 403
            ? "Session expired or unauthorized. Please sign in again."
            : "Failed to send message.");
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setNewMessage(content);
      setSendError(error instanceof Error ? error.message : "Failed to send message.");
    }
  };

  // Check if a message should be grouped with the previous one
  const shouldGroup = (msg: Message, prev: Message | undefined): boolean => {
    if (!prev) return false;
    if (prev.profile_id !== msg.profile_id) return false;
    const timeDiff =
      new Date(msg.created).getTime() - new Date(prev.created).getTime();
    return timeDiff < MESSAGE_GROUP_THRESHOLD_MS;
  };

  const typingUsersList = Array.from(typingUsers.keys());

  if (!channelId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#313338] text-gray-500">
        <svg className="mb-4 h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-lg font-medium">Select a channel to start chatting</p>
        <p className="mt-1 text-sm text-gray-600">Pick a channel from the sidebar</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[#313338]">
      {/* Channel header */}
      <div className="flex h-12 shrink-0 items-center border-b border-[#1e1f22] px-2 shadow-sm md:px-4">
        {mobile && onBack && (
          <button
            onClick={onBack}
            className="relative -ml-2 mr-0.5 flex h-12 w-14 items-center justify-center text-white active:bg-[#404249]"
            aria-label="Back to channels"
            style={{ zIndex: 10 }}
          >
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <span className="mr-1 text-xl text-gray-500">#</span>
        <span className="font-semibold text-white">{channelName}</span>
        {channelDescription && !mobile && (
          <>
            <div className="mx-3 h-6 w-px bg-[#3f4147]" />
            <span className="truncate text-sm text-gray-400">{channelDescription}</span>
          </>
        )}
        {!mobile && (
          <div className="ml-auto">
            <button
              onClick={onToggleMembers}
              className={`rounded p-1.5 transition-colors ${
                showMembers ? "text-white" : "text-gray-400 hover:text-gray-200"
              }`}
              title="Toggle Member List"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="scroll-area flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#5865f2]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="p-4">
            <div className="mb-4 flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#41434a]">
              <span className="text-3xl text-gray-300">#</span>
            </div>
            <h3 className="text-3xl font-bold text-white">
              Welcome to #{channelName}!
            </h3>
            <p className="mt-2 text-gray-400">
              This is the start of the <strong>#{channelName}</strong> channel.
              {channelDescription && ` ${channelDescription}.`}
            </p>
          </div>
        ) : (
          <div className="pb-4">
            {messages.map((msg, i) => {
              const grouped = shouldGroup(msg, messages[i - 1]);
              const msgReactions = reactions.get(msg.id) ?? [];
              const attachment = msg.attachment_url ? msg : null;

              const reactionRow = (msgReactions.length > 0 || true) && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {msgReactions.map((r) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={r.id} src={r.gif_url} alt="reaction" className="h-8 rounded" loading="lazy" />
                  ))}
                  <button
                    onClick={() => openGiphyForReaction(msg.id)}
                    className="flex h-6 w-6 items-center justify-center rounded bg-[#404249] text-xs text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                    title="Add Reaction"
                  >+</button>
                </div>
              );

              const attachmentEl = attachment?.attachment_url && (
                <div className="mt-1">
                  {attachment.attachment_mime?.startsWith("video/") ? (
                    <video
                      src={attachment.attachment_url}
                      controls
                      preload="metadata"
                      className="max-h-80 max-w-full rounded-lg"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.attachment_url}
                      alt="attachment"
                      className="max-h-80 max-w-full rounded-lg"
                      loading="lazy"
                    />
                  )}
                  {attachment.attachment_expires && (
                    <span className="mt-0.5 block text-[10px] text-gray-600">
                      Expires {new Date(attachment.attachment_expires).toLocaleDateString()}
                    </span>
                  )}
                </div>
              );

              return grouped ? (
                <div
                  key={msg.id}
                  className="group flex items-start px-4 py-0.5 hover:bg-[#2e3035]"
                >
                  <div className="w-10 shrink-0 text-center">
                    <span className="hidden text-[10px] text-gray-500 group-hover:inline">
                      {new Date(msg.created).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="ml-3 min-w-0">
                    {msg.content && <p className="text-sm text-gray-300">{msg.content}</p>}
                    {attachmentEl}
                    {reactionRow}
                  </div>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className={`group flex items-start gap-3 px-4 pt-4 pb-0.5 hover:bg-[#2e3035] ${
                    i > 0 ? "mt-0" : ""
                  }`}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: getAvatarColor(msg.profile_id) }}
                  >
                    {msg.profile_id.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-sm font-semibold hover:underline"
                        style={{ color: getAvatarColor(msg.profile_id) }}
                      >
                        {msg.profile_id}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(msg.created)}
                      </span>
                    </div>
                    {msg.content && <p className="text-sm text-gray-300">{msg.content}</p>}
                    {attachmentEl}
                    {reactionRow}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      <div className="h-6 px-4">
        {typingUsersList.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="flex gap-0.5">
              <span className="typing-dot inline-block h-1 w-1 rounded-full bg-gray-400" />
              <span className="typing-dot inline-block h-1 w-1 rounded-full bg-gray-400" />
              <span className="typing-dot inline-block h-1 w-1 rounded-full bg-gray-400" />
            </span>
            <span className="ml-1">
              <strong className="font-semibold text-gray-300">
                {typingUsersList.join(", ")}
              </strong>
              {typingUsersList.length === 1 ? " is" : " are"} typing...
            </span>
          </div>
        )}
      </div>

      {/* Message input */}
      <div className="relative">
        {/* Giphy picker */}
        {showGiphy && (
          <GiphyPicker
            onSelect={(gifUrl, gifId) => {
              if (giphyTarget) {
                handleGiphyReaction(giphyTarget, gifUrl, gifId);
              } else if (channelId) {
                // Send as inline GIF message
                fetch("/api/messages", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content: gifUrl, channel_id: channelId }),
                }).catch(() => {});
                setShowGiphy(false);
              }
            }}
            onClose={() => setShowGiphy(false)}
          />
        )}
        <form onSubmit={handleSend} className="px-3 pb-[env(safe-area-inset-bottom,6px)] pt-1 md:px-4 md:pb-6">
          {sendError && (
            <p className="mb-2 text-xs text-red-400">{sendError}</p>
          )}
          <div className="flex items-center rounded-lg bg-[#383a40] ring-1 ring-transparent focus-within:ring-[#5865f2]/50">
            {/* Attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[#404249] hover:text-gray-200 disabled:opacity-40"
              title="Upload photo or video (max 500 MB, auto-deletes after 30 days)"
            >
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-gray-200" />
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              placeholder={`Message #${channelName}`}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder-gray-400 outline-none"
              enterKeyHint="send"
              autoComplete="off"
            />
            {/* GIF picker toggle */}
            <button
              type="button"
              onClick={() => { setGiphyTarget(null); setShowGiphy((v) => !v); }}
              className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[#404249] hover:text-gray-200"
              title="Send a GIF"
            >
              <span className="text-xs font-bold">GIF</span>
            </button>
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#5865f2] transition-colors hover:text-[#7983f5] disabled:text-gray-600"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
