"use client";

import { useEffect, useRef, useCallback } from "react";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎸", "🤘"];

interface MessageContextMenuProps {
  x: number;
  y: number;
  messageContent: string;
  messageId: string;
  onEmojiReact: (messageId: string, emoji: string) => void;
  onGifReact: (messageId: string) => void;
  onCopy: (text: string) => void;
  onReply: (messageId: string, content: string) => void;
  onClose: () => void;
}

export default function MessageContextMenu({
  x,
  y,
  messageContent,
  messageId,
  onEmojiReact,
  onGifReact,
  onCopy,
  onReply,
  onClose,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Position menu so it stays within viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > vw - 8) adjustedX = vw - rect.width - 8;
    if (adjustedX < 8) adjustedX = 8;
    if (y + rect.height > vh - 8) adjustedY = y - rect.height - 4;
    if (adjustedY < 8) adjustedY = 8;

    el.style.left = `${adjustedX}px`;
    el.style.top = `${adjustedY}px`;
    el.style.opacity = "1";
    el.style.transform = "scale(1)";
  }, [x, y]);

  // Close on outside tap or scroll
  const handleOutside = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [handleOutside, onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex flex-col rounded-xl bg-[#2b2d31] shadow-lg shadow-black/40 ring-1 ring-white/10"
      style={{ left: x, top: y, opacity: 0, transform: "scale(0.95)", transition: "opacity 0.1s, transform 0.1s" }}
    >
      {/* Quick emoji row */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onEmojiReact(messageId, emoji); onClose(); }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-[#404249] active:scale-110"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="mx-2 h-px bg-[#3f4147]" />

      {/* Actions */}
      <div className="flex flex-col p-1">
        <button
          onClick={() => { onReply(messageId, messageContent); onClose(); }}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#404249]"
        >
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span>Reply</span>
        </button>
        <button
          onClick={() => { onGifReact(messageId); onClose(); }}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#404249]"
        >
          <span className="text-xs font-bold text-gray-400">GIF</span>
          <span>React with GIF</span>
        </button>
        {messageContent && (
          <button
            onClick={() => { onCopy(messageContent); onClose(); }}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#404249]"
          >
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>Copy Message</span>
          </button>
        )}
      </div>
    </div>
  );
}
