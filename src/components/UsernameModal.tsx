"use client";

import { useState, FormEvent, useEffect } from "react";
import { AuthUser } from "@/lib/types";

interface UsernameModalProps {
  onAuthenticated: (user: AuthUser) => void;
}

export default function UsernameModal({ onAuthenticated }: UsernameModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Focus the input on mount
    const timer = setTimeout(() => {
      document.getElementById("auth-username-input")?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Username cannot be empty");
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 20) {
      setError("Username must be 3-20 characters");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError("Username can only contain letters, numbers, _ and -");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setPendingMessage("");

    try {
      if (mode === "register") {
        const registerRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmed, password }),
        });

        if (!registerRes.ok) {
          const data = await registerRes.json().catch(() => ({}));
          throw new Error(data.error ?? "Registration failed");
        }

        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmed, password }),
        });

        if (loginRes.status === 403) {
          setPendingMessage("Account created. Waiting for admin approval before you can sign in.");
          setMode("login");
          return;
        }

        if (!loginRes.ok) {
          const data = await loginRes.json().catch(() => ({}));
          throw new Error(data.error ?? "Login failed after registration");
        }

        const user: AuthUser = await loginRes.json();
        onAuthenticated(user);
        return;
      }

      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed, password }),
      });

      if (!loginRes.ok) {
        const data = await loginRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Invalid credentials");
      }

      const user: AuthUser = await loginRes.json();
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
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
          <h2 className="text-2xl font-bold text-white">Secure Sign In</h2>
          <p className="mt-2 text-sm text-gray-400">
            {mode === "login"
              ? "Sign in with your approved account"
              : "Create an account and wait for admin approval"}
          </p>
        </div>

        <div className="mt-5 flex gap-2 rounded-md bg-[#1e1f22] p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
              mode === "login" ? "bg-[#5865f2] text-white" : "text-gray-300 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
            }}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
              mode === "register" ? "bg-[#5865f2] text-white" : "text-gray-300 hover:text-white"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <label
            htmlFor="auth-username-input"
            className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-400"
          >
            Username
          </label>
          <input
            id="auth-username-input"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError("");
              setPendingMessage("");
            }}
            placeholder="your-username"
            maxLength={20}
            className="w-full rounded-md bg-[#1e1f22] px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none ring-1 ring-transparent focus:ring-[#5865f2]"
          />

          <label
            htmlFor="auth-password-input"
            className="mb-2 mt-4 block text-xs font-bold uppercase tracking-wide text-gray-400"
          >
            Password
          </label>
          <input
            id="auth-password-input"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
              setPendingMessage("");
            }}
            placeholder="At least 8 characters"
            minLength={8}
            maxLength={100}
            className="w-full rounded-md bg-[#1e1f22] px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none ring-1 ring-transparent focus:ring-[#5865f2]"
          />

          {pendingMessage && <p className="mt-2 text-xs text-yellow-300">{pendingMessage}</p>}
          {error && (
            <p className="mt-1 text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 w-full rounded-md bg-[#5865f2] py-2.5 text-sm font-medium text-white hover:bg-[#4752c4] disabled:opacity-60"
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
