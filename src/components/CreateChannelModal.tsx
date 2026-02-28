"use client";

import { useState, FormEvent, useEffect, useRef } from "react";

interface CreateChannelModalProps {
  onSubmit: (name: string, description: string, visibility: "public" | "private", allowedUsers: string[]) => void;
  onClose: () => void;
}

export default function CreateChannelModal({
  onSubmit,
  onClose,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [allUsers, setAllUsers] = useState<{ username: string; role: string }[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      document.getElementById("channel-name-input")?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // Fetch approved users when visibility set to private
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (visibility !== "private") return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    setLoadingUsers(true);
    fetch("/api/users/approved")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setAllUsers(data); })
      .catch(() => { if (!cancelled) setAllUsers([]); })
      .finally(() => { if (!cancelled) setLoadingUsers(false); });
    return () => { cancelled = true; };
  }, [visibility]);

  const toggleUser = (username: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Channel name cannot be empty");
      return;
    }
    if (trimmed.length < 2) {
      setError("Channel name must be at least 2 characters");
      return;
    }
    if (visibility === "private" && selectedUsers.size === 0) {
      setError("Select at least one member for a private channel");
      return;
    }
    onSubmit(trimmed, description.trim(), visibility, Array.from(selectedUsers));
  };

  const preview = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content w-full max-w-md rounded-lg bg-[#313338] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Create Channel</h2>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="channel-name-input"
            className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-400"
          >
            Channel Name
          </label>
          <div className="flex items-center rounded-md bg-[#1e1f22] px-3">
            <span className="text-gray-500">#</span>
            <input
              id="channel-name-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="new-channel"
              maxLength={30}
              className="w-full bg-transparent px-2 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none"
            />
          </div>
          {preview && preview !== name.trim().toLowerCase() && (
            <p className="mt-1 text-xs text-gray-500">
              Will be created as <span className="text-gray-400">#{preview}</span>
            </p>
          )}

          <label
            htmlFor="channel-desc-input"
            className="mb-2 mt-4 block text-xs font-bold uppercase tracking-wide text-gray-400"
          >
            Description <span className="font-normal normal-case text-gray-500">(optional)</span>
          </label>
          <input
            id="channel-desc-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this channel about?"
            maxLength={100}
            className="w-full rounded-md bg-[#1e1f22] px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none ring-1 ring-transparent transition-all focus:ring-[#5865f2]"
          />

          {/* Visibility toggle */}
          <label className="mb-2 mt-4 block text-xs font-bold uppercase tracking-wide text-gray-400">
            Visibility
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisibility("public")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                visibility === "public"
                  ? "bg-[#5865f2] text-white"
                  : "bg-[#1e1f22] text-gray-400 hover:text-gray-200"
              }`}
            >
              Public
            </button>
            <button
              type="button"
              onClick={() => setVisibility("private")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                visibility === "private"
                  ? "bg-[#5865f2] text-white"
                  : "bg-[#1e1f22] text-gray-400 hover:text-gray-200"
              }`}
            >
              Private
            </button>
          </div>

          {/* Member selection for private channels */}
          {visibility === "private" && (
            <div className="mt-3">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-400">
                Members ({selectedUsers.size} selected)
              </label>
              {loadingUsers ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-[#5865f2]" />
                </div>
              ) : (
                <div className="scroll-area max-h-32 overflow-y-auto rounded-md bg-[#1e1f22] p-2">
                  {allUsers.length === 0 ? (
                    <p className="py-2 text-center text-xs text-gray-500">No approved users</p>
                  ) : (
                    allUsers.map((u) => (
                      <label
                        key={u.username}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-[#35373c]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(u.username)}
                          onChange={() => toggleUser(u.username)}
                          className="accent-[#5865f2]"
                        />
                        <span className="text-sm text-gray-300">{u.username}</span>
                        {u.role === "admin" && (
                          <span className="text-[10px] text-[#faa61a]">ADMIN</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#5865f2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
            >
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
