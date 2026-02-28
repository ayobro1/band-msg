"use client";

import { useEffect, useState } from "react";
import { AuthUser } from "@/lib/types";

interface AdminApprovalModalProps {
  onClose: () => void;
}

export default function AdminApprovalModal({ onClose }: AdminApprovalModalProps) {
  const [pendingUsers, setPendingUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPendingUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load pending users");
      }
      const data: AuthUser[] = await res.json();
      setPendingUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingUsers();
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
      setPendingUsers((prev) => prev.filter((user) => user.username !== username));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
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
          <h2 className="text-xl font-bold text-white">Pending Account Approvals</h2>
          <button onClick={onClose} className="text-gray-400 transition-colors hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-400">Loading pending users...</div>
        ) : pendingUsers.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">No pending accounts right now.</div>
        ) : (
          <div className="space-y-2">
            {pendingUsers.map((user) => (
              <div key={user.username} className="flex items-center justify-between rounded bg-[#1e1f22] px-3 py-2">
                <span className="text-sm text-gray-200">{user.username}</span>
                <button
                  onClick={() => approve(user.username)}
                  className="rounded bg-[#23a55a] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#1f944f]"
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={loadPendingUsers}
            className="mr-2 rounded px-3 py-1.5 text-sm text-gray-300 transition-colors hover:text-white"
          >
            Refresh
          </button>
          <button
            onClick={onClose}
            className="rounded bg-[#5865f2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
