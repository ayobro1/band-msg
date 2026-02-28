"use client";

import { useEffect, useState } from "react";
import { getAvatarColor } from "@/lib/utils";

interface MemberListProps {
  currentUser: string;
}

export default function MemberList({ currentUser }: MemberListProps) {
  const [members, setMembers] = useState<string[]>([]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) {
          setMembers([]);
          return;
        }
        const data: unknown = await res.json();
        if (Array.isArray(data)) {
          setMembers(data.filter((value): value is string => typeof value === "string"));
        } else {
          setMembers([]);
        }
      } catch {
        setMembers([]);
      }
    };

    fetchMembers();
    const interval = setInterval(fetchMembers, 15000);
    return () => clearInterval(interval);
  }, []);

  // Always include current user
  const allMembers = Array.from(new Set([currentUser, ...members])).sort();

  return (
    <div className="flex h-full w-60 flex-col bg-[#2b2d31]">
      <div className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Online — {allMembers.length}
        </p>
        <div className="space-y-1">
          {allMembers.map((member) => (
            <div
              key={member}
              className="flex items-center gap-3 rounded px-2 py-1.5 transition-colors hover:bg-[#35373c]"
            >
              <div className="relative">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: getAvatarColor(member) }}
                >
                  {member.charAt(0).toUpperCase()}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#2b2d31] bg-[#23a55a]" />
              </div>
              <span className="truncate text-sm text-gray-300">
                {member}
                {member === currentUser && (
                  <span className="ml-1 text-xs text-gray-500">(you)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
