"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PracticeDay } from "@/lib/types";

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parse an ISO date string (YYYY-MM-DD) at noon to avoid timezone shifts. */
function parseDateAtNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DashboardPage() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [practiceDays, setPracticeDays] = useState<PracticeDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesModal, setNotesModal] = useState<{ date: string; notes: string } | null>(null);

  const todayStr = toIsoDate(today.getFullYear(), today.getMonth(), today.getDate());

  const fetchDays = useCallback(async () => {
    const from = toIsoDate(year, month, 1);
    const to = toIsoDate(year, month, getDaysInMonth(year, month));
    try {
      const res = await fetch(`/api/practice?from=${from}&to=${to}`);
      if (res.status === 401 || res.status === 403) {
        router.push("/");
        return;
      }
      if (res.ok) {
        const data: PracticeDay[] = await res.json();
        setPracticeDays(data);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, router]);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  const toggleDay = async (dateStr: string) => {
    const existing = practiceDays.find((d) => d.date === dateStr);
    if (existing) {
      await fetch(`/api/practice/${existing.id}`, { method: "DELETE" });
      setPracticeDays((prev) => prev.filter((d) => d.id !== existing.id));
    } else {
      setNotesModal({ date: dateStr, notes: "" });
    }
  };

  const confirmAddDay = async () => {
    if (!notesModal) return;
    const res = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: notesModal.date, notes: notesModal.notes }),
    });
    if (res.ok) {
      const day: PracticeDay = await res.json();
      setPracticeDays((prev) => [...prev.filter((d) => d.date !== day.date), day].sort((a, b) => a.date.localeCompare(b.date)));
    }
    setNotesModal(null);
  };

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const practiceSet = new Set(practiceDays.map((d) => d.date));
  const practiceMap = new Map(practiceDays.map((d) => [d.date, d]));

  const upcomingDays = practiceDays
    .filter((d) => d.date >= todayStr)
    .slice(0, 5);

  return (
    <div className="min-h-dvh bg-[#313338] text-gray-300">
      {/* Header */}
      <div className="flex h-14 items-center border-b border-[#1e1f22] bg-[#2b2d31] px-4 shadow-sm">
        <button
          onClick={() => router.push("/")}
          className="mr-3 flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-[#404249] hover:text-white"
          aria-label="Back to chat"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5865f2] mr-2">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-white">Practice Dashboard</h1>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Calendar */}
        <div className="rounded-xl bg-[#2b2d31] p-4 shadow ring-1 ring-white/5">
          {/* Month nav */}
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[#404249] hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-semibold text-white">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[#404249] hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
            {DAY_NAMES.map((d) => <div key={d}>{d}</div>)}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#5865f2]" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = toIsoDate(year, month, day);
                const isPractice = practiceSet.has(dateStr);
                const isToday = dateStr === todayStr;
                const pd = practiceMap.get(dateStr);
                return (
                  <button
                    key={day}
                    onClick={() => toggleDay(dateStr)}
                    title={pd?.notes || undefined}
                    className={`relative flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors
                      ${isPractice
                        ? "bg-[#5865f2] text-white hover:bg-[#4752c4]"
                        : isToday
                          ? "ring-2 ring-[#5865f2] text-white hover:bg-[#404249]"
                          : "text-gray-300 hover:bg-[#404249]"
                      }`}
                  >
                    {day}
                    {isPractice && (
                      <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/60" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-center text-xs text-gray-500">Tap a day to mark/unmark as practice</p>
        </div>

        {/* Upcoming practice days */}
        <div className="mt-6 rounded-xl bg-[#2b2d31] p-4 shadow ring-1 ring-white/5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Upcoming Practice Days
          </h2>
          {upcomingDays.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming practice days scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingDays.map((d) => {
                const dt = parseDateAtNoon(d.date);
                return (
                  <li key={d.id} className="flex items-center gap-3 rounded-lg bg-[#383a40] px-3 py-2">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-[#5865f2] text-white">
                      <span className="text-[10px] font-semibold uppercase">{MONTH_NAMES[dt.getMonth()].slice(0, 3)}</span>
                      <span className="text-lg font-bold leading-none">{dt.getDate()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                      </p>
                      {d.notes && <p className="text-xs text-gray-400">{d.notes}</p>}
                    </div>
                    <button
                      onClick={() => toggleDay(d.date)}
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-[#404249] hover:text-red-400"
                      title="Remove"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Notes modal */}
      {notesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-[#2b2d31] p-5 shadow-xl ring-1 ring-white/10">
            <h3 className="mb-1 text-base font-semibold text-white">Add Practice Day</h3>
            <p className="mb-3 text-sm text-gray-400">{parseDateAtNoon(notesModal.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
            <textarea
              className="w-full resize-none rounded-lg bg-[#383a40] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-[#5865f2]"
              placeholder="Notes (optional)"
              rows={3}
              value={notesModal.notes}
              onChange={(e) => setNotesModal({ ...notesModal, notes: e.target.value })}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setNotesModal(null)}
                className="flex-1 rounded-lg bg-[#383a40] px-4 py-2 text-sm font-medium text-gray-300 hover:bg-[#404249]"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddDay}
                className="flex-1 rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752c4]"
              >
                Add Practice Day
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
