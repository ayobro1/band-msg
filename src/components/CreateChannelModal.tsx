"use client";

import { useState, FormEvent, useEffect } from "react";

interface CreateChannelModalProps {
  onSubmit: (name: string, description: string) => void;
  onClose: () => void;
}

export default function CreateChannelModal({
  onSubmit,
  onClose,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

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
    onSubmit(trimmed, description.trim());
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
          {error && (
            <p className="mt-1 text-xs text-red-400">{error}</p>
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
