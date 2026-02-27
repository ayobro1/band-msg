"use client";

import { useState, FormEvent, useEffect } from "react";

interface UsernameModalProps {
  onSubmit: (username: string) => void;
}

export default function UsernameModal({ onSubmit }: UsernameModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Focus the input on mount
    const timer = setTimeout(() => {
      document.getElementById("username-input")?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Username cannot be empty");
      return;
    }
    if (trimmed.length < 2) {
      setError("Username must be at least 2 characters");
      return;
    }
    if (trimmed.length > 20) {
      setError("Username must be 20 characters or less");
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="modal-content w-full max-w-md rounded-lg bg-[#313338] p-6 shadow-xl">
        <div className="mb-1 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#5865f2]">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Welcome to Band Chat!</h2>
          <p className="mt-2 text-sm text-gray-400">
            Choose a display name to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <label
            htmlFor="username-input"
            className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-400"
          >
            Display Name
          </label>
          <input
            id="username-input"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="Enter your name..."
            maxLength={20}
            className="w-full rounded-md bg-[#1e1f22] px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none ring-1 ring-transparent transition-all focus:ring-[#5865f2]"
          />
          {error && (
            <p className="mt-1 text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-[#5865f2] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
          >
            Join Chat
          </button>
        </form>
      </div>
    </div>
  );
}
