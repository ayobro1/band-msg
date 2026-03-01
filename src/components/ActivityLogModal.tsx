"use client";

import { useEffect, useState } from "react";
import { AuditLog } from "@/lib/types";

interface ActivityLogModalProps {
  onClose: () => void;
}

export default function ActivityLogModal({ onClose }: ActivityLogModalProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/admin/audit?limit=150");
        if (!res.ok) {
          throw new Error("Failed to load activity log");
        }
        const data = (await res.json()) as AuditLog[];
        if (!cancelled) {
          setLogs(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load activity log.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadLogs();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content w-full max-w-2xl rounded-lg bg-[#313338] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Activity Log</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close activity log">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="rounded bg-[#1e1f22] px-3 py-3 text-sm text-gray-400">Loading activity…</div>
        ) : error ? (
          <div className="rounded bg-[#1e1f22] px-3 py-3 text-sm text-red-300">{error}</div>
        ) : logs.length === 0 ? (
          <div className="rounded bg-[#1e1f22] px-3 py-3 text-sm text-gray-400">No activity recorded yet.</div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-auto pr-1">
            {logs.map((log) => (
              <div key={log.id} className="rounded bg-[#1e1f22] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-gray-200">
                    <span className="font-semibold text-white">{log.actor}</span> {log.action.replaceAll("_", " ")} {log.target_type}:{" "}
                    <span className="font-mono text-gray-300">{log.target_id}</span>
                  </p>
                  <span className="shrink-0 text-xs text-gray-500">{new Date(log.created).toLocaleString()}</span>
                </div>
                {log.details && <p className="mt-1 text-xs text-gray-400">{log.details}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end">
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
