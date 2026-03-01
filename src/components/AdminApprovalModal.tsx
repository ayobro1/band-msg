"use client";

import { useEffect, useState } from "react";
import { AuthUser } from "@/lib/types";

interface AdminApprovalModalProps {
  onClose: () => void;
}

export default function AdminApprovalModal({ onClose }: AdminApprovalModalProps) {
  const [pendingUsers, setPendingUsers] = useState<AuthUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<{ username: string; role: "admin" | "member" }[]>([]);
  const [currentUsername, setCurrentUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/users/approved"),
      ]);

      if (!pendingRes.ok) {
        const data = await pendingRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load pending users");
      }

      if (!approvedRes.ok) {
        const data = await approvedRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load approved users");
      }

      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const me: AuthUser = await meRes.json();
        setCurrentUsername(me.username);
      }

      const pendingData: AuthUser[] = await pendingRes.json();
      const approvedData: { username: string; role: "admin" | "member" }[] = await approvedRes.json();

      setPendingUsers(pendingData);
      setApprovedUsers(approvedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const approve = async (username: string) => {
    try {
      const res = await fetch("/api/admin/users/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Approval failed");
      }
      const approved: AuthUser = await res.json();
      setPendingUsers((prev) => prev.filter((user) => user.username !== username));
      setApprovedUsers((prev) => {
        if (prev.some((user) => user.username === approved.username)) {
          return prev;
        }
        return [...prev, { username: approved.username, role: approved.role }].sort((a, b) =>
          a.username.localeCompare(b.username)
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const promote = async (username: string) => {
    try {
      const res = await fetch("/api/admin/users/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Promotion failed");
      }

      setApprovedUsers((prev) =>
        prev
          .map((user) => (user.username === username ? { ...user, role: "admin" as const } : user))
          .sort((a, b) => a.username.localeCompare(b.username))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promotion failed");
    }
  };

  const demote = async (username: string) => {
    const ok = window.confirm(`Demote ${username} to member?`);
    if (!ok) return;

    try {
      const res = await fetch("/api/admin/users/demote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Demotion failed");
      }

      setApprovedUsers((prev) =>
        prev
          .map((user) => (user.username === username ? { ...user, role: "member" as const } : user))
          .sort((a, b) => a.username.localeCompare(b.username))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demotion failed");
    }
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
          <h2 className="text-xl font-bold text-white">User Management</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-400">Loading pending users...</div>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Pending Accounts
              </h3>
              {pendingUsers.length === 0 ? (
                <div className="rounded bg-[#1e1f22] px-3 py-2 text-sm text-gray-400">
                  No pending accounts right now.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingUsers.map((user) => (
                    <div key={user.username} className="flex items-center justify-between rounded bg-[#1e1f22] px-3 py-2">
                      <span className="text-sm text-gray-200">{user.username}</span>
                      <button
                        onClick={() => approve(user.username)}
                        className="rounded bg-[#23a55a] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1f944f]"
                      >
                        Approve
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Approved Users
              </h3>
              {approvedUsers.length === 0 ? (
                <div className="rounded bg-[#1e1f22] px-3 py-2 text-sm text-gray-400">
                  No approved users found.
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-auto pr-1">
                  {approvedUsers.map((user) => (
                    <div key={user.username} className="flex items-center justify-between rounded bg-[#1e1f22] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-200">{user.username}</p>
                        <p className="text-xs text-gray-500">{user.role === "admin" ? "Admin" : "Member"}</p>
                      </div>
                      {user.role === "member" ? (
                        <button
                          onClick={() => promote(user.username)}
                          className="rounded bg-[#5865f2] px-3 py-1 text-xs font-semibold text-white hover:bg-[#4752c4]"
                        >
                          Make Admin
                        </button>
                      ) : user.username !== currentUsername ? (
                        <button
                          onClick={() => demote(user.username)}
                          className="rounded bg-[#a12828] px-3 py-1 text-xs font-semibold text-white hover:bg-[#8f2020]"
                        >
                          Demote
                        </button>
                      ) : (
                        <span className="rounded bg-[#35373c] px-2 py-1 text-[11px] font-semibold text-gray-300">
                          Admin
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={loadUsers}
            className="mr-2 rounded px-3 py-1.5 text-sm text-gray-300 hover:text-white"
          >
            Refresh
          </button>
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
